// Report verification gate — the provenance layer under the interpretation.
//
// The interpretation model tags its prose [Observed] / [Inferred] /
// [Hypothesis]. Until now nothing checked those tags: a model that invented a
// Vietnamese directory domain, or quoted a percentage that appears nowhere in
// the scan, shipped that claim to the client wearing an evidence label. A
// partner audit named exactly this on 2026-09-03 ("unverified judgements in the
// report"), and they were right — the discipline existed only as an instruction.
//
// The gate does NOT ask the model to declare its own sources; a model that
// hallucinates a fact will hallucinate its citation too. It EXTRACTS every
// checkable reference from the emitted prose and tests each against the data
// the report is actually built on:
//
//   domains → must appear in this project's citation index
//   engines → must be an engine this scan measured
//   figures → must appear in the scorecard / leverage aggregates
//
// A claim that fails is not silently deleted. A hallucinated domain invalidates
// the claim (it recommends acting on something that does not exist), so the
// claim is DROPPED. A weaker miss — an unsupported figure or engine — only
// invalidates the evidence CLASS, so the claim is DEMOTED to [Hypothesis] and
// kept. Every decision is recorded, and the count travels with the report:
// the client is told how many claims were checked and how many passed.

export type EvidenceClass = 'observed' | 'inferred' | 'hypothesis';

export interface GroundTruth {
  // Domains VERIFIED to exist in this project's citation index. Deliberately
  // not "every domain the project has ever cited": that list outgrew the API's
  // reply cap and came back truncated, which makes a gate fail UNSAFE — a real
  // domain past the cut reads as a hallucination and drops a correct claim.
  // The caller extracts the domains a report actually mentions and resolves
  // just those, so the set is bounded by the text, not by the index.
  domains: Set<string>;
  engines: Set<string>;       // engines measured in the scan being reported
  figures: Set<string>;       // supportable numbers, normalised to strings
}

export interface ClaimVerdict {
  text: string;
  claimed: EvidenceClass;
  outcome: 'pass' | 'demoted' | 'dropped';
  badDomains: string[];
  badEngines: string[];
  badFigures: string[];
}

export interface VerificationReport {
  checked: number;
  passed: number;
  demoted: number;
  dropped: number;
  verdicts: ClaimVerdict[];
}

// Evidence tags as the model writes them, in every language we ship.
// (zh 实测/推断/假设 · en Observed/Inferred/Hypothesis · vi Đo được/Suy luận/Giả thuyết)
const TAG_PATTERNS: [EvidenceClass, RegExp][] = [
  ['observed', /\[\s*(?:Observed|实测|實測|已测|Đo\s*được|Quan\s*sát)\s*\]/iu],
  ['inferred', /\[\s*(?:Inferred|推断|推斷|Suy\s*luận)\s*\]/iu],
  ['hypothesis', /\[\s*(?:Hypothesis|假设|假設|Giả\s*thuyết)\s*\]/iu],
];

export function classOf(text: string): EvidenceClass | null {
  for (const [cls, re] of TAG_PATTERNS) if (re.test(text)) return cls;
  return null;
}

// Rewrite whatever observed-tag the text carries into the hypothesis tag of the
// same language, so a demoted claim still reads naturally to the client.
const DEMOTE_TO: Record<string, string> = {
  Observed: 'Hypothesis', 实测: '假设', 實測: '假設', 已测: '假设',
};
export function demoteTag(text: string): string {
  return text.replace(
    /\[\s*(Observed|实测|實測|已测|Đo\s*được|Quan\s*sát)\s*\]/giu,
    (_m, tag: string) => {
      const key = String(tag).replace(/\s+/g, '');
      if (DEMOTE_TO[key]) return `[${DEMOTE_TO[key]}]`;
      return /Đo|Quan/i.test(key) ? '[Giả thuyết]' : '[Hypothesis]';
    },
  );
}

// ── Reference extraction ─────────────────────────────────────────────────────

// Hostnames. Deliberately conservative: a real TLD-shaped tail, and we reject
// tokens that are actually sentence-internal (e.g. "v.v." in Vietnamese) by
// requiring a known-shaped label and a 2+ letter final segment.
const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,3}[a-z]{2,24})\b/gi;
// Sentence punctuation and common abbreviations that match the shape above.
const DOMAIN_STOPLIST = new Set(['v.v', 'vv.vn', 'e.g', 'i.e', 'etc.co', 'a.m', 'p.m']);

export function extractDomains(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text).matchAll(DOMAIN_RE)) {
    const d = m[1].toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!d.includes('.') || DOMAIN_STOPLIST.has(d)) continue;
    // Require a plausible TLD segment (letters only, no all-numeric labels).
    const tld = d.split('.').pop()!;
    if (tld.length < 2 || /\d/.test(tld)) continue;
    out.add(d);
  }
  return [...out];
}

// Percentages and scores — the figure shapes that read as measurements. Bare
// integers ("6 câu hỏi", "1 year") are NOT checked: they are usually counts the
// model derived rather than quoted, and flagging them produces noise.
const FIGURE_RE = /(\d+(?:[.,]\d+)?)\s*%|(?:\bAIGVR|\bđiểm|\b分|\bscore)\s*(\d+(?:[.,]\d+)?)/gi;

