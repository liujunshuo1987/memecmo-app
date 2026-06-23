/**
 * Computational Public Relations (CPR) — deterministic metrics derived from
 * probe answers. No LLM scoring; the LLM is only the measurement instrument.
 *
 * See: docs/COMPUTATIONAL_PR_FRAMEWORK.md
 *
 * All metrics operate on the ProbeAnswer[] already in memory after the SOV
 * probe runs — so they add zero API cost.
 */

// ─── Types mirrored from sea-command-center ───────────────────────────────
export interface CPRProbeAnswerIn {
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

export interface CPRGroundTruth {
  canonical_name: string;
  aliases?: string[];
  headquarters?: string;      // e.g. "Cupertino, California" or "United States"
  industry?: string;          // e.g. "Consumer Electronics"
  primary_category?: string;  // e.g. "Smartphones"
  founded_year?: number;
  founder?: string;
  target_market?: string;
  /** Known-good competitor list from Scout / user */
  truth_peers?: string[];
}

// ─── Output shapes ────────────────────────────────────────────────────────
export interface KERAResult {
  score: number;                                    // 0..100
  perAttribute: Array<{
    attribute: string;
    tested: boolean;
    correctModels: number;
    totalModels: number;
    evidence: Array<{ modelId: string; snippet: string; verdict: 'correct' | 'incorrect' | 'absent' }>;
  }>;
  sampleSize: number;
}

export interface CitationShareResult {
  score: number;                                    // 0..100
  perStage: Record<string, { share: number; rankSamples: number[] }>;
  perModel: Record<string, { share: number; samples: number }>;
  zipfDenominatorByN: Record<number, number>;
  rankedAnswers: number;                            // how many answers we could rank
}

export interface SPSResult {
  score: number;                                    // -100..+100 (scaled from -1..+1)
  perModel: Record<string, { polarity: number; positives: number; negatives: number; samples: number }>;
  drift: number;                                    // 0..100 (spread across models)
  warnings: string[];
  excerpts: Array<{ modelId: string; stage: string; polarity: number; text: string }>;
}

export interface VPCResult {
  score: number;                                    // 0..100
  sharedPhrases: string[];
  perModelPhrases: Record<string, string[]>;
  pairwiseJaccard: number;
}

export interface IPAResult {
  score: number;                                    // 0..100
  llmPeerSet: string[];
  truthPeerSet: string[];
  intersection: string[];
  onlyInLLM: string[];          // phantom peers = possible confusion
  missingInLLM: string[];       // truth peers the models never mention
}

export interface CPRReport {
  kera: KERAResult | null;
  citationShare: CitationShareResult;
  sps: SPSResult;
  vpc: VPCResult;
  ipa: IPAResult | null;
  dataCoverage: {
    answersTotal: number;
    answersWithBrand: number;
    modelsObserved: number;
  };
}

// ─── Small helpers ────────────────────────────────────────────────────────
function charNGrams(s: string, n = 3): Set<string> {
  const out = new Set<string>();
  const clean = s.toLowerCase().replace(/\s+/g, '');
  for (let i = 0; i <= clean.length - n; i++) out.add(clean.slice(i, i + n));
  return out;
}
function ngramSim(a: string, b: string, n = 3): number {
  if (!a || !b) return 0;
  if (a.toLowerCase().trim() === b.toLowerCase().trim()) return 1;
  const A = charNGrams(a, n);
  const B = charNGrams(b, n);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

// ─── 1. KERA · Key Entity Recognition Accuracy ────────────────────────────
export function computeKERA(
  answers: CPRProbeAnswerIn[],
  gt: CPRGroundTruth,
): KERAResult | null {
  // Only use answers where the brand is mentioned (otherwise the LLM didn't
  // even recognize we're asking about this brand).
  const valid = answers.filter((a) => a.ok && a.analysis.brand_mentioned);
  if (!valid.length) return null;

  // Group by model → concat all answers the model gave about this brand
  const byModel = new Map<string, string>();
  for (const a of valid) {
    byModel.set(a.modelId, (byModel.get(a.modelId) || '') + ' ' + a.answer);
  }

  const attrs: Array<{ key: keyof CPRGroundTruth; label: string }> = [
    { key: 'canonical_name',   label: 'Canonical name' },
    { key: 'industry',         label: 'Industry' },
    { key: 'primary_category', label: 'Primary category' },
    { key: 'headquarters',     label: 'Headquarters / origin' },
    { key: 'founded_year',     label: 'Founded year' },
    { key: 'founder',          label: 'Founder' },
    { key: 'target_market',    label: 'Target market' },
  ];

  const perAttribute: KERAResult['perAttribute'] = [];
  let sumAccuracy = 0;
  let testedCount = 0;

  for (const { key, label } of attrs) {
    const truth = gt[key];
    if (truth === undefined || truth === null || truth === '') {
      perAttribute.push({ attribute: label, tested: false, correctModels: 0, totalModels: 0, evidence: [] });
      continue;
    }
    testedCount++;
    const truthStr = String(truth).toLowerCase();
    let correct = 0;
    const evidence: KERAResult['perAttribute'][number]['evidence'] = [];

    for (const [modelId, text] of byModel) {
      const lower = text.toLowerCase();
      // Exact substring hit → correct. Else N-gram sim against best-matching window.
      let verdict: 'correct' | 'incorrect' | 'absent' = 'absent';
      let snippet = '';
      if (lower.includes(truthStr)) {
        verdict = 'correct';
        const idx = lower.indexOf(truthStr);
        snippet = text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + truthStr.length + 40));
      } else if (typeof truth === 'number') {
        // Year attribute — look for digits within ±2
        const yearRe = /\b(19|20)\d{2}\b/g;
        const years = Array.from(text.matchAll(yearRe)).map((m) => parseInt(m[0], 10));
        const close = years.find((y) => Math.abs(y - (truth as number)) <= 2);
        if (close === truth) { verdict = 'correct'; snippet = `…${close}…`; }
        else if (close !== undefined) { verdict = 'incorrect'; snippet = `mentioned ${close}, expected ${truth}`; }
      } else {
        // Fuzzy N-gram over tokens — cheap sliding window
        const tokens = text.split(/\s+/);
        let bestSim = 0;
        let bestWindow = '';
        const windowLen = Math.max(3, truthStr.split(/\s+/).length + 1);
        for (let i = 0; i + windowLen <= tokens.length; i++) {
          const w = tokens.slice(i, i + windowLen).join(' ');
          const s = ngramSim(truthStr, w);
          if (s > bestSim) { bestSim = s; bestWindow = w; }
        }
        if (bestSim >= 0.6) {
          verdict = 'correct';
          snippet = bestWindow;
        } else if (bestSim >= 0.35) {
          // Some overlap but below threshold — user can inspect
          verdict = 'incorrect';
          snippet = `~${(bestSim * 100).toFixed(0)}% match: "${bestWindow.slice(0, 80)}"`;
        }
      }
      if (verdict === 'correct') correct++;
      evidence.push({ modelId, snippet: snippet.slice(0, 160), verdict });
    }

    const total = byModel.size;
    sumAccuracy += total ? correct / total : 0;
    perAttribute.push({ attribute: label, tested: true, correctModels: correct, totalModels: total, evidence });
  }

