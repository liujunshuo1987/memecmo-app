// Monitor Agent (v0.7 — real multi-engine GEO visibility measurement)
//
// Takes the Discovery prompt set and runs a sample of it against the real AI
// answer engines (ChatGPT / Gemini / Perplexity) via Poe. For each answer it
// detects whether the brand and its competitors are mentioned, and whether the
// brand is cited (Perplexity returns source URLs). It aggregates this into a
// GEO scorecard: overall Share-of-Voice, per-engine and per-funnel-stage SoV,
// a competitor benchmark with the brand's rank, and a list of high-intent gaps
// (queries where the brand is absent but a competitor appears).
//
// This is the measurement that turns Discovery's prompt list into a deliverable.

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
];

const SAMPLE_CAP = 12; // prompts sampled across stages (cost/latency bound)
const QUERY_CONCURRENCY = 4;

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

// Evenly sample up to `cap` prompts across funnel stages, so the scorecard
// isn't dominated by one stage.
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
  // round-robin by stage
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

// Extract the competitor brands the engines ACTUALLY named in their answers.
// This self-calibrates the benchmark to the real market: if buyers ask "best X
// companies" and the engines list Chicilon/Goldsun, those are the real rivals —
// far more accurate than guessing competitor names before seeing any data.
async function extractCompetitorsFromAnswers(
  answers: { text: string }[],
  input: MonitorInput,
): Promise<string[]> {
  // Build a bounded corpus from the answers.
  let corpus = '';
  for (const a of answers) {
    if (corpus.length > 6000) break;
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
          `Use the exact names as written. Return ONLY a JSON array of 4-10 strings.\n\n` +
          `ANSWERS:\n${corpus}`,
      },
    ],
    maxTokens: 400,
    temperature: 0.2,
  });
  try {
    const arr = parseJsonFromLLM<string[]>(res.content);
    if (!Array.isArray(arr)) return [];
    // Dedupe (case-insensitive), drop the brand itself and junk.
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
    return out.slice(0, 10);
  } catch {
    return [];
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

interface RawAnswer {
  engine: string;
  stage: string;
  prompt: string;
  text: string;
  brandPresent: boolean;
  citations: string[];
  brandCited: boolean;
}

interface Sample {
  engine: string;
  stage: string;
  prompt: string;
  brandPresent: boolean;
  competitorsPresent: string[];
  citations: string[];
  brandCited: boolean;
  snippet: string;
}

export async function runMonitorAgent(
  input: MonitorInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const { brandName, brandUrl, targetCountry } = input;
  const brandDomain = brandUrl ? domainOf(brandUrl) : '';

  await emit({ event_type: 'milestone', payload: { label: 'Monitor started', step: 1, totalSteps: 4 } });

  // 1. Sample prompts (stage-balanced, bounded)
  const totalPrompts = input.promptSet.reduce((n, c) => n + (c.prompts?.length || 0), 0);
  const sampled = sampleAcrossStages(input.promptSet, SAMPLE_CAP);
  await emit({
    event_type: 'milestone',
    payload: { label: 'Sampling prompt set', step: 2, totalSteps: 4 },
  });
  await emit({
    event_type: 'log',
    payload: {
      text: `Measuring ${sampled.length} of ${totalPrompts} prompts × ${ENGINES.length} engines = ${sampled.length * ENGINES.length} AI queries.`,
    },
  });

  // 2. Query engines — collect raw answers (full text kept in-memory only).
  const raw: RawAnswer[] = [];
  const totalQueries = sampled.length * ENGINES.length;
  let done = 0;

  for (const engine of ENGINES) {
    await emit({
      event_type: 'tool_call',
      payload: { tool: 'engine.query', engine: engine.label, model: engine.model, prompts: sampled.length },
    });
    try {
      const engineAnswers = await mapLimit(sampled, QUERY_CONCURRENCY, async (s) => {
        const resp = await poeChat({
          model: engine.model,
          messages: [{ role: 'user', content: s.prompt }],
          maxTokens: 900,
          temperature: 0.3,
          retries: 1,
        });
        const text = resp.content || '';
        const urls = extractUrls(text);
        const answer: RawAnswer = {
          engine: engine.label,
          stage: s.stage,
          prompt: s.prompt,
          text,
          brandPresent: mentions(text, brandName),
          citations: urls,
          brandCited: !!brandDomain && urls.some((u) => domainOf(u) === brandDomain),
        };
        done++;
        if (done % 4 === 0 || done === totalQueries) {
          await emit({ event_type: 'progress', payload: { pct: 5 + Math.round((done / totalQueries) * 75) } });
        }
        return answer;
      });
      raw.push(...engineAnswers);
      const hits = engineAnswers.filter((a) => a.brandPresent).length;
      await emit({
        event_type: 'tool_result',
        payload: { tool: 'engine.query', engine: engine.label, brandSoVPct: pct(hits, engineAnswers.length) },
      });
    } catch (err) {
      // Resilient: one engine failing doesn't sink the whole scan.
      await emit({
        event_type: 'log',
        payload: { text: `${engine.label} unavailable: ${err instanceof Error ? err.message : String(err)}` },
      });
    }
  }

  if (raw.length === 0) {
    throw new Error('All engines failed — no measurements collected.');
  }

  // 3. Identify competitors from the REAL answers (self-calibrating benchmark).
  await emit({ event_type: 'milestone', payload: { label: 'Identifying competitors from answers', step: 3, totalSteps: 4 } });
  const competitors = await extractCompetitorsFromAnswers(raw, input);
  await emit({
    event_type: 'log',
    payload: {
      text: competitors.length
        ? `Competitors named by the engines: ${competitors.join(', ')}`
        : 'No competitor brands surfaced in the answers.',
    },
  });

  // Now score competitor presence per answer and drop full text → snippet.
  const samples: Sample[] = raw.map((a) => ({
    engine: a.engine,
    stage: a.stage,
    prompt: a.prompt,
    brandPresent: a.brandPresent,
    competitorsPresent: competitors.filter((c) => mentions(a.text, c)),
    citations: a.citations,
    brandCited: a.brandCited,
    snippet: a.text.slice(0, 400),
  }));

  // 4. Aggregate scorecard
  await emit({ event_type: 'milestone', payload: { label: 'Computing scorecard', step: 4, totalSteps: 4 } });

  const brandHits = samples.filter((s) => s.brandPresent).length;
  const overallSoVPct = pct(brandHits, samples.length);

  const enginesUsed = Array.from(new Set(samples.map((s) => s.engine)));
  const perEngine = enginesUsed.map((eng) => {
    const subset = samples.filter((s) => s.engine === eng);
    return { engine: eng, queries: subset.length, brandHits: subset.filter((s) => s.brandPresent).length, sovPct: pct(subset.filter((s) => s.brandPresent).length, subset.length) };
  });

  const stages = Array.from(new Set(samples.map((s) => s.stage)));
  const perStage = stages.map((st) => {
    const subset = samples.filter((s) => s.stage === st);
    return { stage: st, queries: subset.length, brandHits: subset.filter((s) => s.brandPresent).length, sovPct: pct(subset.filter((s) => s.brandPresent).length, subset.length) };
  });

  // Competitor benchmark — appearance rate across all samples, brand included.
  const bench = competitors.map((c) => {
    const hits = samples.filter((s) => s.competitorsPresent.includes(c)).length;
    return { name: c, hits, sovPct: pct(hits, samples.length), isBrand: false };
  });
  bench.push({ name: brandName, hits: brandHits, sovPct: overallSoVPct, isBrand: true });
  bench.sort((a, b) => b.sovPct - a.sovPct || b.hits - a.hits);
  const brandRank = bench.findIndex((b) => b.isBrand) + 1;

  // Citations (AEO signal)
  const brandCitedCount = samples.filter((s) => s.brandCited).length;
  const allSources = Array.from(new Set(samples.flatMap((s) => s.citations))).slice(0, 25);

  // Gaps: brand absent but ≥1 competitor present — the actionable targets.
  const gaps = samples
    .filter((s) => !s.brandPresent && s.competitorsPresent.length > 0)
    .map((s) => ({ stage: s.stage, prompt: s.prompt, engine: s.engine, competitorsPresent: s.competitorsPresent }));

  const bestEngine = [...perEngine].sort((a, b) => b.sovPct - a.sovPct)[0];
  const worstEngine = [...perEngine].sort((a, b) => a.sovPct - b.sovPct)[0];

  for (const e of perEngine) {
    await emit({ event_type: 'output_chunk', payload: { kind: 'engine_sov', value: e } });
  }
  await emit({ event_type: 'output_chunk', payload: { kind: 'competitor_benchmark', value: bench } });

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Scorecard ready', step: 4, totalSteps: 4 } });

  const output = {
    brand: brandName,
    brandUrl: brandUrl ?? null,
    country: targetCountry,
    language: (input.targetLanguage || 'en').toLowerCase(),
    industry: input.industry ?? null,
    competitors,
    engines: enginesUsed,
    sampled: { total: totalPrompts, used: sampled.length, queries: samples.length },
    metrics: { overallSoVPct, perEngine, perStage },
    competitorBenchmark: bench,
    brandRank,
    citations: { brandCited: brandCitedCount > 0, brandCitedCount, sampleSources: allSources },
    gaps,
    rawSamples: samples,
    generatedBy: `poe:${ENGINES.map((e) => e.model).join('+')}`,
  };

  const rankStr = `#${brandRank} of ${bench.length}`;
  const summary =
    `${brandName} appears in ${overallSoVPct}% of AI answers (SoV rank ${rankStr}). ` +
    `Strongest on ${bestEngine?.engine} (${bestEngine?.sovPct}%), weakest on ${worstEngine?.engine} (${worstEngine?.sovPct}%). ` +
    `${gaps.length} high-intent gaps where competitors appear and you don't.`;

  return { summary, output };
}
