// Who owns a cited source? Distribution must never pitch a competitor's own
// site or a vendor selling the same category (FMVN CMO review, 2026-09-28: a
// kit targeted tindimedia.vn, wewin.com.vn and quangcaongoaitroi.com — all
// ad sellers that would never publish the brand).
//
// Deterministic layers, in order: operator exclusion list → competitor-set
// name match on the domain → vendor-looking cited pages ("Báo giá…" titles).
// The distribute prompt adds a model-side ownerType check as a fourth layer.

export interface CompetitorGroup {
  canonical: string;
  aliases?: string[];
  relationship?: string; // competitor | observed | self | directory
}

// Words that say nothing about who a company is; never matched on their own.
const GENERIC = new Set([
  'media', 'group', 'jsc', 'vietnam', 'viet', 'nam', 'vn', 'international', 'vina', 'advertising', 'outdoor', 'ooh',
  'company', 'co', 'ltd', 'corp', 'the', 'and', 'truyen', 'thong', 'cong', 'ty', 'quang', 'cao', 'global', 'asia',
]);
const TLDISH = new Set(['com', 'vn', 'net', 'org', 'ai', 'co', 'io', 'info', 'biz', 'asia', 'edu', 'gov', 'www']);

function slugWords(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

interface Key { key: string; exact: boolean; name: string; relationship: string }

function keysFor(g: CompetitorGroup, wordKeys: boolean, ambiguous: Set<string>): Key[] {
  const relationship = g.relationship ?? 'competitor';
  const out: Key[] = [];
  for (const n of [g.canonical, ...(g.aliases ?? [])]) {
    const words = slugWords(n);
    const full = words.join('');
    // Long keys may appear inside a domain label; short ones must BE the label.
    if (full.length >= 4) out.push({ key: full, exact: false, name: g.canonical, relationship });
    else if (full.length >= 2) out.push({ key: full, exact: true, name: g.canonical, relationship });
    if (!wordKeys) continue;
    for (const w of words) {
      // A word shared by two groups ("goldsun": the client's own Goldsun Focus
      // Media vs the separate Goldsun Media Group) identifies neither.
      if (GENERIC.has(w) || ambiguous.has(w)) continue;
      if (w.length >= 5) out.push({ key: w, exact: false, name: g.canonical, relationship });
      else if (w.length >= 3) out.push({ key: w, exact: true, name: g.canonical, relationship });
    }
  }
  return out;
}

function labels(domain: string): string[] {
  return domain.toLowerCase().replace(/^www\./, '').split('.').filter((l) => l && !TLDISH.has(l));
}

/** Matcher: domain → the competitor-set group it belongs to (self first), or null. */
export function competitorMatcher(set: { groups?: CompetitorGroup[] } | null | undefined) {
  const all = set?.groups ?? [];
  const groups = all.filter((g) => g.relationship !== 'directory');
  const seen = new Map<string, number>();
  for (const g of all) {
    for (const w of new Set([g.canonical, ...(g.aliases ?? [])].flatMap(slugWords))) seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const ambiguous = new Set([...seen].filter(([, n]) => n > 1).map(([w]) => w));
  // Self groups match on full names only, and are checked first, so the
  // client's own related sites are never labelled competitors.
  const keys = [
    ...groups.filter((g) => g.relationship === 'self').flatMap((g) => keysFor(g, false, ambiguous)),
    ...groups.filter((g) => g.relationship !== 'self').flatMap((g) => keysFor(g, true, ambiguous)),
  ];
  return (domain: string): { name: string; relationship: string } | null => {
    const ls = labels(domain);
    for (const k of keys) {
      if (ls.some((l) => (k.exact ? l === k.key : l.includes(k.key)))) return { name: k.name, relationship: k.relationship };
    }
    return null;
  };
}

const VENDOR_TITLE_RE = /báo giá|bảng giá|bao gia|bang gia|booking|dịch vụ quảng cáo|thuê màn hình|price list|pricing|rate card|报价|价格表|刊例/iu;

/**
 * A site with several price-quote/booking pages among those AI cites is a
 * seller, not a publisher. On FMVN's 897 cited domains no news site had even
 * one such title; vendors like tindimedia.vn had 6 (of 26).
 */
export function looksLikeVendor(titles: string[]): boolean {
  const t = titles.filter(Boolean);
  const hits = t.filter((x) => VENDOR_TITLE_RE.test(x)).length;
  return hits >= 3 || (hits >= 2 && hits / t.length >= 0.25);
}

export interface OwnerCheckInput {
  competitorSet?: { groups?: CompetitorGroup[] } | null;
  excludeDomains?: string[];
  sourceTitles?: Record<string, string[]>;
}

/** Returns a reason when `domain` must not be a distribution target, else null. */
export function ownerExclusion(input: OwnerCheckInput) {
  const match = competitorMatcher(input.competitorSet);
  const manual = new Set((input.excludeDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, '')));
  return (domain: string): string | null => {
    const host = String(domain || '').toLowerCase().replace(/^www\./, '');
    if ([...manual].some((m) => host === m || host.endsWith('.' + m))) return 'On the project exclusion list.';
    const c = match(host);
    if (c) {
      return c.relationship === 'self'
        ? `Brand-related site (${c.name}) — not a third-party placement.`
        : `Competitor site (${c.name}) — would never publish the brand.`;
    }
    if (looksLikeVendor(input.sourceTitles?.[host] ?? [])) {
      return 'Vendor site (cited pages are price quotes/booking for the same category) — would never publish the brand.';
    }
    return null;
  };
}