  const score = testedCount ? Math.round((sumAccuracy / testedCount) * 100) : 0;
  return { score, perAttribute, sampleSize: valid.length };
}

// ─── 2. Citation Share · Zipf-weighted SOV ────────────────────────────────

/**
 * Try to extract ranked list items from a free-form LLM answer.
 * Handles:
 *   1) 1. Item
 *   2) "- Item" bullets
 *   3) "First... Second... Third..."
 *   4) Common CJK numbered lists
 */
function extractRankedItems(answer: string): string[] {
  const lines = answer.split('\n').map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^(\(?\d+[).\]]|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十][、.)])/.test(l));
  if (numbered.length >= 2) {
    return numbered.map((l) => l.replace(/^(\(?\d+[).\]]|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十][、.)])\s*/, '').trim());
  }
  const bullets = lines.filter((l) => /^[-*•·]/.test(l));
  if (bullets.length >= 2) return bullets.map((l) => l.replace(/^[-*•·]\s*/, '').trim());

  // Ordinal words (English)
  const ord = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[,:]?\s+/gi;
  const parts = answer.split(ord).slice(1);
  if (parts.length >= 4) {
    const items: string[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const seg = parts[i].split(/[.!?]/)[0];
      if (seg) items.push(seg.trim());
    }
    if (items.length >= 2) return items;
  }
  return [];
}

function itemMentionsBrand(item: string, brand: string, aliases: string[] = []): boolean {
  const lo = item.toLowerCase();
  if (lo.includes(brand.toLowerCase())) return true;
  return aliases.some((a) => a && lo.includes(a.toLowerCase()));
}

