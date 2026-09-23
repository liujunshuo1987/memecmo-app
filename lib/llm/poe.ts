// Modern Poe client (OpenAI-compatible endpoint) for the agent system.
//
// The legacy lib/poe-client.ts targets the old `/api/query` endpoint with stale
// bot names ('GPT4', 'Claude3Opus') and is wired into older routes — left
// untouched on purpose. New agent code uses this module.
//
// Endpoint verified working: POST https://api.poe.com/v1/chat/completions
// with `Authorization: Bearer <POE_API_KEY>`, model e.g. "Claude-Sonnet-4.5",
// standard OpenAI response shape (choices[0].message.content).
//
// NOTE: on the dev machine local DNS poisons api.poe.com — plain fetch fails
// locally but works fine on Vercel (no poisoning there). Don't "fix" that by
// hard-coding IPs.

import { AsyncLocalStorage } from 'node:async_hooks';

const POE_URL = 'https://api.poe.com/v1/chat/completions';

// Thrown when the upstream account is out of capacity (HTTP 402 /
// insufficient_quota). This is a DETERMINISTIC failure — nothing about a
// retry changes it — so callers running under a durable executor must convert
// it to a non-retriable failure. On 2026-09-07 the same 402 was retried at the
// step level three times per run, holding clients at 75% for eight minutes.
export class EngineCapacityError extends Error {
  readonly nonRetriable = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'EngineCapacityError';
  }
}
export const isCapacityError = (e: unknown): e is EngineCapacityError => e instanceof EngineCapacityError;

// An engine is unreachable for reasons a retry cannot fix inside this run:
// the upstream bot is retired (2026-09-16: Poe removed Gemini-2.5-Pro — every
// scan on every project failed, and full_scan re-ran all five engines three
// times before giving up), or it answers 5xx for the whole batch. Fail fast,
// once, with the cause named.
export class EngineOutageError extends Error {
  readonly nonRetriable = true as const;
  constructor(message: string, readonly engines: string[] = []) {
    super(message);
    this.name = 'EngineOutageError';
  }
}
// The model stopped because it hit max_tokens: the JSON is cut mid-string and
// a retry would produce the same cut, so this is deterministic (no replay,
// no triple billing). Raise the caller's budget instead — see
// outputTokenBudget() in lib/markets.ts for the per-language sizing.
export class TruncatedOutputError extends Error {
  nonRetriable = true;
  constructor(purpose: string) {
    super(`${purpose}: the AI model hit its output limit and the result is truncated. The operator has been notified; re-run after the budget is raised.`);
    this.name = 'TruncatedOutputError';
  }
}
export function assertComplete(res: PoeResult, purpose: string): void {
  if (res.finishReason === 'length') {
    console.error(`[engine-adapter] ${purpose}: finish_reason=length (output truncated, ${res.usage?.completion ?? '?'} completion tokens)`);
    throw new TruncatedOutputError(purpose);
  }
}

export const isNonRetriable = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as any).nonRetriable === true;

// Per-run token meter. agent_runs has carried tokens_in / tokens_out columns
// since June and NOTHING wrote them — 0 of 49 runs in Aug–Sep had a token
// count, which is why the September capacity exhaustion arrived with no
// warning: there was no consumption signal to alarm on. Every poeChat call
// inside `runMeter.run(meter, fn)` accumulates here without per-agent plumbing.
// byModel matters for cost: the four bots we run are priced very differently
// (Claude output is ~15x Perplexity's), so a single total cannot be costed.
export interface ModelUsage { promptTokens: number; completionTokens: number; calls: number }
export interface UsageMeter extends ModelUsage { byModel: Record<string, ModelUsage> }
export const runMeter = new AsyncLocalStorage<UsageMeter>();
export const newMeter = (): UsageMeter => ({ promptTokens: 0, completionTokens: 0, calls: 0, byModel: {} });

export type PoeRole = 'system' | 'user' | 'assistant';
export interface PoeMessage {
  role: PoeRole;
  content: string;
}

