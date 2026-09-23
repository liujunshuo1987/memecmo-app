// Monitor Agent (v0.8 — deep multi-engine AIGVR measurement)
//
// Takes the Discovery prompt set and runs a stage-balanced sample against the
// real AI answer engines (ChatGPT / Gemini / Perplexity / Claude) via Poe.
// For each answer a judge pass scores how the brand appears, and competitors
// are extracted from the answers themselves (self-calibrating). It aggregates
// the AIGVR five-dimension index into a 0-100 score:
//   presence · prominence · sentiment · citation · competitive share
// plus per-engine and per-funnel-stage breakdowns, a competitor benchmark, and
// the high-intent gap list (queries where competitors appear and the brand
// doesn't). This is the measurement that turns prompts into a deliverable.

import { poeChat, parseJsonFromLLM, EngineCapacityError, EngineOutageError, isCapacityError } from '@/lib/llm/poe';
import { fetchGoogleAio, localeFor } from './serp';
import { classifyIntent, type PromptIntent } from './intent';

type EventEmitter = (event: {
  event_type:
    | 'log'
    | 'tool_call'
    | 'tool_result'
    | 'progress'
    | 'output_chunk'
    | 'error'
    | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

interface PromptCategory {
  category: string;
  label: string;
  prompts: string[];
}

interface MonitorInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  promptSet: PromptCategory[];
  keyPrompts?: string[];
  knownCompetitors?: string[];
  // Frozen competitor set (score stability): reused for 30 days, then
  // re-identified. Persisted on the project by run.ts.
  competitorSet?: CompetitorSet | null;
  // Per-plan sampling cap (billing lever). Defaults to SAMPLE_CAP.
  sampleCap?: number;
  // Engine subset (billing lever / trial preview). Keys from ENGINES +
  // 'google_aio'; omitted → all available engines.
  engineKeys?: string[];
  // Resolved by resolveEngineModels() in the run preflight — a live primary
  // or fallback per engine key. Absent → the static primary.
  engineModels?: Record<string, string>;
  // Diagnostic mode: a missing engine does not fail the scan. The scorecard is
  // marked partial (with the missing engines and their causes) and callers
  // must keep it out of the trend line. Never set for scheduled runs.
  allowPartial?: boolean;
  // Standard answers library (B2) — enables the answer-accuracy pass: is what
  // AI actually says CORRECT vs the canonical answer? (support-cost signal)
  standardAnswers?: { prompt: string; local?: string; en?: string }[];
}

// relationship (Javvo entity-resolution spec): only 'competitor' enters SoV /
// benchmark / gap math. Partners, directories and self STAY in the set — their
// aliases keep folding and a set refresh carries the tag forward, so a marked
// partner is never re-discovered as a competitor.
export type CompetitorRelationship = 'competitor' | 'partner' | 'directory' | 'self';
export interface CompetitorGroup { canonical: string; aliases: string[]; relationship?: CompetitorRelationship }
export interface CompetitorSet { groups: CompetitorGroup[]; refreshedAt: string }

const COMPETITOR_SET_TTL_MS = 30 * 24 * 3600 * 1000;

// The AI answer engines we measure. Poe engines proxy the model APIs; the
// Google AI Overview engine (kind 'serp') is the REAL Google surface — added at
// runtime only when SERPAPI_KEY is configured.
type EngineKind = 'poe' | 'serp';
// `fallbacks` are bots verified live on Poe that can stand in when the primary
// is retired or down. The engine LABEL (what the client sees, what the trend
// line is keyed on) never changes; the model behind it is recorded on every
// scorecard so a model change is visible as a methodology note, never hidden.
export interface Engine { key: string; label: string; model: string; kind: EngineKind; fallbacks?: string[] }
export const ENGINES: Engine[] = [
  { key: 'chatgpt', label: 'ChatGPT', model: 'GPT-4o', kind: 'poe' },
  // Gemini-2.5-Pro was retired by Poe between 2026-09-14 and 2026-09-16 (500
  // "Server got itself in trouble", absent from /v1/models). 3.1-Pro is the
  // only Pro-class Gemini left; 3.5-Flash is the verified cheaper stand-in.
  { key: 'gemini', label: 'Gemini', model: 'Gemini-3.1-Pro', kind: 'poe', fallbacks: ['Gemini-3.5-Flash'] },
  { key: 'perplexity', label: 'Perplexity', model: 'Perplexity-Sonar', kind: 'poe' },
  { key: 'claude', label: 'Claude', model: 'Claude-Sonnet-4.5', kind: 'poe' },
];

// Minimum share of sampled prompts an engine must actually answer for its
// cell to be scored. Below this the engine is treated as down — a 60%-answered
// engine is not the same measurement as last week's 100%.
const ENGINE_MIN_ANSWER_RATE = 0.8;

/** One-token liveness probe of every Poe engine we are about to spend on.
 *  Returns the model to use per engine key (primary or a live fallback) and
 *  throws EngineOutageError — non-retriable — if any engine has no live
 *  model. Costs ~4 tokens; saves a 5-engine, 3-attempt, $15 dead run. */
export async function resolveEngineModels(
  engineKeys?: string[],
  opts: { tolerateDead?: boolean } = {},
): Promise<{ models: Record<string, string>; substituted: string[]; dead: string[] }> {
  const wanted = ENGINES.filter((e) => !engineKeys?.length || engineKeys.includes(e.key));
  const models: Record<string, string> = {};
  const substituted: string[] = [];
  const dead: string[] = [];
  await Promise.all(wanted.map(async (e) => {
    for (const candidate of [e.model, ...(e.fallbacks ?? [])]) {
      try {
        await poeChat({ model: candidate, messages: [{ role: 'user', content: 'ping' }], maxTokens: 1, retries: 0 });
        models[e.key] = candidate;
        if (candidate !== e.model) substituted.push(`${e.label}: ${e.model} → ${candidate}`);
        return;
      } catch (err) {
        if (isCapacityError(err)) throw err;           // account-level — surface as capacity
        // 5xx / 404 / network: try the next candidate
      }
    }
    dead.push(`${e.label} (${[e.model, ...(e.fallbacks ?? [])].join(', ')})`);
  }));
  if (dead.length && !opts.tolerateDead) {
    throw new EngineOutageError(
      `Engine unavailable upstream: ${dead.join('; ')}. No live model for this engine — the scan was not started so nothing was spent. ` +
      'This usually means the provider retired the model; update the engine table.',
      dead,
    );
  }
  return { models, substituted, dead: dead.map((d) => d.split(' (')[0]) };
}
const AIO_ENGINE: Engine = { key: 'google_aio', label: 'Google AI Overview', model: 'serpapi', kind: 'serp' };

// Sample size balances rigor (more n per stage×engine cell = less noisy %)
// against latency/cost. Engines run concurrently, so wall-time ≈ the slowest
// single engine, not the sum — keeps a single-invocation run under the ceiling.
const SAMPLE_CAP = 24;
const QUERY_CONCURRENCY = 5;     // per Poe engine (×4 engines in parallel ≈ 20 concurrent Poe calls)
const SERP_CONCURRENCY = 6;      // Google AI Overview via SerpApi
const SERP_TIMEOUT_MS = 30_000;  // bound the slowest engine: 24/6 × 30s ≈ 120s worst case

// AIGVR composite weights (sum = 1.0).
const WEIGHTS = { presence: 0.3, prominence: 0.25, sentiment: 0.15, citation: 0.1, competitiveShare: 0.2 };

// ── text utilities ───────────────────────────────────────────────────────────

// Lowercase + strip diacritics (so Vietnamese matches regardless of accents).
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Does `haystack` mention `name`? Matches the full name and its first-two-word
// short form (e.g. "Focus Media Vietnam" → also "focus media").
function mentions(haystack: string, name: string): boolean {
  const h = norm(haystack);
  const full = norm(name).trim();
  if (full.length >= 3 && h.includes(full)) return true;
  const words = full.split(/\s+/);
  if (words.length >= 2) {
    const short = words.slice(0, 2).join(' ');
    if (short.length >= 5 && h.includes(short)) return true;
  }
  return false;
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>)\]]+/gi;
  return Array.from(new Set((text.match(re) || []).map((u) => u.replace(/[.,;]+$/, ''))));
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function round(n: number): number {
  return Math.round(n);
}

