/**
 * AEO 6-Axis Deterministic Scoring Engine
 * ─────────────────────────────────────────
 * Pure client-safe module. No I/O, no LLM calls. Takes already-collected
 * evidence (probe answers, scout T1 list, brand audit) and produces
 * reproducible scores with full derivation trails.
 *
 * First principles this encodes:
 *   E1 Entity Canonicality  — is the brand identified consistently as one entity?
 *   E2 Corpus Density       — how much distinct factual material do LLMs have?
 *   E3 Query SOV            — direct empirical: mention rate across probes
 *   E4 Semantic Anchoring   — picked up at the decision-making stages (consider/compare)?
 *   E5 Citation Authority   — drawn from T1 sources and own-site URL?
 *   E6 Answer Inclusion     — direct empirical: answer-level inclusion rate
 *
 * Each axis returns { score, derivation } where derivation exposes the
 * formula, raw inputs, and evidence IDs so the UI can show the math.
 */

// ─── Input shapes (mirrors sea-command-center/page.tsx) ────────────────────
export interface ProbeAnswerIn {
  stage: string;
  modelId: string;
  modelDisplayName: string;
  ok: boolean;
  answer: string;
  analysis: {
    brand_mentioned: boolean;
    mention_count: number;
    first_position_pct: number | null;
    candidate_entities: string[];
    answer_length: number;
  };
}

export interface ProbeSummaryIn {
  brandName: string;
  targetCountry: string;
  overallMentionRate: number;        // 0..1
  answerInclusionRate: number;       // 0..1
  stageBreakdown: Record<string, { mentionRate: number; answersWithBrand: number; total: number }>;
  coverageByModel: Record<string, { displayName: string; mentionRate: number; avgFirstPositionPct: number | null }>;
}

export interface ScoutIn {
  media_nodes?: Array<{ name: string; type: string; trust_weight: number }>;
}

export interface AuditIn {
  url?: string;
  fields?: {
    lang: string | null;
    schemaTypes: string[];
    jsonldCount: number;
    wordCount: number;
    hreflang: string[];
  } | null;
}

export interface ScoringInput {
  brandName: string;
  brandUrl?: string;
  targetCountry?: string;
  probeAnswers: ProbeAnswerIn[];
  probeSummary: ProbeSummaryIn | null;
  scout?: ScoutIn | null;
  audit?: AuditIn | null;
}

// ─── Output shapes ─────────────────────────────────────────────────────────
export type AEOAxis = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';

export interface AxisDerivation {
  formula: string;
  components: Array<{ label: string; weight: number; value: number; detail?: string }>;
  evidence: string[];        // short text excerpts
  inputs: Record<string, number | string | null>;
  dataSufficient: boolean;
}

export interface AxisResult {
  axis: AEOAxis;
  name_zh: string;
  name_en: string;
  score: number;             // 0..100
  gap: string;               // short human summary of the weakest component
  derivation: AxisDerivation;
}

export interface ComputedDiagnostic {
  scorecard: AxisResult[];
  overall_score: number;
  dataCoverage: {
    probeAnswers: number;
    modelsObserved: number;
    stagesObserved: number;
    hasScout: boolean;
    hasAudit: boolean;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','is','are',
  'was','were','be','been','being','this','that','these','those','it','its',
  'as','at','by','from','into','than','then','so','not','no','do','does','did',
  'has','have','had','can','could','should','would','will','may','also','more',
  'most','one','two','their','they','them','our','your','you','we','i','he','she',
  '的','是','在','和','与','及','了','也','就','都','而','以','及其','及','或','但',
]);

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  if (!s) return out;
  const words = s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/);
  for (const w of words) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function meanPairwiseJaccard(sets: Set<string>[]): { mean: number; max: number; pairs: number } {
  if (sets.length < 2) return { mean: 0, max: 0, pairs: 0 };
  let sum = 0, max = 0, n = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const j2 = jaccard(sets[i], sets[j]);
      sum += j2;
      if (j2 > max) max = j2;
      n++;
    }
  }
  return { mean: n ? sum / n : 0, max, pairs: n };
}

function clamp(x: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, x));
}

function excerpt(s: string, max = 140): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