export function extractFigures(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text).matchAll(FIGURE_RE)) {
    const raw = m[1] ?? m[2];
    if (raw != null) out.add(normFigure(raw));
  }
  return [...out];
}

function normFigure(v: string | number): string {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return String(v);
  return String(Math.round(n * 10) / 10);
}

// Engine names the model may cite. This table must cover engines we do NOT
// measure as well as the ones we do — an allowlist of only our own engines can
// catch "cites Gemini when Gemini wasn't run" but is blind to the worse case,
// a report asserting that Copilot recommends the brand when Copilot was never
// measured at all. Anything named here that is absent from the scan's engine
// set fails verification.
const ENGINE_ALIASES: Record<string, string[]> = {
  ChatGPT: ['chatgpt'],
  Perplexity: ['perplexity'],
  Claude: ['claude'],
  Gemini: ['gemini', 'bard'],
  'Google AI Overview': ['google ai overview', 'ai overview'],
  Copilot: ['copilot', 'bing chat'],
  Grok: ['grok'],
  DeepSeek: ['deepseek'],
  Doubao: ['doubao', '豆包'],
  Kimi: ['kimi'],
  'Meta AI': ['meta ai'],
  'You.com': ['you.com'],
  Qwen: ['qwen', '通义', '千问'],
  Ernie: ['ernie', '文心'],
};

export function extractEngines(text: string): string[] {
  const t = String(text).toLowerCase();
  const out = new Set<string>();
  for (const [canonical, aliases] of Object.entries(ENGINE_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) out.add(canonical);
  }
  return [...out];
}

// ── Ground truth ─────────────────────────────────────────────────────────────

/** Every number the report is allowed to present as a measurement: the
 *  scorecard's own metrics plus the leverage aggregates shown alongside. */
export function figuresFromScorecard(sc: any, extra: number[] = []): Set<string> {
  const out = new Set<string>();
  const push = (v: unknown) => {
    const n = Number(v);
    if (Number.isFinite(n)) out.add(normFigure(n));
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (typeof node === 'number') return push(node);
    if (Array.isArray(node)) return node.forEach((v) => walk(v, depth + 1));
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === 'rawSamples' || k === 'citations' || k === 'markdown') continue;
        walk(v, depth + 1);
      }
    }
  };
  walk(sc);
  extra.forEach(push);
  return out;
}

// ── The gate ─────────────────────────────────────────────────────────────────

const FIGURE_TOLERANCE = 1; // a point of rounding either way

function figureSupported(fig: string, allowed: Set<string>): boolean {
  if (allowed.has(fig)) return true;
  const n = Number(fig);
  if (!Number.isFinite(n)) return false;
  for (let d = 0.1; d <= FIGURE_TOLERANCE + 1e-9; d = Math.round((d + 0.1) * 10) / 10) {
    if (allowed.has(normFigure(n + d)) || allowed.has(normFigure(n - d))) return true;
  }
  return false;
}

/** Check one claim. Only claims asserting OBSERVATION are gated — an explicitly
 *  labelled projection is allowed to contain numbers that are not in the data;
 *  that is what makes it a projection. A hallucinated DOMAIN is fatal in any
 *  class: it points the client at something that does not exist. */
export function verifyClaim(text: string, truth: GroundTruth): ClaimVerdict {
  const claimed = classOf(text) ?? 'inferred';
  const badDomains = extractDomains(text).filter((d) => !truth.domains.has(d));
  const isObserved = claimed === 'observed';
  const badEngines = isObserved ? extractEngines(text).filter((e) => !truth.engines.has(e)) : [];
  const badFigures = isObserved
    ? extractFigures(text).filter((f) => !figureSupported(f, truth.figures))
    : [];

  let outcome: ClaimVerdict['outcome'] = 'pass';
  if (badDomains.length) outcome = 'dropped';
  else if (badEngines.length || badFigures.length) outcome = 'demoted';
  return { text, claimed, outcome, badDomains, badEngines, badFigures };
}

/** Every domain mentioned anywhere in a set of claims — the candidates the
 *  caller resolves against the index before building GroundTruth. */
export function domainCandidates(claims: string[]): string[] {
  const out = new Set<string>();
  for (const c of claims) for (const d of extractDomains(c)) out.add(d);
  return [...out];
}

/** Run the gate over a list of claims, returning the surviving text (demoted
 *  claims rewritten) plus the report that travels with the digest. */
export function gate(
  claims: string[],
  truth: GroundTruth,
): { kept: string[]; report: VerificationReport } {
  const verdicts = claims.map((c) => verifyClaim(c, truth));
  const kept: string[] = [];
  for (const v of verdicts) {
    if (v.outcome === 'dropped') continue;
    kept.push(v.outcome === 'demoted' ? demoteTag(v.text) : v.text);
  }
  return {
    kept,
    report: {
      checked: verdicts.length,
      passed: verdicts.filter((v) => v.outcome === 'pass').length,
      demoted: verdicts.filter((v) => v.outcome === 'demoted').length,
      dropped: verdicts.filter((v) => v.outcome === 'dropped').length,
      verdicts,
    },
  };
}
