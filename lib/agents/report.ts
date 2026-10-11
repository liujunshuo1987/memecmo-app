// Report Agent (v0.9 — turns the AIGVR scorecard into a client deliverable)
//
// Consumes the latest Monitor geo_scorecard and produces a stakeholder-ready
// GEO visibility report: an executive summary, evidence-backed key findings,
// and PRIORITIZED, GEO-literate recommendations that say what to actually DO to
// close the funnel-stage gaps. Emits structured JSON and assembles a clean
// Markdown report (deterministically, in code) persisted as a geo_report asset.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL, assertComplete } from '@/lib/llm/poe';
import { languageName, outputTokenBudget } from '@/lib/markets';
import { brandFactsCorpus } from '@/lib/agents/brand-facts';
import type { CompetitorGroup } from '@/lib/agents/source-owners';
import { figuresFromScorecard } from '@/lib/reports/verify';
import { scrub, figureCorpusOf, quarterOf } from '@/lib/reports/audit';
import { traceAffectedEngines, mostlyEmptyEngines } from '@/lib/engines/ingest';
import { NOTES_PATH, NOTES_LINK_LABEL, type NotesLang } from '@/lib/notes/paths';

// A report rests on one scan. When an engine in that scan was not read
// correctly the report says so above everything else, and the model is told
// not to reason from that engine's figures. Nothing is adjusted.
const NOTE_TEXT: Record<NotesLang, { title: string; misread: (e: string) => string; unread: (e: string, a: number, n: number) => string }> = {
  en: {
    title: 'Measurement note',
    misread: (e) => `In this scan ${e} was scored on the engine's search log, not on the answer. Its figures, and the totals that include them, are not valid readings.`,
    unread: (e, a, n) => `In this scan ${e} returned ${a} of ${n} answers. Its figures, and the totals that include them, are not valid readings.`,
  },
  vi: {
    title: 'Lưu ý đo lường',
    misread: (e) => `Ở lần quét này, ${e} được chấm trên nhật ký tìm kiếm của engine, không phải trên câu trả lời. Số đo của engine này và các số tổng có chứa nó chưa phải là số đo hợp lệ.`,
    unread: (e, a, n) => `Ở lần quét này, ${e} chỉ trả về ${a}/${n} câu trả lời. Số đo của engine này và các số tổng có chứa nó chưa phải là số đo hợp lệ.`,
  },
  zh: {
    title: '测量说明',
    misread: (e) => `这次扫描中,${e} 的判分读到的是引擎的搜索记录,不是回答正文。该引擎的数字,以及包含它的各项总数,不是有效读数。`,
    unread: (e, a, n) => `这次扫描中,${e} 只返回 ${a}/${n} 条回答。该引擎的数字,以及包含它的各项总数,不是有效读数。`,
  },
};
const notesLang = (l?: string | null): NotesLang => (/^vi/i.test(l ?? '') ? 'vi' : /^zh/i.test(l ?? '') ? 'zh' : 'en');
const NOTES_BASE = 'https://app.memecmo.ai';

function measurementNotes(sc: any, lang: NotesLang): { lines: string[]; engines: string[] } {
  const misread = traceAffectedEngines(sc);
  const unread = mostlyEmptyEngines(sc);
  const t = NOTE_TEXT[lang];
  return {
    lines: [...(misread.length ? [t.misread(misread.join(', '))] : []), ...unread.map((u) => t.unread(u.engine, u.answered, u.total))],
    engines: [...new Set([...misread, ...unread.map((u) => u.engine)])],
  };
}

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
  brandProfile?: any | null; // canonical facts incl. USAGE RULES — recommendations must obey them
  citationBrief?: string;     // lib/pages/profile — what the engines cite in this market (measured)
  siteCorpus?: { url: string; title: string | null; excerpt: string | null; date: string | null; words: number | null }[]; // the client's own read pages
  competitorSet?: { groups?: CompetitorGroup[] } | null; // who is the brand itself and who is a competitor
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
  // Phase 2 (only when the client's pages were read): what the site covers vs
  // what buyers ask, and where AI answers contradict the client's own pages.
  siteCoverage?: { prompt: string; status: 'covered' | 'vacuum'; page: string | null; note: string }[];
  contradictions?: { prompt: string; engine: string; aiClaim: string; sitePage: string; siteFact: string }[];
}

