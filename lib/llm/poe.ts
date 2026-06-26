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

const POE_URL = 'https://api.poe.com/v1/chat/completions';

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
}

export interface PoeChatOptions {
  messages: PoeMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  retries?: number;
  signal?: AbortSignal;
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
    // Fresh 90s ceiling per attempt so a hung Poe request can't stall the run
    // forever. Caller-supplied signal takes precedence if given.
    const signal = opts.signal ?? AbortSignal.timeout(90_000);
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
        throw new Error(`Poe ${res.status}: ${body.slice(0, 300)}`);
      }

      const json: any = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? '';
      const u = json?.usage;
      return {
        content,
        model,
        latencyMs: Date.now() - started,
        usage: u
          ? { prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens }
          : undefined,
      };
    } catch (err) {
      lastErr = err;
      // Network errors / aborts: retry a couple times, then surface.
      if (attempt < retries) {
        await sleep(2 ** attempt * 800 + Math.floor(Math.random() * 400));
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

  // 1. Strip ```json ... ``` or ``` ... ``` fences.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;

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
    throw new Error(`Could not parse JSON from LLM output: ${text.slice(0, 200)}…`);
  }
}