export function computeCitationShare(
  answers: CPRProbeAnswerIn[],
  brand: string,
  aliases: string[] = [],
): CitationShareResult {
  const perStage: Record<string, { shares: number[]; rankSamples: number[] }> = {};
  const perModel: Record<string, { shares: number[]; samples: number }> = {};
  const zipfDenominatorByN: Record<number, number> = {};

  let rankedAnswers = 0;
  const allShares: number[] = [];

  for (const a of answers) {
    if (!a.ok) continue;
    const items = extractRankedItems(a.answer);
    if (items.length < 2) continue;

    const N = items.length;
    if (!zipfDenominatorByN[N]) {
      let s = 0;
      for (let i = 1; i <= N; i++) s += 1 / i;
      zipfDenominatorByN[N] = s;
    }

    // Find earliest rank where brand is mentioned
    let rank = -1;
    for (let i = 0; i < N; i++) {
      if (itemMentionsBrand(items[i], brand, aliases)) { rank = i + 1; break; }
    }

    rankedAnswers++;
    const share = rank > 0 ? (1 / rank) / zipfDenominatorByN[N] : 0;
    allShares.push(share);

    if (!perStage[a.stage]) perStage[a.stage] = { shares: [], rankSamples: [] };
    perStage[a.stage].shares.push(share);
    if (rank > 0) perStage[a.stage].rankSamples.push(rank);

    if (!perModel[a.modelId]) perModel[a.modelId] = { shares: [], samples: 0 };
    perModel[a.modelId].shares.push(share);
    perModel[a.modelId].samples++;
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    score: Math.round(mean(allShares) * 100),
    perStage: Object.fromEntries(
      Object.entries(perStage).map(([k, v]) => [k, { share: Math.round(mean(v.shares) * 100), rankSamples: v.rankSamples }]),
    ),
    perModel: Object.fromEntries(
      Object.entries(perModel).map(([k, v]) => [k, { share: Math.round(mean(v.shares) * 100), samples: v.samples }]),
    ),
    zipfDenominatorByN,
    rankedAnswers,
  };
}

// ─── 3. SPS · Sentiment Polarity Score ────────────────────────────────────

/** Compact multilingual sentiment lexicon. Weights on [-1, +1]. */
const LEXICON: Record<string, number> = {
  // English — positive
  best: 0.9, excellent: 0.9, leading: 0.8, innovative: 0.7, trusted: 0.7, reliable: 0.7, popular: 0.5,
  premium: 0.6, strong: 0.5, top: 0.7, renowned: 0.7, reputable: 0.8, preferred: 0.6, growing: 0.4,
  recommend: 0.7, recommended: 0.7, powerful: 0.6, efficient: 0.5, impressive: 0.7, quality: 0.5,
  // English — negative
  poor: -0.7, weak: -0.7, struggling: -0.8, declining: -0.8, outdated: -0.7, lagging: -0.7, scandal: -0.9,
  controversial: -0.6, criticized: -0.7, recall: -0.6, lawsuit: -0.7, bankruptcy: -0.9, limited: -0.4,
  bad: -0.7, worst: -0.9, disappointing: -0.7, unreliable: -0.8, expensive: -0.3, overpriced: -0.6,
  // Chinese
  '优秀': 0.8, '领先': 0.8, '创新': 0.7, '可靠': 0.7, '知名': 0.6, '优质': 0.7, '领导者': 0.8,
  '糟糕': -0.8, '落后': -0.7, '问题': -0.5, '争议': -0.6, '下滑': -0.7, '低劣': -0.8,
  // Indonesian
  terbaik: 0.9, unggul: 0.8, terkemuka: 0.8, andal: 0.7, populer: 0.5, berkualitas: 0.7, inovatif: 0.7,
  buruk: -0.7, lemah: -0.7, mahal: -0.3, bermasalah: -0.6, tertinggal: -0.7,
  // Vietnamese
  'tốt': 0.7, 'hàng đầu': 0.8, 'đáng tin cậy': 0.7, 'chất lượng': 0.6, 'nổi tiếng': 0.6,
  'kém': -0.7, 'yếu': -0.7, 'đắt': -0.3,
  // Thai
  'ดีที่สุด': 0.9, 'ชั้นนำ': 0.8, 'น่าเชื่อถือ': 0.7, 'มีคุณภาพ': 0.6,
  'แย่': -0.7, 'อ่อนแอ': -0.7,
};

/** Negators flip polarity within a small window */
const NEGATORS = new Set(['not', 'no', 'never', "don't", "doesn't", "isn't", "wasn't", "won't", '不', '没', 'tidak', 'bukan', 'không', 'ไม่']);

