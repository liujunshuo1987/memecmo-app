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

import { poeChat, parseJsonFromLLM } from '@/lib/llm/poe';

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
  knownCompetitors?: string[];
}

// The AI answer engines we measure. Model names verified live on Poe.
const ENGINES: { key: string; label: string; model: string }[] = [
  { key: 'chatgpt', label: 'ChatGPT', model: 'GPT-4o' },
  { key: 'gemini', label: 'Gemini', model: 'Gemini-2.5-Pro' },
  { key: 'perplexity', label: 'Perplexity', model: 'Perplexity-Sonar' },
  { key: 'claude', label: 'Claude', model: 'Claude-Sonnet-4.5' },
];

// Sample the full prompt set (bounded for runaway sizes). Larger n per
// stage×engine cell = less noisy percentages — the main rigor lever.
const SAMPLE_CAP = 40;
const QUERY_CONCURRENCY = 6;

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

// Evenly sample up to `cap` prompts across funnel stages.
function sampleAcrossStages(
  promptSet: PromptCategory[],
  cap: number,
): { stage: string; label: string; prompt: string }[] {
  const flat: { stage: string; label: string; prompt: string }[] = [];
  for (const c of promptSet) {
    for (const p of c.prompts || []) {
      flat.push({ stage: c.category || 'general', label: c.label || c.category || 'general', prompt: p });
    }
  }
  if (flat.length <= cap) return flat;
  const byStage = new Map<string, typeof flat>();
  for (const f of flat) {
    if (!byStage.has(f.stage)) byStage.set(f.stage, []);
    byStage.get(f.stage)!.push(f);
  }
  const queues = Array.from(byStage.values());
  const picked: typeof flat = [];
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
  prompt: string;
  text: string;
  brandPresentStr: boolean; // string-match fallback
  citations: string[];
  brandCited: boolean;
}

interface Sample {
  engine: string;
  stage: string;
  prompt: string;
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

  await emit({ event_type: 'milestone', payload: { label: 'Monitor started', step: 1, totalSteps: 5 } });

  // 1. Sample prompts (stage-balanced, bounded)
  const totalPrompts = input.promptSet.reduce((n, c) => n + (c.prompts?.length || 0), 0);
  const sampled = sampleAcrossStages(input.promptSet, SAMPLE_CAP);
  await emit({ event_type: 'milestone', payload: { label: 'Sampling prompt set', step: 2, totalSteps: 5 } });
  await emit({
    event_type: 'log',
    payload: {
      text: `Measuring ${sampled.length} of ${totalPrompts} prompts × ${ENGINES.length} engines = ${sampled.length * ENGINES.length} AI queries.`,
    },
  });

  // 2. Query engines — collect raw answers (full text in-memory only).
  const rawByEngine = new Map<string, RawAnswer[]>();
  const totalQueries = sampled.length * ENGINES.length;
  let done = 0;

  for (const engine of ENGINES) {
    await emit({
      event_type: 'tool_call',
      payload: { tool: 'engine.query', engine: engine.label, model: engine.model, prompts: sampled.length },
    });
    try {
      const answers = await mapLimit(sampled, QUERY_CONCURRENCY, async (s) => {
        const resp = await poeChat({
          model: engine.model,
          messages: [{ role: 'user', content: s.prompt }],
          maxTokens: 900,
          // temperature 0 → deterministic model sampling, so the measurement is
          // reproducible (residual variance is from web-retrieval engines only).
          temperature: 0,
          retries: 1,
        });
        const text = resp.content || '';
        const urls = extractUrls(text);
        const a: RawAnswer = {
          engine: engine.label,
          stage: s.stage,
          prompt: s.prompt,
          text,
          brandPresentStr: mentions(text, brandName),
          citations: urls,
          brandCited: !!brandDomain && urls.some((u) => domainOf(u) === brandDomain),
        };
        done++;
        if (done % 5 === 0 || done === totalQueries) {
          await emit({ event_type: 'progress', payload: { pct: 5 + Math.round((done / totalQueries) * 60) } });
        }
        return a;
      });
      rawByEngine.set(engine.label, answers);
      await emit({
        event_type: 'tool_result',
        payload: { tool: 'engine.query', engine: engine.label, brandSoVPct: pct(answers.filter((a) => a.brandPresentStr).length, answers.length) },
      });
    } catch (err) {
      await emit({
        event_type: 'log',
        payload: { text: `${engine.label} unavailable: ${err instanceof Error ? err.message : String(err)}` },
      });
    }
  }

  const allRaw = Array.from(rawByEngine.values()).flat();
  if (allRaw.length === 0) throw new Error('All engines failed — no measurements collected.');

