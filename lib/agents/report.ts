// Report Agent (v0.9 — turns the AIGVR scorecard into a client deliverable)
//
// Consumes the latest Monitor geo_scorecard and produces a stakeholder-ready
// GEO visibility report: an executive summary, evidence-backed key findings,
// and PRIORITIZED, GEO-literate recommendations that say what to actually DO to
// close the funnel-stage gaps. Emits structured JSON and assembles a clean
// Markdown report (deterministically, in code) persisted as a geo_report asset.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';

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

interface ReportInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  scorecard: any; // the Monitor output object
}

interface Recommendation {
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  targetStage: string;
  rationale: string;
  actions: string[];
  expectedImpact: string;
}

interface ReportJson {
  executiveSummary: string;
  keyFindings: { finding: string; evidence: string }[];
  recommendations: Recommendation[];
  quickWins: string[];
}

// Compact digest of the scorecard for the LLM (omit bulky rawSamples).
function digest(sc: any) {
  return {
    aigvrScore: sc?.aigvrScore,
    dimensions: sc?.dimensions,
    perStage: (sc?.metrics?.perStage || []).map((s: any) => ({ stage: s.stage, presence: s.presence, aigvr: s.aigvr, brandHits: s.brandHits, queries: s.queries })),
    perEngine: (sc?.metrics?.perEngine || []).map((e: any) => ({ engine: e.engine, presence: e.presence, aigvr: e.aigvr })),
    competitorBenchmark: (sc?.competitorBenchmark || []).map((b: any) => ({ name: b.name, sovPct: b.sovPct, isBrand: b.isBrand })),
    citations: sc?.citations,
    gaps: (sc?.gaps || []).slice(0, 12).map((g: any) => ({ stage: g.stage, engine: g.engine, prompt: g.prompt, competitors: g.competitorsPresent })),
    competitors: sc?.competitors,
  };
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

function buildMarkdown(input: ReportInput, sc: any, r: ReportJson): string {
  const d = sc?.dimensions || {};
  const lines: string[] = [];
  lines.push(`# ${input.brandName} — GEO Visibility Report`);
  lines.push('');
  lines.push(`**AIGVR Score: ${sc?.aigvrScore ?? '—'}/100**  ·  ${input.targetCountry}` + (input.industry ? `  ·  ${input.industry}` : ''));
  lines.push('');
  lines.push(`> Measured across ${(sc?.engines || []).join(', ')} — ${sc?.sampled?.queries ?? '—'} live AI queries.`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  lines.push(r.executiveSummary);
  lines.push('');

  lines.push('## AIGVR Breakdown');
  lines.push('');
  lines.push('| Dimension | Score |');
  lines.push('|---|---|');
  lines.push(`| Presence (Share of Voice) | ${d.presence ?? '—'} |`);
  lines.push(`| Prominence | ${d.prominence ?? '—'} |`);
  lines.push(`| Sentiment | ${d.sentiment ?? '—'} |`);
  lines.push(`| Citation (AEO) | ${d.citation ?? '—'} |`);
  lines.push(`| Competitive Share | ${d.competitiveShare ?? '—'} |`);
  lines.push('');

  const stages = sc?.metrics?.perStage || [];
  if (stages.length) {
    lines.push('## Funnel-Stage Visibility');
    lines.push('');
    lines.push('| Stage | Presence | AIGVR |');
    lines.push('|---|---|---|');
    for (const s of stages) lines.push(`| ${s.stage} | ${s.presence}% (${s.brandHits}/${s.queries}) | ${s.aigvr} |`);
    lines.push('');
  }

  const bench = sc?.competitorBenchmark || [];
  if (bench.length) {
    lines.push('## Competitive Benchmark');
    lines.push('');
    lines.push('| Brand | Share of Voice |');
    lines.push('|---|---|');
    for (const b of bench) lines.push(`| ${b.isBrand ? `**${b.name}**` : b.name} | ${b.sovPct}% |`);
    lines.push('');
  }

  lines.push('## Key Findings');
  lines.push('');
  for (const f of r.keyFindings) lines.push(`- **${f.finding}** — ${f.evidence}`);
  lines.push('');

  lines.push('## Priority Recommendations');
  lines.push('');
  const sorted = [...r.recommendations].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  for (const rec of sorted) {
    lines.push(`### ${rec.priority} — ${rec.title}`);
    lines.push(`*Target stage: ${rec.targetStage}*`);
    lines.push('');
    lines.push(rec.rationale);
    lines.push('');
    for (const a of rec.actions) lines.push(`- ${a}`);
    lines.push('');
    lines.push(`**Expected impact:** ${rec.expectedImpact}`);
    lines.push('');
  }

  if (r.quickWins?.length) {
    lines.push('## Quick Wins (this week)');
    lines.push('');
    for (const q of r.quickWins) lines.push(`- ${q}`);
    lines.push('');
  }

  return lines.join('\n');
}

export async function runReportAgent(
  input: ReportInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const sc = input.scorecard;

  await emit({ event_type: 'milestone', payload: { label: 'Report started', step: 1, totalSteps: 3 } });
  await emit({
    event_type: 'log',
    payload: { text: `Synthesizing report from AIGVR ${sc?.aigvrScore}/100 scorecard (${(sc?.gaps || []).length} gaps).` },
  });

  const system =
    'You are a senior Generative Engine Optimization (GEO) consultant writing a ' +
    'client-ready report. You understand exactly how AI answer engines (ChatGPT, ' +
    'Gemini, Perplexity, Claude) decide what to surface: they favor authoritative, ' +
    'well-structured content that directly answers buyer questions; they cite and ' +
    'reuse third-party sources (industry directories, comparison/review sites, news, ' +
    'Wikipedia); they reward structured data (Organization/Product/Review/FAQ schema) ' +
    'and consistent brand mentions across the web. Your recommendations are concrete ' +
    'and tied to the actual gaps — never generic marketing fluff. Output strict JSON only.';

  const user = [
    `Brand: ${input.brandName}` + (input.brandUrl ? ` (${input.brandUrl})` : ''),
    `Market: ${input.targetCountry}` + (input.industry ? ` · ${input.industry}` : ''),
    `Buyer queries are in the local language; keep example queries verbatim.`,
    '',
    'Here is the AIGVR measurement (0-100 dimensions; presence = share of AI answers ' +
      'mentioning the brand; gaps = queries where competitors appear and the brand does not):',
    '```json',
    JSON.stringify(digest(sc), null, 2),
    '```',
    '',
    'Write a GEO report as JSON with this exact shape:',
    '{',
    '  "executiveSummary": "3-5 sentences. Lead with the AIGVR score and the single most important business implication (which funnel stages the brand is invisible at and what that costs).",',
    '  "keyFindings": [{ "finding": "short claim", "evidence": "the specific numbers/queries/competitors that prove it" }],',
    '  "recommendations": [{ "priority": "P0|P1|P2", "title": "imperative action", "targetStage": "which funnel stage / gap it fixes", "rationale": "why this moves AI visibility, in GEO terms", "actions": ["concrete steps"], "expectedImpact": "what metric it should move" }],',
    '  "quickWins": ["1-3 things doable this week"]',
    '}',
    '',
    'Rules: 3-5 keyFindings, 4-6 recommendations ordered by priority (P0 first), ' +
      'each recommendation tied to a real gap or weak stage from the data. Keep each ' +
      'rationale to 1-2 sentences and at most 4 actions. Write in clear professional ' +
      'English. Be specific to this brand and market.',
  ].join('\n');

  await emit({ event_type: 'tool_call', payload: { tool: 'engine.chat', args: { model: DEFAULT_MODEL, purpose: 'Compose GEO report' } } });
  await emit({ event_type: 'progress', payload: { pct: 25 } });

  const res = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 6000,
    temperature: 0.5,
  });

  await emit({ event_type: 'tool_result', payload: { tool: 'engine.chat', tokens: res.usage?.total ?? null, latencyMs: res.latencyMs } });
  await emit({ event_type: 'progress', payload: { pct: 65 } });

  let parsed: ReportJson;
  try {
    parsed = parseJsonFromLLM<ReportJson>(res.content);
  } catch (e) {
    throw new Error(`Report model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed.recommendations?.length) throw new Error('Report produced no recommendations.');

  await emit({ event_type: 'milestone', payload: { label: 'Composing report', step: 2, totalSteps: 3 } });

  for (const f of parsed.keyFindings || []) {
    await emit({ event_type: 'output_chunk', payload: { kind: 'finding', value: f } });
  }
  for (const rec of parsed.recommendations) {
    await emit({ event_type: 'output_chunk', payload: { kind: 'recommendation', value: { priority: rec.priority, title: rec.title } } });
  }

  const markdown = buildMarkdown(input, sc, parsed);

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Report ready', step: 3, totalSteps: 3 } });

  const p0 = parsed.recommendations.filter((r) => r.priority === 'P0').length;
  const summary =
    `GEO report ready: AIGVR ${sc?.aigvrScore}/100, ${parsed.keyFindings?.length || 0} findings, ` +
    `${parsed.recommendations.length} recommendations (${p0} P0). ` +
    (parsed.recommendations[0] ? `Top priority: ${parsed.recommendations[0].title}.` : '');

  return {
    summary,
    output: {
      brand: input.brandName,
      country: input.targetCountry,
      aigvrScore: sc?.aigvrScore ?? null,
      ...parsed,
      markdown,
      generatedBy: `${res.model}`,
    },
  };
}