// country → expected content language codes (primary + acceptable fallbacks)
const COUNTRY_LANG: Record<string, { primary: string[]; acceptable: string[] }> = {
  ID: { primary: ['id'], acceptable: ['en'] },
  VN: { primary: ['vi'], acceptable: ['en'] },
  TH: { primary: ['th'], acceptable: ['en'] },
  MY: { primary: ['ms', 'en'], acceptable: ['zh'] },
  SG: { primary: ['en'], acceptable: ['zh', 'ms', 'ta'] },
  PH: { primary: ['en', 'fil', 'tl'], acceptable: [] },
  KH: { primary: ['km'], acceptable: ['en'] },
  MM: { primary: ['my'], acceptable: ['en'] },
  LA: { primary: ['lo'], acceptable: ['en'] },
  BN: { primary: ['ms'], acceptable: ['en'] },
};

const CANONICAL_SCHEMA_TYPES = new Set([
  'Organization', 'Corporation', 'LocalBusiness', 'Brand', 'Product', 'ProfessionalService', 'Store',
]);

// ─── Axis calculators ──────────────────────────────────────────────────────

function scoreE1(input: ScoringInput): AxisResult {
  const { probeAnswers, audit, targetCountry } = input;

  // Component A (40%): cross-model entity identity consistency.
  // For each model, union the candidate_entities collected from answers where
  // the brand was mentioned. Then compute mean pairwise Jaccard.
  const perModel = new Map<string, Set<string>>();
  for (const a of probeAnswers) {
    if (!a.ok || !a.analysis.brand_mentioned) continue;
    if (!perModel.has(a.modelId)) perModel.set(a.modelId, new Set());
    const set = perModel.get(a.modelId)!;
    for (const e of a.analysis.candidate_entities || []) {
      set.add(e.toLowerCase().trim());
    }
  }
  const modelSets = Array.from(perModel.values());
  const { mean: consensusJacc, pairs } = meanPairwiseJaccard(modelSets);
  // When there are no pairs (≤1 model with mentions), we can't measure consistency — fall back to 50.
  const consensus100 = pairs > 0 ? consensusJacc * 100 : 50;

  // Component B (30%): schema.org canonical entity markup on own site
  const schemaTypes = audit?.fields?.schemaTypes || [];
  const hasCanonical = schemaTypes.some((t) => CANONICAL_SCHEMA_TYPES.has(t));
  const jsonldBonus = Math.min((audit?.fields?.jsonldCount || 0) * 10, 20);
  const schema100 = hasCanonical ? Math.min(80 + jsonldBonus, 100) : (audit?.fields ? 20 : 0);

  // Component C (30%): native-language fidelity on own site
  const lang = (audit?.fields?.lang || '').toLowerCase().split('-')[0];
  const hreflang = (audit?.fields?.hreflang || []).map((h) => h.toLowerCase().split('-')[0]);
  const tc = (targetCountry || '').toUpperCase();
  const expected = COUNTRY_LANG[tc];
  let lang100 = 0;
  if (!audit?.fields) {
    lang100 = 0;
  } else if (!expected) {
    lang100 = lang ? 60 : 20;
  } else if (expected.primary.includes(lang) || expected.primary.some((p) => hreflang.includes(p))) {
    lang100 = 100;
  } else if (expected.acceptable.includes(lang) || expected.acceptable.some((p) => hreflang.includes(p))) {
    lang100 = 60;
  } else if (lang) {
    lang100 = 30;
  }

  const score = clamp(consensus100 * 0.4 + schema100 * 0.3 + lang100 * 0.3);

  // Worst component determines the "gap" narrative
  const comps = [
    { label: 'cross_model_identity_jaccard', weight: 0.4, value: consensus100, detail: `pairs=${pairs}, mean_jaccard=${consensusJacc.toFixed(3)}` },
    { label: 'schema_org_entity_markup',     weight: 0.3, value: schema100,   detail: `types=[${schemaTypes.join(',')}], jsonld=${audit?.fields?.jsonldCount ?? '-'}` },
    { label: 'native_language_fidelity',     weight: 0.3, value: lang100,     detail: `lang=${lang || '-'}, hreflang=[${hreflang.join(',')}], target=${tc || '-'}` },
  ];
  const weakest = [...comps].sort((a, b) => a.value - b.value)[0];
  const gap = weakest.value < 50
    ? `Weakest lever: ${weakest.label} (${weakest.value.toFixed(0)}/100).`
    : `Balanced across levers; lowest still ${weakest.label} (${weakest.value.toFixed(0)}).`;

  // Evidence: one sample candidate_entities list per model (first 2 models)
  const evidence: string[] = [];
  const evModels = Array.from(perModel.entries()).slice(0, 2);
  for (const [m, s] of evModels) {
    evidence.push(`${m} identified: ${Array.from(s).slice(0, 6).join(' | ') || '(none)'}`);
  }

  return {
    axis: 'E1',
    name_zh: '实体规范性',
    name_en: 'Entity Canonicality',
    score,
    gap,
    derivation: {
      formula: '0.4·cross_model_identity + 0.3·schema_org + 0.3·native_language',
      components: comps,
      evidence,
      inputs: {
        modelsWithMentions: modelSets.length,
        pairs,
        hasCanonicalSchema: hasCanonical ? 1 : 0,
        siteLang: lang || null,
        targetCountry: tc || null,
      },
      dataSufficient: pairs > 0 || !!audit?.fields,
    },
  };
}