// Compact digest of the scorecard for the LLM (omit bulky rawSamples).
function digest(sc: any) {
  return {
    aigvrScore: sc?.aigvrScore,
    dimensions: sc?.dimensions,
    perStage: (sc?.metrics?.perStage || []).map((s: any) => ({ stage: s.stage, presence: s.presence, aigvr: s.aigvr, brandHits: s.brandHits, queries: s.queries })),
    perEngine: (sc?.metrics?.perEngine || []).map((e: any) => ({ engine: e.engine, presence: e.presence, aigvr: e.aigvr })),
    competitorBenchmark: (sc?.competitorBenchmark || []).map((b: any) => ({ name: b.name, presencePct: b.sovPct, hits: b.hits, isBrand: b.isBrand })),
    citations: sc?.citations,
    gaps: (sc?.gaps || []).slice(0, 12).map((g: any) => ({ stage: g.stage, engine: g.engine, prompt: g.prompt, competitors: g.competitorsPresent })),
    // Brand-present answer excerpts (≤300 chars) — what the engines actually SAY about the brand, for contradiction checks.
    brandAnswerExcerpts: (sc?.rawSamples || []).filter((s: any) => s?.brandPresent && s?.snippet).slice(0, 20).map((s: any) => ({ engine: s.engine, prompt: s.prompt, excerpt: String(s.snippet).slice(0, 300) })),
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
  const nl = notesLang(input.targetLanguage);
  const notes = measurementNotes(sc, nl);
  if (notes.lines.length) {
    lines.push(`> **${NOTE_TEXT[nl].title}.** ${notes.lines.join(' ')}`);
    lines.push('');
  }
  lines.push(`> [${NOTES_LINK_LABEL[nl]}](${NOTES_BASE}${NOTES_PATH[nl]})`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  lines.push(r.executiveSummary);
  lines.push('');

  lines.push('## AIGVR Breakdown');
  lines.push('');
  lines.push('| Dimension | Score |');
  lines.push('|---|---|');
  lines.push(`| Brand presence rate (answers naming the brand ÷ all answers) | ${d.presence ?? '—'}% |`);
  lines.push(`| Prominence | ${d.prominence ?? '—'} |`);
  lines.push(`| Sentiment | ${d.sentiment ?? '—'} |`);
  lines.push(`| Citation (AEO) | ${d.citation ?? '—'} |`);
  lines.push(`| Share of voice (brand mentions ÷ all tracked-brand mentions) | ${d.competitiveShare ?? '—'}% |`);
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
    // Two different denominators, shown side by side so neither is mistaken
    // for the other: presence is per-answer (rows do not sum to 100%), share
    // is per-mention (rows do).
    const nAnswers = sc?.metrics?.overall?.queries ?? sc?.sampled?.queries ?? '—';
    const totalMentions = bench.reduce((a: number, b: any) => a + (b.hits ?? 0), 0);
    lines.push(`| Brand | Presence rate (of ${nAnswers} answers) | Share of voice (of ${totalMentions} brand mentions) |`);
    lines.push('|---|---|---|');
    for (const b of bench) {
      const share = totalMentions ? Math.round(((b.hits ?? 0) / totalMentions) * 100) : 0;
      lines.push(`| ${b.isBrand ? `**${b.name}**` : b.name} | ${b.sovPct}% (${b.hits ?? '—'}) | ${share}% |`);
    }
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
    'and tied to the actual gaps — never generic marketing fluff. Output strict JSON only. ' +
    'PROVENANCE DISCIPLINE (non-negotiable): every claim in the report must be labeled by ' +
    'evidence class. Facts that come from the scan data you were given are stated plainly. ' +
    'Anything you project, estimate, or expect — impact ranges, timelines, traffic shares, ' +
    'industry generalizations not present in the scan data — MUST be prefixed with ' +
    '"[Projection]" and phrased as a target, never as a measurement. Never invent numbers ' +
    'that look like measurements (percentages, query volumes, journey shares) unless they ' +
    'appear in the provided scan data. A report that mixes forecasts into findings is a ' +
    'defective report. ' +
    'CLOSED WORLD (hard rule): facts come ONLY from this message — the scan data, the brand profile and the client pages. ' +
    'Do not use the web or your own knowledge for any market share, screen count, study, award, client name or event, about the brand ' +
    'or about a competitor, and never cite third-party research (Kantar, Nielsen, Mordor Intelligence, Statista or similar) unless the ' +
    'exact statement is in the brand profile.';

  const now = new Date();
  const groups = input.competitorSet?.groups ?? [];
  const self = groups.filter((g) => g.relationship === 'self').map((g) => [g.canonical, ...(g.aliases ?? [])].join(' / '));
  const rivals = groups.filter((g) => g.relationship !== 'self' && g.relationship !== 'directory').map((g) => g.canonical);
  const user = [
    `TODAY is ${now.toISOString().slice(0, 10)} (${quarterOf(now).label}). Any period you name must be this quarter or later.`,
    groups.length
      ? `ENTITIES — the brand itself (never a competitor): ${[input.brandName, ...self].join('; ')}. Competitors: ${rivals.join('; ') || 'n/a'}. ` +
        'These are different companies even when names overlap; never move a fact from one to another.'
      : '',
    `Brand: ${input.brandName}` + (input.brandUrl ? ` (${input.brandUrl})` : ''),
    `Market: ${input.targetCountry}` + (input.industry ? ` · ${input.industry}` : ''),
    `Buyer queries are in the local language; keep example queries verbatim.`,
    '',
    ...(() => {
      const bad = measurementNotes(sc, 'en').engines;
      return bad.length
        ? [`MEASUREMENT ERROR (non-negotiable): the reading of ${bad.join(', ')} is not valid in this scan. Do not quote or reason from any figure for ${bad.join(', ')}. Every all-engine total (the score, the dimensions, stage and benchmark figures) includes it: do not build a finding or a recommendation on such a total, and say once that this scan's totals are not valid readings.`, '']
        : [];
    })(),
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
    ...(input.brandProfile
      ? [
          '',
          'BRAND GOVERNANCE (overrides generic GEO playbook — a recommendation that ' +
            'violates a stated brand policy is a defective recommendation): the brand ' +
            'profile below is the canonical fact source. Obey any USAGE RULES / ' +
            'forbidden-items it states. In particular: if the brand does not publish ' +
            'fixed prices, never recommend public price lists, price tiers or price ' +
            'comparison content — recommend a price-LOGIC page (variables that drive ' +
            'price + brief/contact CTA) instead. If a capability is marked as not a ' +
            'current commercial product, do not recommend building content that markets ' +
            'it as an offering; frame it as future-capability/thought-leadership at most.',
          '```json',
          JSON.stringify(input.brandProfile, null, 1).slice(0, 4000),
          '```',
          '',
        ]
      : []),
    ...(input.citationBrief ? [input.citationBrief, ''] : []),
    ...(input.siteCorpus && input.siteCorpus.length
      ? [
          'CLIENT\'S OWN PUBLIC PAGES (read by our fetcher — the fact source for coverage and contradictions; url · date · words · title — excerpt):',
          // 25 pages × 220 characters: the 40 × 350 version made a ~60k-token
          // prompt and a reply that ran 138–174 s against a 250 s ceiling — one
          // slow call (2026-10-01) and the monthly report was gone.
          ...input.siteCorpus.slice(0, 25).map((p) => `- ${p.url}${p.date ? ` · ${p.date}` : ''}${p.words ? ` · ${p.words}w` : ''}${p.title ? ` · ${p.title}` : ''}${p.excerpt ? ` — ${p.excerpt.slice(0, 220)}` : ''}`),
          '',
          'Because the client\'s pages are provided, ALSO return two more arrays in the JSON:',
          '  "siteCoverage": [{ "prompt": "a buyer question from the gaps/key prompts", "status": "covered|vacuum", "page": "url of the page that answers it, or null", "note": "one sentence" }]  — one entry per gap query and key prompt (max 12, the gaps first). "vacuum" = no page on the client\'s site addresses it.',
          '  "contradictions": [{ "prompt": "...", "engine": "...", "aiClaim": "what the AI answer states about the brand", "sitePage": "url", "siteFact": "what the client\'s page states" }]  — ONLY where an AI answer excerpt conflicts with a client page; empty array if none. Never infer facts that are not in the excerpts.',
          '',
        ]
      : []),
    'Rules: 3-5 keyFindings, 4-6 recommendations ordered by priority (P0 first), ' +
      'each recommendation tied to a real gap or weak stage from the data. Keep each ' +
      'rationale to 1-2 sentences and at most 4 actions. Write all prose (executiveSummary, ' +
      `findings, evidence, titles, rationale, actions, quickWins) in ${languageName(input.targetLanguage)}; ` +
      'keep JSON keys, the priority codes P0/P1/P2 and any quoted buyer queries exactly as given. ' +
      'Be specific to this brand and market. ' +
      'If review-site visibility is weak and the brand serves end customers, you may ' +
      'recommend a GENUINE review-solicitation program (invitation links sent to real ' +
      'customers after purchase/service, Birdeye-style) — review CONTENT must come from ' +
      'real customers; never recommend writing, seeding or incentivizing review text.',
  ].join('\n');

  await emit({ event_type: 'tool_call', payload: { tool: 'engine.chat', args: { model: DEFAULT_MODEL, purpose: 'Compose GEO report' } } });
  await emit({ event_type: 'progress', payload: { pct: 25 } });

  const res = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // Non-English deliverables (zh/vi/th) tokenize 1.5–2× heavier than English;
    // 6000 truncated the first Chinese report mid-JSON (2026-09-23).
    maxTokens: outputTokenBudget(10000, input.targetLanguage),
    temperature: 0.5,
  });
  if (res.finishReason === 'length') {
    throw new Error(`Report model hit the output limit (finish_reason=length) — the JSON is truncated; raise maxTokens or shorten the brief.`);
  }

  await emit({ event_type: 'tool_result', payload: { tool: 'engine.chat', tokens: res.usage?.total ?? null, latencyMs: res.latencyMs } });
  await emit({ event_type: 'progress', payload: { pct: 65 } });

  let parsed: ReportJson;
  try {
    assertComplete(res, 'GEO report');
    parsed = parseJsonFromLLM<ReportJson>(res.content);
  } catch (e) {
    throw new Error(`Report model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed.recommendations?.length) throw new Error('Report produced no recommendations.');

  // The rules above, enforced: a sentence with a figure found in neither the
  // scan nor the client's own material, with outside research the client never
  // supplied, or (in advice) with a period already past is removed. A sentence
  // labelled [Projection] may keep its own target figures.
  const figureCorpus = figureCorpusOf(figuresFromScorecard(sc));
  const factsCorpus = [
    brandFactsCorpus(input.brandProfile),
    input.citationBrief ?? '',
    (input.siteCorpus ?? []).map((p) => `${p.title ?? ''} ${p.excerpt ?? ''}`).join('\n'),
  ].join('\n');
  const removedSentences: string[] = [];
  const clean = (text: unknown, forwardLooking: boolean): string => {
    const r = scrub(String(text ?? ''), figureCorpus, factsCorpus, input.targetLanguage ?? 'en', now, { forwardLooking, allowProjection: true });
    removedSentences.push(...r.removed);
    return r.text;
  };
  parsed.executiveSummary = clean(parsed.executiveSummary, false);
  parsed.keyFindings = (parsed.keyFindings ?? []).map((f) => ({ finding: clean(f.finding, false), evidence: clean(f.evidence, false) })).filter((f) => f.finding);
  parsed.recommendations = parsed.recommendations
    // The rationale argues from the scan, so it may quote scan figures; the
    // title, actions and expected impact are advice (client-material figures only).
    .map((r) => ({ ...r, title: clean(r.title, true), rationale: clean(r.rationale, false), actions: (r.actions ?? []).map((a) => clean(a, true)).filter(Boolean), expectedImpact: clean(r.expectedImpact, true) }))
    .filter((r) => r.title);
  parsed.quickWins = (parsed.quickWins ?? []).map((q) => clean(q, true)).filter(Boolean);
  if (!parsed.recommendations.length) throw new Error('Report recommendations did not survive the fact check — nothing usable remained.');
  if (removedSentences.length) {
    await emit({ event_type: 'log', payload: { text: `Fact check removed ${removedSentences.length} sentence(s) that carried an unsupported figure, outside research or a past period.` } });
    console.warn('[report] scrub removed:', removedSentences.map((x) => x.slice(0, 140)));
  }

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
      language: input.targetLanguage ?? 'en', // deliverable language (lib/markets.ts) — the UI skips the reviewer translation when it matches
      brand: input.brandName,
      country: input.targetCountry,
      aigvrScore: sc?.aigvrScore ?? null,
      ...parsed,
      markdown,
      measurementNotes: measurementNotes(sc, notesLang(input.targetLanguage)).lines,
      siteCoverage: Array.isArray(parsed.siteCoverage) ? parsed.siteCoverage.slice(0, 30) : [],
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions.slice(0, 20) : [],
      siteCorpusSize: input.siteCorpus?.length ?? 0,
      generatedBy: `${res.model}`,
    },
  };
}