type Sampled = { stage: string; label: string; prompt: string; key: boolean; intent: PromptIntent };

function normKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Merge name variants of the same company ("Chicilon Media" / "Chicilon
// Digital Media") into one canonical entry. Rule: two names merge when the
// word set of one is a subset of the other's (order-insensitive) — safe
// against false merges like "Golden Media" vs "Golden Screen" (neither is a
// subset). Canonical = the shortest variant (usually the base brand).
// Brand-name variants are excluded entirely.
function mergeVariants(names: string[], brandName: string): CompetitorGroup[] {
  const wordsOf = (s: string) => new Set(normKey(s).split(' ').filter(Boolean));
  const isSubset = (a: Set<string>, b: Set<string>) => {
    for (const w of a) if (!b.has(w)) return false;
    return true;
  };
  const brandW = wordsOf(brandName);
  const clean = names.filter((n) => {
    const w = wordsOf(n);
    return !(isSubset(w, brandW) || isSubset(brandW, w));
  });
  const sorted = [...clean].sort((x, y) => wordsOf(x).size - wordsOf(y).size || x.length - y.length);
  const groups: CompetitorGroup[] = [];
  for (const name of sorted) {
    const w = wordsOf(name);
    const g = groups.find((grp) => {
      const cw = wordsOf(grp.canonical);
      return isSubset(cw, w) || isSubset(w, cw);
    });
    if (g) {
      if (normKey(g.canonical) !== normKey(name)) g.aliases.push(name);
    } else {
      groups.push({ canonical: name, aliases: [] });
    }
  }
  return groups;
}

// Select up to `cap` prompts to measure. The 20 "key" prompts (FMVN §4.2) are
// ALWAYS included first (close monitoring — measured every scan); the rest of
// the budget is filled stage-balanced from the non-key library for breadth.
function selectSample(promptSet: PromptCategory[], keyPrompts: string[], cap: number): Sampled[] {
  const keySet = new Set((keyPrompts || []).map(normKey));
  const flat: Sampled[] = [];
  for (const c of promptSet) {
    for (const p of c.prompts || []) {
      flat.push({ stage: c.category || 'general', label: c.label || c.category || 'general', prompt: p, key: keySet.has(normKey(p)), intent: 'educational' });
    }
  }
  if (flat.length <= cap) return flat;

  const keyed = flat.filter((f) => f.key);
  const rest = flat.filter((f) => !f.key);
  const picked: Sampled[] = keyed.slice(0, cap); // all key prompts first

  // Fill remaining slots stage-balanced from non-key prompts.
  const byStage = new Map<string, Sampled[]>();
  for (const f of rest) {
    if (!byStage.has(f.stage)) byStage.set(f.stage, []);
    byStage.get(f.stage)!.push(f);
  }
  const queues = Array.from(byStage.values());
  let qi = 0;
  while (picked.length < cap && queues.some((q) => q.length)) {
    const q = queues[qi % queues.length];
    if (q.length) picked.push(q.shift()!);
    qi++;
  }
  return picked;
}

// ── competitor identification (from real answers, not a cold guess) ───────────

async function extractCompetitorsFromAnswers(
  answers: { text: string }[],
  input: MonitorInput,
): Promise<string[]> {
  let corpus = '';
  for (const a of answers) {
    if (corpus.length > 8000) break;
    corpus += a.text.slice(0, 800) + '\n---\n';
  }
  const res = await poeChat({
    messages: [
      { role: 'system', content: 'You extract entities. Output strict JSON only.' },
      {
        role: 'user',
        content:
          `Below are AI assistant answers to buyer questions about ` +
          `${input.industry || 'this industry'} in ${input.targetCountry}.\n\n` +
          `List the distinct competitor COMPANY/BRAND names that appear in these answers, ` +
          `EXCLUDING "${input.brandName}". Order by how frequently/prominently they appear. ` +
          `Use the exact names as written. Return ONLY a JSON array of 4-12 strings.\n\n` +
          `ANSWERS:\n${corpus}`,
      },
    ],
    maxTokens: 400,
    temperature: 0.2,
  });
  try {
    const arr = parseJsonFromLLM<string[]>(res.content);
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      if (typeof raw !== 'string') continue;
      const name = raw.trim();
      if (name.length < 2) continue;
      if (mentions(name, input.brandName) || mentions(input.brandName, name)) continue;
      const k = norm(name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(name);
    }
    return out.slice(0, 12);
  } catch {
    return [];
  }
}

// ── judge pass (prominence + sentiment) ──────────────────────────────────────

type Sentiment = 'positive' | 'neutral' | 'negative' | 'none';

interface Verdict {
  brandMentioned: boolean;
  prominence: number; // 0 absent · 1 passing · 2 one-of-several · 3 featured/top
  sentiment: Sentiment;
  competitors: string[];
}

// Batched judge over one engine's answers — one LLM call, indexed output.
async function judgeEngineAnswers(
  answers: { prompt: string; text: string }[],
  brand: string,
  competitors: string[],
): Promise<(Verdict | null)[]> {
  const items = answers
    .map((a, i) => `[${i}] Q: ${a.prompt}\nA: ${a.text.slice(0, 700)}`)
    .join('\n\n');
  const res = await poeChat({
    model: 'Claude-Sonnet-4.5',
    messages: [
      { role: 'system', content: 'You are a strict evaluator of brand visibility in AI answers. Output JSON only.' },
      {
        role: 'user',
        content:
          `Brand: "${brand}"\n` +
          `Competitors to track: ${competitors.length ? competitors.join(', ') : '(none)'}\n\n` +
          `For each numbered AI answer below, judge how the BRAND appears:\n` +
          `- brandMentioned: true/false\n` +
          `- prominence: 0 (absent), 1 (mentioned in passing), 2 (one of several options listed), 3 (featured / top recommendation)\n` +
          `- sentiment: "positive" | "neutral" | "negative" | "none" (none if not mentioned)\n` +
          `- competitors: array of the tracked competitor names that appear in THIS answer\n\n` +
          `Return ONLY a JSON array with one object per item: ` +
          `{"i": <index>, "brandMentioned": bool, "prominence": int, "sentiment": str, "competitors": [str]}.\n\n` +
          `ANSWERS:\n${items}`,
      },
    ],
    maxTokens: 1800,
    temperature: 0.1,
  });
  const out: (Verdict | null)[] = new Array(answers.length).fill(null);
  try {
    const arr = parseJsonFromLLM<any[]>(res.content);
    if (!Array.isArray(arr)) return out;
    for (const v of arr) {
      const i = typeof v?.i === 'number' ? v.i : -1;
      if (i < 0 || i >= answers.length) continue;
      const sent: Sentiment = ['positive', 'neutral', 'negative', 'none'].includes(v.sentiment) ? v.sentiment : 'none';
      out[i] = {
        brandMentioned: !!v.brandMentioned,
        prominence: Math.max(0, Math.min(3, Number(v.prominence) || 0)),
        sentiment: sent,
        competitors: Array.isArray(v.competitors) ? v.competitors.filter((x: unknown) => typeof x === 'string') : [],
      };
    }
  } catch {
    /* fall back to nulls → caller uses string-match */
  }
  return out;
}

// ── scoring ──────────────────────────────────────────────────────────────────

interface RawAnswer {
  engine: string;
  stage: string;
  intent: PromptIntent;
  prompt: string;
  key: boolean;
  text: string;
  brandPresentStr: boolean; // string-match fallback
  citations: string[];
  brandCited: boolean;
}

interface Sample {
  engine: string;
  stage: string;
  intent: PromptIntent;
  prompt: string;
  key: boolean;
  brandPresent: boolean;
  prominence: number;
  sentiment: Sentiment;
  competitorsPresent: string[];
  citations: string[];
  brandCited: boolean;
  snippet: string;
}

const SENTIMENT_VALUE: Record<Sentiment, number> = { positive: 1, neutral: 0.5, negative: 0, none: 0 };

// Compute the AIGVR five dimensions (each 0-100) + composite for a sample set.
function computeDimensions(samples: Sample[]) {
  const queries = samples.length;
  const mentioned = samples.filter((s) => s.brandPresent);
  const brandHits = mentioned.length;

  const presence = pct(brandHits, queries);
  const prominence = brandHits ? (mentioned.reduce((a, s) => a + s.prominence, 0) / brandHits / 3) * 100 : 0;
  const sentiment = brandHits
    ? (mentioned.reduce((a, s) => a + SENTIMENT_VALUE[s.sentiment], 0) / brandHits) * 100
    : 0;
  const citation = pct(samples.filter((s) => s.brandCited).length, queries);
  const competitorMentions = samples.reduce((a, s) => a + s.competitorsPresent.length, 0);
  const competitiveShare = brandHits + competitorMentions ? (brandHits / (brandHits + competitorMentions)) * 100 : 0;

  // Top-of-Mind / first-recommendation rate (FMVN KPI 2.2): share of ALL queries
  // where the brand is the featured / top recommendation (prominence == 3).
  const topOfMind = mentioned.filter((s) => s.prominence >= 3).length;
  const topOfMindRate = pct(topOfMind, queries);

  const aigvr =
    WEIGHTS.presence * presence +
    WEIGHTS.prominence * prominence +
    WEIGHTS.sentiment * sentiment +
    WEIGHTS.citation * citation +
    WEIGHTS.competitiveShare * competitiveShare;

  // Confidence reflects sample size in this cell — small n = noisy %.
  const confidence = queries >= 12 ? 'high' : queries >= 6 ? 'medium' : 'low';

  return {
    queries,
    brandHits,
    confidence,
    presence: round(presence),
    prominence: round(prominence),
    sentiment: round(sentiment),
    citation: round(citation),
    competitiveShare: round(competitiveShare),
    topOfMind,
    topOfMindRate: round(topOfMindRate),
    aigvr: round(aigvr),
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

export async function runMonitorAgent(
  input: MonitorInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const { brandName, brandUrl, targetCountry } = input;
  const brandDomain = brandUrl ? domainOf(brandUrl) : '';

  // Real Google AI Overview engine joins only when a SERP key is configured.
  const serpKey = process.env.SERPAPI_KEY;
  const enginePool: Engine[] = serpKey ? [...ENGINES, AIO_ENGINE] : [...ENGINES];
  const engines: Engine[] = input.engineKeys?.length
    ? enginePool.filter((e) => input.engineKeys!.includes(e.key))
    : enginePool
    .map((e) => (input.engineModels?.[e.key] && input.engineModels[e.key] !== e.model ? { ...e, model: input.engineModels[e.key] } : e));
  const kindByLabel = new Map(engines.map((e) => [e.label, e.kind]));
  const loc = localeFor(targetCountry, input.targetLanguage);

  await emit({ event_type: 'milestone', payload: { label: 'Monitor started', step: 1, totalSteps: 5 } });

  // 1. Sample prompts — key prompts always included (close monitoring), rest
  //    stage-balanced for breadth.
  const totalPrompts = input.promptSet.reduce((n, c) => n + (c.prompts?.length || 0), 0);
  const keyPrompts = input.keyPrompts || [];
  const sampled = selectSample(input.promptSet, keyPrompts, Math.max(6, Math.min(input.sampleCap ?? SAMPLE_CAP, SAMPLE_CAP)));
  // Client-facing intent taxonomy (high-intent vs educational) — deterministic
  // so the frozen library never needs regeneration.
  const intentNames = [input.brandName, ...((input.competitorSet?.groups || []).map((g) => g.canonical))];
  for (const s of sampled) s.intent = classifyIntent(s.prompt, intentNames);
  const keyUsed = sampled.filter((s) => s.key).length;
  await emit({ event_type: 'milestone', payload: { label: 'Sampling prompt set', step: 2, totalSteps: 5 } });
  await emit({
    event_type: 'log',
    payload: {
      text: `Measuring ${sampled.length} of ${totalPrompts} prompts × ${engines.length} engines = ${sampled.length * engines.length} queries` +
        (keyPrompts.length ? ` (incl. all ${keyUsed} key prompts)` : '') +
        (serpKey ? ' · with real Google AI Overview.' : ' · Poe model APIs; Google AI Overview off (no SERP key).'),
    },
  });

  // 2. Query engines — collect raw answers (full text in-memory only).
  const rawByEngine = new Map<string, RawAnswer[]>();
  const engineErrors = new Map<string, unknown>();
  const totalQueries = sampled.length * engines.length;
  let done = 0;

  // Engines run CONCURRENTLY (was sequential — that serialized ~250s of queries
  // and pushed a single-invocation Monitor past the Vercel function-duration
  // ceiling). Each engine still bounds its own internal concurrency.
  // Fail fast: the moment one engine is declared down, every other engine's
  // remaining queries are cancelled. Before this, a Gemini batch that died at
  // second 1 let the other four engines run for two minutes and pay for the
  // judge pass, only for the coverage guard to reject the scan at the end.
  const abort = new AbortController();
  await Promise.all(engines.map(async (engine) => {
    await emit({
      event_type: 'tool_call',
      payload: { tool: 'engine.query', engine: engine.label, model: engine.model, prompts: sampled.length, real: engine.kind === 'serp' },
    });
    try {
      const conc = engine.kind === 'serp' ? SERP_CONCURRENCY : QUERY_CONCURRENCY;
      let failed = 0;
      let lastErr: unknown = null;
      const answers = await mapLimit(sampled, conc, async (s) => {
        if (abort.signal.aborted) return null;
        let text = '';
        let citations: string[];
        if (engine.kind === 'serp') {
          // Per-query resilience: one slow/failed AIO fetch must not sink the
          // whole engine. A timeout = "no AI Overview shown for this query".
          try {
            const aio = await fetchGoogleAio(s.prompt, { gl: loc.gl, hl: loc.hl, location: loc.location, key: serpKey!, signal: AbortSignal.timeout(SERP_TIMEOUT_MS) });
            text = aio.text;
            citations = aio.citations;
          } catch {
            text = '';
            citations = [];
          }
        } else {
          // Per-query resilience for Poe engines too (the AIO path always had
          // it): one failed prompt is dropped from the sample, not counted as
          // "brand absent", and must not sink the other 23. The engine is
          // declared down only when its answer rate falls below the floor.
          try {
            const resp = await poeChat({
              model: engine.model,
              messages: [{ role: 'user', content: s.prompt }],
              maxTokens: 900,
              // temperature 0 → deterministic model sampling, so the measurement is
              // reproducible (residual variance is from web-retrieval engines only).
              temperature: 0,
              retries: 1,
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(90_000)]),
            });
            text = resp.content || '';
            citations = extractUrls(text);
          } catch (err) {
            if (isCapacityError(err)) throw err;
            failed++;
            lastErr = err;
            return null;
          }
        }
        const a: RawAnswer = {
          engine: engine.label,
          stage: s.stage,
          intent: s.intent,
          prompt: s.prompt,
          key: s.key,
          text,
          brandPresentStr: mentions(text, brandName),
          citations,
          brandCited: !!brandDomain && citations.some((u) => domainOf(u) === brandDomain),
        };
        done++;
        if (done % 5 === 0 || done === totalQueries) {
          await emit({ event_type: 'progress', payload: { pct: 5 + Math.round((done / totalQueries) * 60) } });
        }
        return a;
      });
      const ok = answers.filter((a): a is RawAnswer => a != null);
      if (abort.signal.aborted && ok.length < sampled.length) return; // another engine failed the run
      if (ok.length < Math.ceil(sampled.length * ENGINE_MIN_ANSWER_RATE)) {
        const cause = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'no answers');
        throw new EngineOutageError(`${engine.label} answered ${ok.length}/${sampled.length} prompts (${cause})`, [engine.label]);
      }
      if (failed) await emit({ event_type: 'log', payload: { text: `${engine.label}: ${failed} of ${sampled.length} queries failed and were dropped from the sample.` } });
      rawByEngine.set(engine.label, ok);
      await emit({
        event_type: 'tool_result',
        payload: { tool: 'engine.query', engine: engine.label, brandSoVPct: pct(ok.filter((a) => a.brandPresentStr).length, ok.length), answered: ok.length },
      });
    } catch (err) {
      engineErrors.set(engine.label, err);
      abort.abort(); // stop paying for the other engines — this scan cannot be scored
      await emit({
        event_type: 'log',
        payload: { text: `${engine.label} unavailable: ${err instanceof Error ? err.message : String(err)}` },
      });
    }
  }));

  // Coverage guard. A scorecard is a promise of comparability: "AIGVR across
  // these N engines, same set as last time". On 2026-09-07 four of five
  // engines failed on capacity, the loop carried on, and Monitor produced
  // "AIGVR 46 · confidence: high" from ONE engine and 20 queries — a number
  // that would have been written into the trend line against 5-engine,
  // 100-query baselines. Any missing engine now fails the scan loudly; nothing
  // partial is ever scored. A capacity cause is deterministic (non-retriable);
  // anything else is left retriable for the durable executor.
  const missing = engines.filter((e) => !rawByEngine.has(e.label)).map((e) => e.label);
  const engineIssues = missing.map((l) => { const e = engineErrors.get(l); return { engine: l, error: e instanceof Error ? e.message : 'no answers' }; });
  // "Partial" is judged against the project's FULL engine pool, not the
  // subset this run asked for: a diagnostic that deliberately excluded Gemini
  // is still a 4-of-5 number and must carry the label (first verification run
  // on 2026-09-17 came back partial:false because the excluded engine was not
  // "missing" from the requested set).
  const poolLabels = enginePool.map((e) => e.label);
  const notMeasured = poolLabels.filter((l) => !rawByEngine.has(l));
  const partial = !!input.allowPartial && notMeasured.length > 0 && rawByEngine.size >= 2 && !Array.from(engineErrors.values()).some(isCapacityError);
  if (partial) {
    await emit({ event_type: 'log', payload: { text: `Diagnostic scan: ${rawByEngine.size} of ${poolLabels.length} engines measured (not measured: ${notMeasured.join(', ')}). This result is labelled partial and is not recorded in the trend.` } });
  }
  if (missing.length && !partial) {
    const causes = Array.from(engineErrors.values());
    const why = missing
      .map((l) => { const e = engineErrors.get(l); return `${l}: ${e instanceof Error ? e.message : 'no answers'}`; })
      .join(' · ');
    const msg =
      `Scan incomplete — ${missing.length} of ${engines.length} engines could not be measured (${why}). ` +
      'A partial engine set is not comparable to previous scans, so no score was recorded and nothing was charged.';
    // Both causes are deterministic within this run: a retry would re-query
    // every engine again for the same result (measured 2026-09-16: 3 × 5
    // engines, 2.8M tokens, for one retired Gemini bot).
    throw causes.some(isCapacityError) ? new EngineCapacityError(msg) : new EngineOutageError(msg, missing);
  }
  const allRaw = Array.from(rawByEngine.values()).flat();

  // 3. Competitor set — frozen for 30 days for score stability (re-identifying
  //    every scan was a major source of AIGVR volatility). Variants of the
  //    same company are merged before the set is fixed.
  await emit({ event_type: 'milestone', payload: { label: 'Identifying competitors', step: 3, totalSteps: 5 } });
  const frozen = input.competitorSet;
  // locked=true (meeting resolution 2026-08-06): the curated set never
  // auto-rotates — refresh only by explicit operator/client review. The
  // 8-10 auto-rotation polluted the set with digital-ad networks.
  const frozenFresh =
    !!frozen?.groups?.length &&
    ((frozen as any).locked === true || Date.now() - new Date(frozen.refreshedAt).getTime() < COMPETITOR_SET_TTL_MS);
  let competitorGroups: CompetitorGroup[];
  let competitorSetRefreshedAt: string;
  let competitorSetRefreshed = false;
  if (frozenFresh) {
    competitorGroups = frozen!.groups;
    competitorSetRefreshedAt = frozen!.refreshedAt;
    await emit({
      event_type: 'log',
      payload: { text: `Tracking the frozen competitor set (${competitorGroups.length} brands, identified ${frozen!.refreshedAt.slice(0, 10)}) for score comparability — re-identified monthly.` },
    });
  } else {
    const rawNames = await extractCompetitorsFromAnswers(allRaw, input);
    competitorGroups = mergeVariants(rawNames, input.brandName);
    competitorSetRefreshedAt = new Date().toISOString();
    competitorSetRefreshed = true;
    await emit({
      event_type: 'log',
      payload: { text: competitorGroups.length ? `Competitors named by the engines: ${competitorGroups.map((g) => g.canonical).join(', ')}` : 'No competitor brands surfaced.' },
    });
  }
  // Carry relationship tags forward across set refreshes: a name (or alias)
  // marked partner/directory/self in the previous set keeps that tag even when
  // the fresh extraction re-surfaces it — otherwise every refresh would
  // re-pollute SoV with partners (Olivia's Upwork/Fiverr report).
  const priorRel = new Map<string, CompetitorRelationship>();
  for (const g of frozen?.groups ?? []) {
    const rel = g.relationship ?? 'competitor';
    if (rel === 'competitor') continue;
    priorRel.set(normKey(g.canonical), rel);
    for (const a of g.aliases) priorRel.set(normKey(a), rel);
  }
  for (const g of competitorGroups) {
    const rel = priorRel.get(normKey(g.canonical)) ?? g.aliases.map((a) => priorRel.get(normKey(a))).find(Boolean);
    if (rel && !g.relationship) g.relationship = rel;
  }

  const relOf = (g: CompetitorGroup): CompetitorRelationship => g.relationship ?? 'competitor';
  const scoringGroups = competitorGroups.filter((g) => relOf(g) === 'competitor');
  const competitors = scoringGroups.map((g) => g.canonical);
  const scoringCanonicals = new Set(competitors);
  const partners = competitorGroups
    .filter((g) => relOf(g) !== 'competitor' && relOf(g) !== 'self')
    .map((g) => ({ name: g.canonical, relationship: relOf(g) }));
  // Any variant → its canonical name (judge output + string fallback).
  const aliasToCanonical = new Map<string, string>();
  for (const g of competitorGroups) {
    aliasToCanonical.set(normKey(g.canonical), g.canonical);
    for (const a of g.aliases) aliasToCanonical.set(normKey(a), g.canonical);
  }
  const canonicalOf = (name: string): string | null =>
    aliasToCanonical.get(normKey(name)) ??
    competitors.find((c) => mentions(name, c) || mentions(c, name)) ??
    null;
  // Judge sees only the SCORING set — partner mentions are simply not tracked.
  const judgeTrackList = scoringGroups.map((g) =>
    g.aliases.length ? `${g.canonical} (also known as: ${g.aliases.join(', ')})` : g.canonical,
  );

  // 4. Judge pass — prominence + sentiment, per engine (one call each), run
  //    concurrently across engines.
  await emit({ event_type: 'milestone', payload: { label: 'Scoring prominence & sentiment', step: 4, totalSteps: 5 } });
  const samples: Sample[] = [];
  let judgedEngines = 0;
  // Full answer text + the judge's verdict, for the golden evaluation set.
  // Carried out of the agent on the output as `_goldenCandidates`; the runner
  // persists it to golden_pool and strips it before storing the run output.
  const goldenCandidates: Record<string, unknown>[] = [];

  // Answer-accuracy pool: brand-present answers to KEY prompts that have a
  // canonical answer in the standard library. Judged after the engine loop.
  const normP = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const stdMap = new Map<string, { en?: string; local?: string }>(
    (input.standardAnswers || []).map((a) => [normP(a.prompt), { en: a.en, local: a.local }]),
  );
  // Exact match first; Jaccard fallback covers library drift — the prompt
  // library refreshes monthly and rewords questions, which would otherwise
  // silently orphan the (older) standard-answers library.
  const stdEntries = [...stdMap.entries()].map(([p, v]) => ({ p, v, words: new Set(p.split(' ').filter(Boolean)) }));
  const stdFor = (prompt: string): { en?: string; local?: string } | undefined => {
    const n = normP(prompt);
    const exact = stdMap.get(n);
    if (exact) return exact;
    const w = new Set(n.split(' ').filter(Boolean));
    let best: { v: { en?: string; local?: string }; j: number } | null = null;
    for (const e of stdEntries) {
      let inter = 0;
      for (const x of w) if (e.words.has(x)) inter++;
      const j = inter / (w.size + e.words.size - inter || 1);
      if (j >= 0.55 && (!best || j > best.j)) best = { v: e.v, j };
    }
    return best?.v;
  };
  const accuracyPool: { engine: string; prompt: string; text: string; canonical: string }[] = [];
  await Promise.all(engines.map(async (engine) => {
    const answers = rawByEngine.get(engine.label);
    if (!answers || !answers.length) return;
    let verdicts: (Verdict | null)[] = new Array(answers.length).fill(null);
    try {
      verdicts = await judgeEngineAnswers(answers, brandName, judgeTrackList);
    } catch {
      /* fall back to string-match below */
    }
    judgedEngines++;
    await emit({ event_type: 'progress', payload: { pct: 65 + Math.round((judgedEngines / engines.length) * 25) } });
    answers.forEach((a, i) => {
      const v = verdicts[i];
      const brandPresent = v ? v.brandMentioned : a.brandPresentStr;
      // Map every judged/matched variant to its canonical competitor so one
      // company never counts twice under two spellings.
      const competitorsPresent = v && v.competitors.length
        ? Array.from(new Set(v.competitors.map(canonicalOf).filter((c): c is string => !!c && scoringCanonicals.has(c))))
        : competitorGroups
            .filter((g) => scoringCanonicals.has(g.canonical))
            .filter((g) => [g.canonical, ...g.aliases].some((n) => mentions(a.text, n)))
            .map((g) => g.canonical);
      const std = stdFor(a.prompt);
      if (brandPresent && std && accuracyPool.length < 24) {
        // 2400-char judge window (was 900 — long Vietnamese answers were fed to
        // the judge cut mid-sentence, producing false "incomplete" verdicts:
        // 8 of 12 issues on the 8-10 scan were truncation artifacts). Anything
        // longer carries an explicit marker so the judge never penalizes
        // content that may follow the cut.
        accuracyPool.push({
          engine: a.engine,
          prompt: a.prompt,
          text: a.text.length > 2400 ? a.text.slice(0, 2400) + '\n…[ANSWER CONTINUES — TRUNCATED FOR JUDGING]' : a.text,
          canonical: [std.local, std.en].filter(Boolean).join('\n---\n').slice(0, 900),
        });
      }
      samples.push({
        engine: a.engine,
        stage: a.stage,
        intent: a.intent,
        prompt: a.prompt,
        key: a.key,
        brandPresent,
        prominence: v ? v.prominence : brandPresent ? 2 : 0,
        sentiment: v ? v.sentiment : brandPresent ? 'neutral' : 'none',
        competitorsPresent,
        citations: a.citations,
        brandCited: a.brandCited,
        snippet: a.text.slice(0, 400),
      });
      goldenCandidates.push({
        engine: a.engine, stage: a.stage, intent: a.intent, prompt: a.prompt, key: a.key, text: a.text,
        machine: { brandMentioned: brandPresent, prominence: v ? v.prominence : null, sentiment: v ? v.sentiment : null, competitors: competitorsPresent, judged: !!v },
        tracked: competitors,
      });
    });
  }));

  // 4b. Answer accuracy vs the standard library (never blocks the scan).
  let accuracy: {
    checked: number; accurate: number; partial: number; wrong: number; rate: number;
    issues: { prompt: string; engine: string; verdict: string; issue: string }[];
  } | null = null;
  if (stdMap.size && !accuracyPool.length) {
    await emit({
      event_type: 'log',
      payload: { text: `Standard-answers library no longer matches the current key prompts (0 of ${stdMap.size} usable) — re-run the Answers agent to restore accuracy monitoring.` },
    });
  }
  if (accuracyPool.length) {
    try {
      const verdicts: { verdict: string; issue: string }[] = new Array(accuracyPool.length).fill(null);
      const BATCH = 6;
      const batchStarts: number[] = [];
      for (let i = 0; i < accuracyPool.length; i += BATCH) batchStarts.push(i);
      // Concurrent batches — serial judging pushed the single-invocation
      // monitor over the function-duration ceiling (run stalled at 33%).
      await mapLimit(batchStarts, 3, async (i) => {
        const batch = accuracyPool.slice(i, i + BATCH);
        const user = [
          `Brand: ${brandName}. For each item, compare the AI ANSWER against the CANONICAL answer (the verified correct one).`,
          'Verdict: "accurate" (facts/links consistent), "partial" (right direction, missing or fuzzing key facts), "wrong" (contradicts canonical facts, wrong product info, wrong/outdated links).',
          'For partial/wrong, "issue" states concretely what is incorrect or missing (one sentence). For accurate, issue is "".',
          'If an AI ANSWER ends with "[ANSWER CONTINUES — TRUNCATED FOR JUDGING]", judge ONLY the visible portion: never mark it partial/wrong for information that could plausibly appear after the truncation point, and never use "cut off/incomplete" as the issue.',
          '',
          ...batch.map((p, k) => `[${k}] QUESTION: ${p.prompt}\nCANONICAL: ${p.canonical}\nAI ANSWER (${p.engine}): ${p.text}`),
          '',
          'Return ONLY JSON: { "results": [ { "i": 0, "verdict": "accurate|partial|wrong", "issue": "string" } ] }',
        ].join('\n');
        const res = await poeChat({
          model: 'Claude-Sonnet-4.5', // same judge model as the scoring pass
          messages: [
            { role: 'system', content: 'You are a strict fact-checking judge for brand information in AI answers. Output strict JSON only.' },
            { role: 'user', content: user },
          ],
          maxTokens: 1800, temperature: 0.1, retries: 1,
        });
        const parsed = parseJsonFromLLM<any>(res.content);
        for (const r of parsed?.results || []) {
          const idx = i + Number(r.i);
          if (idx >= 0 && idx < verdicts.length && ['accurate', 'partial', 'wrong'].includes(r.verdict)) {
            verdicts[idx] = { verdict: r.verdict, issue: String(r.issue || '') };
          }
        }
      });
      const judged = verdicts.map((v, i) => ({ v, p: accuracyPool[i] })).filter((x) => x.v);
      if (judged.length) {
        const accurate = judged.filter((x) => x.v.verdict === 'accurate').length;
        const partial = judged.filter((x) => x.v.verdict === 'partial').length;
        const wrong = judged.filter((x) => x.v.verdict === 'wrong').length;
        accuracy = {
          checked: judged.length, accurate, partial, wrong,
          rate: Math.round(((accurate + 0.5 * partial) / judged.length) * 100),
          issues: judged
            .filter((x) => x.v.verdict !== 'accurate')
            .slice(0, 12)
            .map((x) => ({ prompt: x.p.prompt, engine: x.p.engine, verdict: x.v.verdict, issue: x.v.issue })),
        };
        await emit({
          event_type: 'log',
          // Named for what it is: closeness to AI-drafted standard answers,
          // judged by an AI. It becomes "accuracy" only once the yardstick is
          // client-verified facts (fact-ledger plan).
          payload: { text: `Alignment with the standard-answer library (not client-verified): ${accuracy.rate}% — ${accurate} aligned, ${partial} partial, ${wrong} divergent of ${accuracy.checked} judged brand-present key answers.` },
        });
      }
    } catch { /* accuracy is additive — the scorecard ships without it */ }
  }

  // 5. Aggregate scorecard
  await emit({ event_type: 'milestone', payload: { label: 'Computing AIGVR scorecard', step: 5, totalSteps: 5 } });

  const overall = computeDimensions(samples);

  const enginesUsed = Array.from(new Set(samples.map((s) => s.engine)));
  const perEngine = enginesUsed.map((eng) => ({ engine: eng, kind: (kindByLabel.get(eng) ?? 'poe') === 'serp' ? 'surface' : 'api', ...computeDimensions(samples.filter((s) => s.engine === eng)) }));

  const stages = Array.from(new Set(samples.map((s) => s.stage)));
  const perStage = stages.map((st) => ({ stage: st, ...computeDimensions(samples.filter((s) => s.stage === st)) }));

  // Key-set breakdown — the 20 close-monitored prompts (FMVN §4.2 / KPI 2.2).
  const keySamples = samples.filter((s) => s.key);
  const keySet = keySamples.length ? computeDimensions(keySamples) : null;

  // Competitor benchmark — presence rate across all samples, brand included.
  const bench = competitors.map((c) => {
    const hits = samples.filter((s) => s.competitorsPresent.includes(c)).length;
    return { name: c, hits, sovPct: pct(hits, samples.length), isBrand: false };
  });
  bench.push({ name: brandName, hits: overall.brandHits, sovPct: overall.presence, isBrand: true });
  bench.sort((a, b) => b.sovPct - a.sovPct || b.hits - a.hits);
  // Naming audit (FMVN / Cốc Cốc BOD, 2026-09-17). `sovPct` was always a
  // PRESENCE rate — hits ÷ all answers, non-additive across brands — never a
  // share; the field name and the chart title it produced misled a client
  // analyst into checking whether the rows summed to 100%. Stored scorecards
  // keep `sovPct` for compatibility; new ones also carry the honest names:
  //   presencePct = hits ÷ answers                (one answer can name many brands)
  //   sharePct    = hits ÷ Σ hits of all tracked brands   (sums to 100%)
  const brandMentionsTotal = bench.reduce((a, b) => a + b.hits, 0);
  for (const b of bench as any[]) {
    b.presencePct = b.sovPct;
    b.sharePct = brandMentionsTotal ? Math.round((b.hits / brandMentionsTotal) * 1000) / 10 : 0;
  }
  const brandRank = bench.findIndex((b) => b.isBrand) + 1;

  const brandCitedCount = samples.filter((s) => s.brandCited).length;
  const allSources = Array.from(new Set(samples.flatMap((s) => s.citations))).slice(0, 25);

  // Gaps are HIGH-INTENT only (educational prompts rarely name brands — a
  // zero there is normal, not a gap). Educational misses become content topics.
  const gaps = samples
    .filter((s) => s.intent === 'high_intent' && !s.brandPresent && s.competitorsPresent.length > 0)
    .map((s) => ({ stage: s.stage, intent: s.intent, prompt: s.prompt, engine: s.engine, competitorsPresent: s.competitorsPresent }));
  const educationalTopics = Array.from(new Set(
    samples.filter((s) => s.intent === 'educational' && !s.brandPresent).map((s) => s.prompt),
  )).slice(0, 15);
  const perIntent = (['high_intent', 'educational'] as PromptIntent[]).map((it) => ({
    intent: it,
    ...computeDimensions(samples.filter((s) => s.intent === it)),
  }));

  const bestEngine = [...perEngine].sort((a, b) => b.aigvr - a.aigvr)[0];
  const worstEngine = [...perEngine].sort((a, b) => a.aigvr - b.aigvr)[0];

  await emit({ event_type: 'output_chunk', payload: { kind: 'aigvr_overall', value: overall } });
  for (const e of perEngine) await emit({ event_type: 'output_chunk', payload: { kind: 'engine_score', value: e } });
  await emit({ event_type: 'output_chunk', payload: { kind: 'competitor_benchmark', value: bench } });

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'AIGVR scorecard ready', step: 5, totalSteps: 5 } });

  const output = {
    brand: brandName,
    brandUrl: brandUrl ?? null,
    country: targetCountry,
    language: (input.targetLanguage || 'en').toLowerCase(),
    industry: input.industry ?? null,
    aigvrScore: overall.aigvr,
    dimensions: {
      presence: overall.presence,
      prominence: overall.prominence,
      sentiment: overall.sentiment,
      citation: overall.citation,
      competitiveShare: overall.competitiveShare,
      topOfMindRate: overall.topOfMindRate,
    },
    // KPI 2.2 — first-recommendation rate, overall and on the close-monitored key set.
    topOfMind: {
      overallRate: overall.topOfMindRate,
      keyRate: keySet ? keySet.topOfMindRate : null,
      keySampled: keyUsed,
      keyTotal: keyPrompts.length,
    },
    weights: WEIGHTS,
    competitors,
    competitorSet: { groups: competitorGroups, refreshedAt: competitorSetRefreshedAt },
    competitorSetRefreshed,
    engines: enginesUsed,
    engineModels: Object.fromEntries(engines.map((e) => [e.label, e.kind === 'serp' ? 'Google AI Overview' : e.model])),
    // Diagnostic provenance: readers MUST treat partial scorecards as
    // non-comparable (excluded from trend, digest, rollup, citation index).
    partial,
    plannedEngines: poolLabels,
    missingEngines: partial ? notMeasured : missing,
    engineIssues,
    surfaces: { realSurfaces: serpKey ? ['Google AI Overview'] : [], proxySurfaces: ENGINES.map((e) => e.label) },
    sampled: { total: totalPrompts, used: sampled.length, queries: samples.length, keyUsed, keyTotal: keyPrompts.length },
    metrics: { overall, perEngine, perStage, perIntent, keySet },
    competitorBenchmark: bench,
    brandMentionsTotal, // Σ hits across the tracked set — the Share-of-Voice denominator
    // Entities tracked but excluded from SoV by relationship tag (partner /
    // directory) — surfaced so the UI can show WHY they aren't in the column.
    partners,
    brandRank,
    citations: { brandCited: brandCitedCount > 0, brandCitedCount, sampleSources: allSources },
    gaps,
    educationalTopics,
    rawSamples: samples,
    _goldenCandidates: goldenCandidates,
    accuracy,
    generatedBy: engines.map((e) => (e.kind === 'serp' ? 'Google AI Overview' : e.model)).join(' + '),
  };

  const summary =
    (partial ? `DIAGNOSTIC (${rawByEngine.size}/${poolLabels.length} engines — ${notMeasured.join(', ')} not measured; not recorded in trend) · ` : '') +
    `${brandName} — AIGVR ${overall.aigvr}/100 (across ${samples.length} AI queries). ` +
    `Appears in ${overall.presence}% of answers (rank #${brandRank} of ${bench.length}); ` +
    `top-of-mind ${overall.topOfMindRate}%${keySet ? ` (key prompts ${keySet.topOfMindRate}%)` : ''}; ` +
    `prominence ${overall.prominence}, sentiment ${overall.sentiment}, competitive share ${overall.competitiveShare}. ` +
    `Strongest on ${bestEngine?.engine} (${bestEngine?.aigvr}), weakest on ${worstEngine?.engine} (${worstEngine?.aigvr}). ` +
    `${gaps.length} high-intent gaps.`;

  return { summary, output };
}