function scoreE2(input: ScoringInput): AxisResult {
  const { probeAnswers, audit } = input;

  // Component A (60%): distinct fact diversity across answers where brand is mentioned.
  // 1 − max pairwise Jaccard of answer tokens → higher = more distinct facts.
  const answerSets = probeAnswers
    .filter((a) => a.ok && a.analysis.brand_mentioned)
    .map((a) => tokenize(a.answer));
  const { max: maxJacc, mean: meanJacc, pairs } = meanPairwiseJaccard(answerSets);
  const diversity100 = pairs > 0 ? (1 - maxJacc) * 100 : (answerSets.length === 1 ? 50 : 0);

  // Component B (40%): own-site content signal. Normalize wordCount to ~1500 words ceiling.
  const wc = audit?.fields?.wordCount ?? 0;
  const content100 = audit?.fields ? clamp((wc / 1500) * 100) : 0;

  const score = clamp(diversity100 * 0.6 + content100 * 0.4);

  const comps = [
    { label: 'distinct_fact_diversity', weight: 0.6, value: diversity100, detail: `max_jaccard=${maxJacc.toFixed(3)}, mean=${meanJacc.toFixed(3)}, pairs=${pairs}` },
    { label: 'own_site_content_signal', weight: 0.4, value: content100,   detail: `wordCount=${wc}` },
  ];
  const weakest = [...comps].sort((a, b) => a.value - b.value)[0];
  const gap = weakest.value < 50
    ? `Thin on ${weakest.label} (${weakest.value.toFixed(0)}/100) — ${weakest.label === 'distinct_fact_diversity' ? 'answers echo the same few facts' : 'site has too little indexable content'}.`
    : `Dense corpus signals across both components.`;

  const evidence = probeAnswers
    .filter((a) => a.ok && a.analysis.brand_mentioned)
    .slice(0, 2)
    .map((a) => `${a.modelDisplayName}/${a.stage}: ${excerpt(a.answer, 160)}`);

  return {
    axis: 'E2',
    name_zh: '语料密度',
    name_en: 'Corpus Density',
    score,
    gap,
    derivation: {
      formula: '0.6·(1 − max_pairwise_jaccard) + 0.4·min(wordCount/1500, 1)',
      components: comps,
      evidence,
      inputs: {
        answersWithBrand: answerSets.length,
        pairs,
        maxJaccard: Number(maxJacc.toFixed(3)),
        wordCount: wc,
      },
      dataSufficient: answerSets.length >= 2 || !!audit?.fields,
    },
  };
}

function scoreE3(input: ScoringInput): AxisResult {
  const ps = input.probeSummary;
  const rate = ps?.overallMentionRate ?? 0;
  const score = clamp(rate * 100);

  // Per-model SOV distribution for evidence
  const perModel = ps ? Object.values(ps.coverageByModel) : [];
  const evidence = perModel.slice(0, 4).map((m) =>
    `${m.displayName}: ${(m.mentionRate * 100).toFixed(1)}% mention, avg_first_pos=${m.avgFirstPositionPct == null ? '—' : m.avgFirstPositionPct.toFixed(1) + '%'}`,
  );

  const comps = [
    { label: 'overall_mention_rate', weight: 1.0, value: score, detail: `${(rate * 100).toFixed(1)}% of answers mention the brand` },
  ];

  return {
    axis: 'E3',
    name_zh: '查询SOV',
    name_en: 'Query SOV',
    score,
    gap: score < 40
      ? `Only ${score.toFixed(0)}% of probe answers surface the brand — invisible to most queries.`
      : score < 70
      ? `Appears in ${score.toFixed(0)}% of answers — present but not dominant.`
      : `Strong presence at ${score.toFixed(0)}% mention rate.`,
    derivation: {
      formula: 'overall_mention_rate × 100 (direct empirical)',
      components: comps,
      evidence,
      inputs: {
        totalProbeAnswers: input.probeAnswers.length,
        overallMentionRate: Number(rate.toFixed(4)),
      },
      dataSufficient: !!ps,
    },
  };
}