export interface PoeResult {
  content: string;
  model: string;
  usage?: { prompt: number; completion: number; total: number };
  latencyMs: number;
  /** OpenAI-style finish reason from the upstream ('stop' | 'length' | …). */
  finishReason?: string;
}

export interface PoeChatOptions {
  messages: PoeMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  retries?: number;
  signal?: AbortSignal;
  /** Per-attempt ceiling. Default scales with maxTokens (see poeChat). */
  timeoutMs?: number;
}

// Vercel kills the function at 300s (app/api/inngest maxDuration), so the
// whole call — every attempt plus backoff — must finish inside this budget.
const CALL_BUDGET_MS = 285_000;

// A fixed 90s ceiling was right for judge calls (≤1.8k tokens) and wrong for
// long deliverables: a Chinese report at maxTokens 6000 needs ~2 min of
// generation, so it timed out three times in a row (2026-09-23, 284s total,
// tokens billed thrice). Scale the ceiling with the output the caller asked
// for: ~35ms per token + 30s overhead, floor 90s, cap 250s.
function defaultTimeoutMs(maxTokens: number): number {
  return Math.min(250_000, Math.max(90_000, 30_000 + maxTokens * 35));
}

export const DEFAULT_MODEL = 'Claude-Sonnet-4.5';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Single chat completion against Poe, with bounded retry on 429/5xx/network.
export async function poeChat(opts: PoeChatOptions): Promise<PoeResult> {
  const key = process.env.POE_API_KEY;
  if (!key) throw new Error('POE_API_KEY is not set');

  const model = opts.model ?? DEFAULT_MODEL;
  const retries = opts.retries ?? 2;
  const started = Date.now();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Fresh ceiling per attempt so a hung Poe request can't stall the run
    // forever. Caller-supplied signal takes precedence if given.
    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs(opts.maxTokens ?? 2048);
    const signal = opts.signal ?? AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetch(POE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          max_tokens: opts.maxTokens ?? 2048,
          temperature: opts.temperature ?? 0.7,
        }),
        signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < retries) {
          await sleep(2 ** attempt * 800 + Math.floor(Math.random() * 400));
          continue;
        }
        // Full detail to server logs only — thrown messages surface in
        // client-visible run summaries, which must not leak the upstream
        // provider (subprocessor hygiene).
        console.error(`[engine-adapter] upstream ${res.status}: ${body.slice(0, 300)}`);
        if (res.status === 402 || body.includes('insufficient_quota')) {
          throw new EngineCapacityError('AI engine capacity exhausted for this billing period — the operator has been notified. Please retry later.');
        }
        const e: any = new Error(`AI engine request failed (${res.status}). Please retry; if it persists, contact support.`);
        e.status = res.status;
        throw e;
      }

      const json: any = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? '';
      const u = json?.usage;
      const meter = runMeter.getStore();
      if (meter) {
        const pin = Number(u?.prompt_tokens ?? 0), pout = Number(u?.completion_tokens ?? 0);
        meter.calls += 1; meter.promptTokens += pin; meter.completionTokens += pout;
        const m = (meter.byModel[model] ??= { promptTokens: 0, completionTokens: 0, calls: 0 });
        m.calls += 1; m.promptTokens += pin; m.completionTokens += pout;
      }
      return {
        content,
        model,
        finishReason: json?.choices?.[0]?.finish_reason ?? undefined,
        latencyMs: Date.now() - started,
        usage: u
          ? { prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens }
          : undefined,
      };
    } catch (err) {
      lastErr = err;
      if (isNonRetriable(err)) throw err; // deterministic — never retry
      // Network errors / aborts: retry a couple times, then surface — but only
      // while another full attempt still fits in the function's time budget;
      // otherwise the platform kills the invocation mid-retry and the step is
      // replayed from scratch anyway.
      const backoff = 2 ** attempt * 800 + Math.floor(Math.random() * 400);
      if (attempt < retries && Date.now() - started + backoff + timeoutMs <= CALL_BUDGET_MS) {
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Poe request failed');
}

// Parse a JSON object out of an LLM response that may be fenced in ```json
// blocks or have prose around it. Throws with the raw text on hard failure so
// the run fails loudly rather than silently degrading.
export function parseJsonFromLLM<T = unknown>(text: string): T {
  const trimmed = text.trim();

  // 1. Strip ```json ... ``` or ``` ... ``` fences — including an UNCLOSED
  // opening fence (truncated output was the #1 real-world parse failure:
  // CREAO's optimize run died on `\`\`\`json {...` cut off mid-object).
  //
  // The outer fence must be matched GREEDILY (to the LAST closing fence): a
  // Markdown article or distribution draft inside the JSON routinely carries
  // its own ```json schema example, and the lazy match used to cut the
  // candidate at that inner fence (NeuronSpark optimize + distribute, 2026-09-23).
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*)```\s*$/i) ?? trimmed.match(/```(?:json)?\s*([\s\S]*)```/i);
  const unclosed = !fence && /^```(?:json)?/i.test(trimmed)
    ? trimmed.replace(/^```(?:json)?\s*/i, '')
    : null;
  const raw = fence ? fence[1].trim() : (unclosed ?? trimmed);

  const attempt = (c: string): T | undefined => { try { return JSON.parse(c) as T; } catch { return undefined; } };
  const direct = attempt(raw);
  if (direct !== undefined) return direct;
  // 1b. Repair the two habitual model mistakes inside string literals — raw
  // line breaks / tabs instead of \n \t, and Markdown escapes (\* \_ \#)
  // that are not legal JSON escapes — then try again. Structure untouched.
  const candidate = repairJsonStrings(raw);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // 2. Fall back to the first {...} or [...] span.
    const objStart = candidate.indexOf('{');
    const arrStart = candidate.indexOf('[');
    const start =
      objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
    const lastObj = candidate.lastIndexOf('}');
    const lastArr = candidate.lastIndexOf(']');
    const end = Math.max(lastObj, lastArr);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    // 3. Truncation salvage: largest balanced prefix (string-aware brace scan).
    if (start !== -1) {
      let depth = 0, inStr = false, esc = false, lastBalanced = -1;
      for (let i = start; i < candidate.length; i++) {
        const ch = candidate[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; if (depth === 0) lastBalanced = i; }
      }
      if (lastBalanced > start) {
        try {
          return JSON.parse(candidate.slice(start, lastBalanced + 1)) as T;
        } catch { /* fall through */ }
      }
      // 3b. Top-level object never closed (cut mid-string / mid-value): close
      // the open string, drop a dangling key or comma, close every open
      // bracket. Partial but valid beats nothing — and the caller's
      // assertComplete() already refused finish_reason=length upstream.
      const closed = closeTruncatedJson(candidate.slice(start));
      if (closed) { try { return JSON.parse(closed) as T; } catch { /* fall through */ } }
    }
    // Diagnosis to server logs: where the parser gave up, with context.
    let where = '';
    try { JSON.parse(candidate); } catch (e) {
      const m = /position (\d+)/.exec(e instanceof Error ? e.message : String(e));
      const pos = m ? Number(m[1]) : -1;
      where = e instanceof Error ? e.message : String(e);
      if (pos >= 0) console.error(`[parseJsonFromLLM] ${where} — context: …${candidate.slice(Math.max(0, pos - 160), pos)}⟦HERE⟧${candidate.slice(pos, pos + 120)}…`);
      else console.error(`[parseJsonFromLLM] ${where}`);
    }
    throw new Error(`Could not parse JSON from LLM output${where ? ` (${where})` : ''}: ${text.slice(0, 200)}…`);
  }
}

// Close a truncated JSON document: terminate an open string, remove a
// dangling `"key":` or trailing comma, then close open brackets innermost-first.
export function closeTruncatedJson(src: string): string | null {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (!stack.length) return null;
  let out = src;
  if (inStr) out += '"';
  out = out.replace(/\s+$/, '');
  out = out.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*("(?:[^"\\]|\\.)*")?\s*$/, (m, val) => (val ? m : '')); // dangling key (value absent) → drop
  out = out.replace(/,\s*$/, '');
  return out + stack.reverse().join('');
}

// Repair the habitual model mistakes INSIDE JSON string literals without
// touching structure: raw control characters (newline/tab), illegal
// Markdown escapes (\* \_ \%), and — the one that killed NeuronSpark's
// content run twice on 2026-09-23 — unescaped double quotes inside a value
// (a JSON-LD example like "@type": "FAQPage" pasted into the article). A
// quote is a real terminator only if what follows fits the JSON context: a
// key must be followed by ':'; a value by ',' '}' ']' or end — and after a
// ',' the next token must actually look like a key (in an object) or a
// value (in an array). Anything else is an inner quote and gets escaped.
export function repairJsonStrings(src: string): string {
  let out = '';
  const stack: { obj: boolean; expectKey: boolean }[] = [];
  let inStr = false, isKey = false;
  const top = () => stack[stack.length - 1];
  const nextNonWs = (i: number) => { while (i < src.length && /\s/.test(src[i])) i++; return i; };
  const looksLikeKey = (i: number) => /^"(?:[^"\\]|\\.)*"\s*:/.test(src.slice(i, i + 400));
  const looksLikeValue = (i: number) => /^(?:"|-?\d|\{|\[|true|false|null)/.test(src.slice(i, i + 8));
  const terminates = (i: number): boolean => {
    const j = nextNonWs(i + 1);
    if (j >= src.length) return true;
    const c = src[j];
    if (isKey) return c === ':';
    if (c === '}' || c === ']') return true;
    if (c === ',') {
      const k = nextNonWs(j + 1);
      if (k >= src.length) return true;
      const t = top();
      if (!t) return true;
      return t.obj ? looksLikeKey(k) : looksLikeValue(k);
    }
    return false;
  };
  // Embedded JSON-like snippet inside a value ({"@type": …} / ["a", …]):
  // while its braces are open, no quote can be the string's terminator.
  let inner = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!inStr) {
      out += ch;
      if (ch === '{') stack.push({ obj: true, expectKey: true });
      else if (ch === '[') stack.push({ obj: false, expectKey: false });
      else if (ch === '}' || ch === ']') stack.pop();
      else if (ch === ':') { const t = top(); if (t) t.expectKey = false; }
      else if (ch === ',') { const t = top(); if (t) t.expectKey = t.obj; }
      else if (ch === '"') { inStr = true; inner = 0; const t = top(); isKey = !!t && t.obj && t.expectKey; }
      continue;
    }
    if (ch === '{' && /^\{\s*"/.test(src.slice(i, i + 12))) inner++;
    else if (ch === '[' && /^\[\s*(?:"|\{|-?\d)/.test(src.slice(i, i + 12))) inner++;
    else if ((ch === '}' || ch === ']') && inner > 0) inner--;
    if (ch === '"') {
      if (inner === 0 && terminates(i)) { out += ch; inStr = false; continue; }
      out += '\\"'; continue; // inner quote
    }
    if (ch === '\\') {
      const nx = src[i + 1];
      if (nx === '"' || nx === '\\' || nx === '/' || nx === 'b' || nx === 'f' || nx === 'n' || nx === 'r' || nx === 't') { out += ch + nx; i++; continue; }
      if (nx === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) { out += src.slice(i, i + 6); i += 5; continue; }
      out += '\\\\'; continue; // lone backslash (\*, \_, \#, trailing) → escaped backslash
    }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') { out += '\\r'; continue; }
    if (ch === '\t') { out += '\\t'; continue; }
    const code = ch.charCodeAt(0);
    if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue; }
    out += ch;
  }
  return out;
}