export function computeSPS(
  answers: CPRProbeAnswerIn[],
  brand: string,
  aliases: string[] = [],
): SPSResult {
  const perModel: Record<string, { scores: number[]; pos: number; neg: number }> = {};
  const excerpts: SPSResult['excerpts'] = [];
  const warnings: string[] = [];
  const brandTerms = [brand, ...aliases].filter(Boolean).map((s) => s.toLowerCase());

  for (const a of answers) {
    if (!a.ok || !a.analysis.brand_mentioned) continue;
    const tokens = a.answer.toLowerCase().split(/\s+|(?<=[\u4e00-\u9fff])|(?=[\u4e00-\u9fff])/g).filter(Boolean);

    // locate brand mention indices
    const brandIndices: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (brandTerms.some((bt) => tokens[i].includes(bt) || (bt.length > 3 && tokens[i].startsWith(bt.slice(0, 4))))) {
        brandIndices.push(i);
      }
    }
    if (!brandIndices.length) continue;

    let score = 0, pos = 0, neg = 0, hits = 0;
    let bestExcerpt = '';
    let bestAbs = 0;

    for (const idx of brandIndices) {
      const start = Math.max(0, idx - 15);
      const end = Math.min(tokens.length, idx + 16);
      for (let j = start; j < end; j++) {
        const t = tokens[j];
        const w = LEXICON[t];
        if (w === undefined) continue;
        // negation check: look back 3 tokens
        let effW = w;
        for (let k = Math.max(start, j - 3); k < j; k++) {
          if (NEGATORS.has(tokens[k])) { effW = -effW; break; }
        }
        score += effW;
        if (effW > 0) pos++; else neg++;
        hits++;
        if (Math.abs(effW) > bestAbs) {
          bestAbs = Math.abs(effW);
          const clipS = Math.max(0, idx - 10);
          const clipE = Math.min(tokens.length, idx + 10);
          bestExcerpt = tokens.slice(clipS, clipE).join(' ').slice(0, 160);
        }
      }
    }

    if (hits === 0) continue;  // no sentiment content around brand mention
    const polarity = Math.max(-1, Math.min(1, score / Math.max(hits, 3)));

    if (!perModel[a.modelId]) perModel[a.modelId] = { scores: [], pos: 0, neg: 0 };
    perModel[a.modelId].scores.push(polarity);
    perModel[a.modelId].pos += pos;
    perModel[a.modelId].neg += neg;

    if (Math.abs(polarity) > 0.15) {
      excerpts.push({ modelId: a.modelId, stage: a.stage, polarity: Number(polarity.toFixed(2)), text: bestExcerpt });
    }
  }

  const modelEntries = Object.entries(perModel).map(([k, v]) => {
    const mean = v.scores.reduce((a, b) => a + b, 0) / Math.max(1, v.scores.length);
    return [k, { polarity: Number(mean.toFixed(3)), positives: v.pos, negatives: v.neg, samples: v.scores.length }] as const;
  });

  const polarities = modelEntries.map(([, v]) => v.polarity);
  const overall = polarities.length ? polarities.reduce((a, b) => a + b, 0) / polarities.length : 0;
  const drift = polarities.length >= 2 ? (Math.max(...polarities) - Math.min(...polarities)) : 0;

  if (drift >= 0.6) warnings.push(`High cross-model sentiment drift (${drift.toFixed(2)}) — one model is significantly more negative than the others`);
  if (excerpts.length === 0) warnings.push('No sentiment-bearing context found around brand mentions — consider adding more evaluative probes');

  return {
    score: Math.round(overall * 100),
    perModel: Object.fromEntries(modelEntries),
    drift: Math.round(drift * 100),
    warnings,
    excerpts: excerpts.sort((a, b) => Math.abs(b.polarity) - Math.abs(a.polarity)).slice(0, 6),
  };
}

// ─── 4. VPC · Value Proposition Consistency ───────────────────────────────

/** Extract noun-ish keyphrases (tokens of length ≥4 that aren't stopwords) */
const VPC_STOP = new Set([
  'the','and','for','with','that','this','their','they','them','from','has','have','been',
  'brand','company','business','product','products','services','service','market','industry',
  '的','是','以','和','与','等','在','有','为',
]);

function keyPhrasesFrom(text: string): Set<string> {
  const out = new Set<string>();
  const tokens = text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/);
  for (const tok of tokens) {
    if (tok.length >= 4 && !VPC_STOP.has(tok)) out.add(tok);
  }
  return out;
}