function scoreE4(input: ScoringInput): AxisResult {
  const { probeAnswers, probeSummary } = input;
  const focus = ['consideration', 'comparison', 'awareness'];

  // Component A (60%): mention rate on focus stages
  let focusRateSum = 0, focusStageCount = 0;
  const perStageDetail: string[] = [];
  if (probeSummary) {
    for (const s of focus) {
      const b = probeSummary.stageBreakdown[s];
      if (b && b.total > 0) {
        focusRateSum += b.mentionRate;
        focusStageCount++;
        perStageDetail.push(`${s}=${(b.mentionRate * 100).toFixed(0)}%`);
      }
    }
  }
  const focusRate100 = focusStageCount > 0 ? (focusRateSum / focusStageCount) * 100 : 0;

  // Component B (40%): first-position strength on focus stages
  const focusAnswers = probeAnswers.filter(
    (a) => a.ok && a.analysis.brand_mentioned && focus.includes(a.stage) && a.analysis.first_position_pct != null,
  );
  const fpMean = focusAnswers.length
    ? focusAnswers.reduce((s, a) => s + (a.analysis.first_position_pct || 0), 0) / focusAnswers.length
    : 0;
  // first_position_pct: lower = earlier = better. Convert to score.
  const firstPos100 = focusAnswers.length ? clamp(100 - fpMean) : 0;

  const score = clamp(focusRate100 * 0.6 + firstPos100 * 0.4);

  const comps = [
    { label: 'decision_stage_mention_rate', weight: 0.6, value: focusRate100, detail: perStageDetail.join(', ') || '(no stage data)' },
    { label: 'first_position_strength',     weight: 0.4, value: firstPos100,  detail: `mean first_pos_pct=${fpMean.toFixed(1)} across ${focusAnswers.length} answers` },
  ];
  const weakest = [...comps].sort((a, b) => a.value - b.value)[0];
  const gap = weakest.value < 50
    ? `Weak ${weakest.label} (${weakest.value.toFixed(0)}/100) — users comparing options don't see you first.`
    : `Anchored well at decision stages.`;

  const evidence = focusAnswers.slice(0, 2).map((a) =>
    `${a.modelDisplayName}/${a.stage}: pos=${a.analysis.first_position_pct}% · ${excerpt(a.answer, 120)}`,
  );

  return {
    axis: 'E4',
    name_zh: '语义锚定',
    name_en: 'Semantic Anchoring',
    score,
    gap,
    derivation: {
      formula: '0.6·mean(mention_rate on {awareness, consideration, comparison}) + 0.4·(100 − mean_first_position_pct)',
      components: comps,
      evidence,
      inputs: {
        focusStagesObserved: focusStageCount,
        focusAnswersWithPosition: focusAnswers.length,
        meanFirstPositionPct: Number(fpMean.toFixed(2)),
      },
      dataSufficient: focusStageCount > 0,
    },
  };
}