  // 3. Identify competitors from the REAL answers (self-calibrating).
  await emit({ event_type: 'milestone', payload: { label: 'Identifying competitors', step: 3, totalSteps: 5 } });
  const competitors = await extractCompetitorsFromAnswers(allRaw, input);
  await emit({
    event_type: 'log',
    payload: { text: competitors.length ? `Competitors named by the engines: ${competitors.join(', ')}` : 'No competitor brands surfaced.' },
  });

  // 4. Judge pass — prominence + sentiment, per engine (one call each).
  await emit({ event_type: 'milestone', payload: { label: 'Scoring prominence & sentiment', step: 4, totalSteps: 5 } });
  const samples: Sample[] = [];
  let judgedEngines = 0;
  for (const engine of ENGINES) {
    const answers = rawByEngine.get(engine.label);
    if (!answers || !answers.length) continue;
    let verdicts: (Verdict | null)[] = new Array(answers.length).fill(null);
    try {
      verdicts = await judgeEngineAnswers(answers, brandName, competitors);
    } catch {
      /* fall back to string-match below */
    }
    judgedEngines++;
    await emit({ event_type: 'progress', payload: { pct: 65 + Math.round((judgedEngines / ENGINES.length) * 25) } });
    answers.forEach((a, i) => {
      const v = verdicts[i];
      const brandPresent = v ? v.brandMentioned : a.brandPresentStr;
      const competitorsPresent = v && v.competitors.length
        ? competitors.filter((c) => v.competitors.some((vc) => mentions(vc, c) || mentions(c, vc)))
        : competitors.filter((c) => mentions(a.text, c));
      samples.push({
        engine: a.engine,
        stage: a.stage,
        prompt: a.prompt,
        brandPresent,
        prominence: v ? v.prominence : brandPresent ? 2 : 0,
        sentiment: v ? v.sentiment : brandPresent ? 'neutral' : 'none',
        competitorsPresent,
        citations: a.citations,
        brandCited: a.brandCited,
        snippet: a.text.slice(0, 400),
      });
    });
  }

  // 5. Aggregate scorecard
  await emit({ event_type: 'milestone', payload: { label: 'Computing AIGVR scorecard', step: 5, totalSteps: 5 } });

  const overall = computeDimensions(samples);

  const enginesUsed = Array.from(new Set(samples.map((s) => s.engine)));
  const perEngine = enginesUsed.map((eng) => ({ engine: eng, ...computeDimensions(samples.filter((s) => s.engine === eng)) }));

  const stages = Array.from(new Set(samples.map((s) => s.stage)));
  const perStage = stages.map((st) => ({ stage: st, ...computeDimensions(samples.filter((s) => s.stage === st)) }));

  // Competitor benchmark — presence rate across all samples, brand included.
  const bench = competitors.map((c) => {
    const hits = samples.filter((s) => s.competitorsPresent.includes(c)).length;
    return { name: c, hits, sovPct: pct(hits, samples.length), isBrand: false };
  });
  bench.push({ name: brandName, hits: overall.brandHits, sovPct: overall.presence, isBrand: true });
  bench.sort((a, b) => b.sovPct - a.sovPct || b.hits - a.hits);
  const brandRank = bench.findIndex((b) => b.isBrand) + 1;

  const brandCitedCount = samples.filter((s) => s.brandCited).length;
  const allSources = Array.from(new Set(samples.flatMap((s) => s.citations))).slice(0, 25);

  const gaps = samples
    .filter((s) => !s.brandPresent && s.competitorsPresent.length > 0)
    .map((s) => ({ stage: s.stage, prompt: s.prompt, engine: s.engine, competitorsPresent: s.competitorsPresent }));

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
    },
    weights: WEIGHTS,
    competitors,
    engines: enginesUsed,
    sampled: { total: totalPrompts, used: sampled.length, queries: samples.length },
    metrics: { overall, perEngine, perStage },
    competitorBenchmark: bench,
    brandRank,
    citations: { brandCited: brandCitedCount > 0, brandCitedCount, sampleSources: allSources },
    gaps,
    rawSamples: samples,
    generatedBy: `poe:${ENGINES.map((e) => e.model).join('+')}`,
  };

  const summary =
    `${brandName} — AIGVR ${overall.aigvr}/100 (across ${samples.length} AI queries). ` +
    `Appears in ${overall.presence}% of answers (rank #${brandRank} of ${bench.length}); ` +
    `prominence ${overall.prominence}, sentiment ${overall.sentiment}, competitive share ${overall.competitiveShare}. ` +
    `Strongest on ${bestEngine?.engine} (${bestEngine?.aigvr}), weakest on ${worstEngine?.engine} (${worstEngine?.aigvr}). ` +
    `${gaps.length} high-intent gaps.`;

  return { summary, output };
}