export function computeVPC(answers: CPRProbeAnswerIn[]): VPCResult {
  // Pick answers likely to express value prop — any stage works, but prefer ones with brand mentioned
  const valid = answers.filter((a) => a.ok && a.analysis.brand_mentioned);
  const byModel = new Map<string, Set<string>>();
  for (const a of valid) {
    if (!byModel.has(a.modelId)) byModel.set(a.modelId, new Set());
    for (const k of keyPhrasesFrom(a.answer)) byModel.get(a.modelId)!.add(k);
  }

  const models = Array.from(byModel.keys());
  const sets = Array.from(byModel.values());
  if (sets.length < 2) {
    return { score: 0, sharedPhrases: [], perModelPhrases: {}, pairwiseJaccard: 0 };
  }

  // Shared = intersection across ALL models
  const shared = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    for (const x of shared) if (!sets[i].has(x)) shared.delete(x);
  }

  // Pairwise Jaccard
  let sum = 0, pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      let inter = 0;
      for (const x of sets[i]) if (sets[j].has(x)) inter++;
      const union = sets[i].size + sets[j].size - inter;
      if (union > 0) { sum += inter / union; pairs++; }
    }
  }
  const jacc = pairs ? sum / pairs : 0;

  const perModelPhrases: Record<string, string[]> = {};
  for (let i = 0; i < models.length; i++) {
    // Model-unique phrases: in this model, not in shared
    const own: string[] = [];
    for (const x of sets[i]) if (!shared.has(x)) own.push(x);
    perModelPhrases[models[i]] = own.slice(0, 12);
  }

  return {
    score: Math.round(jacc * 100),
    sharedPhrases: Array.from(shared).slice(0, 16),
    perModelPhrases,
    pairwiseJaccard: Number(jacc.toFixed(3)),
  };
}

// ─── 5. IPA · Industry Position Alignment ─────────────────────────────────
export function computeIPA(
  answers: CPRProbeAnswerIn[],
  truthPeers: string[],
): IPAResult | null {
  if (!truthPeers?.length) return null;

  // LLM peer set: union of candidate_entities across competitor/comparison-style stages
  const focus = new Set(['comparison', 'consideration', 'awareness']);
  const llmPeers = new Set<string>();
  for (const a of answers) {
    if (!a.ok) continue;
    if (!focus.has(a.stage) && a.analysis.brand_mentioned === false) continue;
    for (const e of a.analysis.candidate_entities || []) {
      const normed = e.trim().toLowerCase();
      if (normed.length >= 2) llmPeers.add(normed);
    }
  }

  const truthLower = truthPeers.map((p) => p.trim().toLowerCase()).filter(Boolean);
  const truthSet = new Set(truthLower);

  const intersection = Array.from(truthSet).filter((p) => {
    // exact or substring match — competitor names are often abbreviated in answers
    for (const l of llmPeers) {
      if (l === p || l.includes(p) || p.includes(l)) return true;
    }
    return false;
  });

  const missingInLLM = Array.from(truthSet).filter((p) => !intersection.includes(p));
  const onlyInLLM = Array.from(llmPeers).filter((l) => {
    for (const t of truthSet) {
      if (l === t || l.includes(t) || t.includes(l)) return false;
    }
    return true;
  });

  const score = truthSet.size ? Math.round((intersection.length / truthSet.size) * 100) : 0;

  return {
    score,
    llmPeerSet: Array.from(llmPeers).slice(0, 20),
    truthPeerSet: Array.from(truthSet),
    intersection,
    onlyInLLM: onlyInLLM.slice(0, 10),
    missingInLLM,
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────
export function computeCPR(
  answers: CPRProbeAnswerIn[],
  opts: {
    brand: string;
    aliases?: string[];
    groundTruth?: CPRGroundTruth;
    truthPeers?: string[];
  },
): CPRReport {
  const aliases = opts.aliases ?? [];
  const gt = opts.groundTruth ?? { canonical_name: opts.brand, aliases };

  const answersTotal = answers.length;
  const answersWithBrand = answers.filter((a) => a.ok && a.analysis.brand_mentioned).length;
  const modelsObserved = new Set(answers.filter((a) => a.ok).map((a) => a.modelId)).size;

  return {
    kera: computeKERA(answers, gt),
    citationShare: computeCitationShare(answers, opts.brand, aliases),
    sps: computeSPS(answers, opts.brand, aliases),
    vpc: computeVPC(answers),
    ipa: computeIPA(answers, opts.truthPeers ?? []),
    dataCoverage: { answersTotal, answersWithBrand, modelsObserved },
  };
}