function scoreE5(input: ScoringInput): AxisResult {
  const { probeAnswers, scout, brandUrl } = input;

  // Extract host from brandUrl
  let brandDomain = '';
  if (brandUrl) {
    try { brandDomain = new URL(brandUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* ignore */ }
  }

  const t1Tokens: string[] = (scout?.media_nodes || []).map((m) => m.name.toLowerCase().trim()).filter(Boolean);

  const lowerAnswers = probeAnswers.filter((a) => a.ok).map((a) => ({ ...a, lower: a.answer.toLowerCase() }));

  // Component A (50%): how many answers cite the brand's own URL/domain
  let ownUrlHits = 0;
  if (brandDomain) {
    for (const a of lowerAnswers) {
      if (a.lower.includes(brandDomain)) ownUrlHits++;
    }
  }
  const ownUrl100 = lowerAnswers.length ? (ownUrlHits / lowerAnswers.length) * 100 : 0;

  // Component B (50%): how many answers mention any T1 source from Scout list
  let t1Hits = 0;
  const sampleHits: string[] = [];
  if (t1Tokens.length > 0) {
    for (const a of lowerAnswers) {
      const hit = t1Tokens.find((tok) => tok.length >= 3 && a.lower.includes(tok));
      if (hit) {
        t1Hits++;
        if (sampleHits.length < 3) sampleHits.push(`${a.modelDisplayName}/${a.stage} ← ${hit}`);
      }
    }
  }
  const t1100 = lowerAnswers.length && t1Tokens.length ? (t1Hits / lowerAnswers.length) * 100 : 0;

  const score = clamp(ownUrl100 * 0.5 + t1100 * 0.5);

  const comps = [
    { label: 'own_url_citation_rate', weight: 0.5, value: ownUrl100, detail: `${ownUrlHits}/${lowerAnswers.length} answers cite ${brandDomain || '(no brand URL)'}` },
    { label: 't1_source_co_occurrence', weight: 0.5, value: t1100, detail: `${t1Hits}/${lowerAnswers.length} answers reference T1 media (${t1Tokens.length} known)` },
  ];
  const weakest = [...comps].sort((a, b) => a.value - b.value)[0];
  const gap = weakest.value < 40
    ? `Low ${weakest.label} (${weakest.value.toFixed(0)}/100) — ${weakest.label === 'own_url_citation_rate' ? 'models aren\'t referencing your domain' : 'you aren\'t co-occurring with authoritative sources'}.`
    : `Decent authority signal across own-site and T1 co-occurrence.`;

  return {
    axis: 'E5',
    name_zh: '来源权威性',
    name_en: 'Citation Authority',
    score,
    gap,
    derivation: {
      formula: '0.5·(answers_citing_own_domain / total_answers) + 0.5·(answers_referencing_T1 / total_answers)',
      components: comps,
      evidence: sampleHits,
      inputs: {
        brandDomain: brandDomain || null,
        t1SourcesKnown: t1Tokens.length,
        totalAnswers: lowerAnswers.length,
        ownUrlHits,
        t1Hits,
      },
      dataSufficient: lowerAnswers.length > 0,
    },
  };
}

function scoreE6(input: ScoringInput): AxisResult {
  const ps = input.probeSummary;
  const rate = ps?.answerInclusionRate ?? 0;
  const score = clamp(rate * 100);

  // Evidence: stages with best vs worst inclusion
  const stages = ps ? Object.entries(ps.stageBreakdown).sort((a, b) => b[1].mentionRate - a[1].mentionRate) : [];
  const evidence: string[] = [];
  if (stages.length) {
    const [bestS, bestB] = stages[0];
    const [worstS, worstB] = stages[stages.length - 1];
    evidence.push(`Best stage: ${bestS} (${(bestB.mentionRate * 100).toFixed(0)}% inclusion)`);
    if (stages.length > 1) evidence.push(`Worst stage: ${worstS} (${(worstB.mentionRate * 100).toFixed(0)}% inclusion)`);
  }

  return {
    axis: 'E6',
    name_zh: '答案收纳率',
    name_en: 'Answer Inclusion',
    score,
    gap: score < 40
      ? `Only ${score.toFixed(0)}% of generated answers include the brand as a listed option.`
      : score < 70
      ? `Included in ${score.toFixed(0)}% of answers — room to convert mentions into listed picks.`
      : `Strong answer-level inclusion at ${score.toFixed(0)}%.`,
    derivation: {
      formula: 'answer_inclusion_rate × 100 (direct empirical — brand appeared in the model\'s enumerated answer)',
      components: [
        { label: 'answer_inclusion_rate', weight: 1.0, value: score, detail: `${(rate * 100).toFixed(1)}% of answers list the brand` },
      ],
      evidence,
      inputs: {
        answerInclusionRate: Number(rate.toFixed(4)),
        stagesObserved: stages.length,
      },
      dataSufficient: !!ps,
    },
  };
}

// ─── Public entry point ────────────────────────────────────────────────────
export function computeAEODiagnostic(input: ScoringInput): ComputedDiagnostic {
  const scorecard: AxisResult[] = [
    scoreE1(input),
    scoreE2(input),
    scoreE3(input),
    scoreE4(input),
    scoreE5(input),
    scoreE6(input),
  ];

  // Weighted overall. The two empirical anchors (E3, E6) get double weight
  // because they're measured, not inferred.
  const weights: Record<AEOAxis, number> = { E1: 1, E2: 1, E3: 2, E4: 1, E5: 1, E6: 2 };
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
  const overall_score = clamp(
    scorecard.reduce((s, a) => s + a.score * weights[a.axis], 0) / totalW,
  );

  const modelsObserved = new Set(input.probeAnswers.filter((a) => a.ok).map((a) => a.modelId)).size;
  const stagesObserved = new Set(input.probeAnswers.filter((a) => a.ok).map((a) => a.stage)).size;

  return {
    scorecard,
    overall_score,
    dataCoverage: {
      probeAnswers: input.probeAnswers.length,
      modelsObserved,
      stagesObserved,
      hasScout: !!(input.scout?.media_nodes?.length),
      hasAudit: !!input.audit?.fields,
    },
  };
}
