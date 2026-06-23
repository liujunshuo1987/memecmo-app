/**
 * Regional Site Discovery — pure logic for identifying a brand's
 * country-specific canonical URL.
 *
 * This module has NO network I/O. The API route at
 * `app/api/regional-audit/route.ts` does the actual fetches and uses these
 * helpers to reason about what it sees.
 *
 * See: docs/REGIONAL_SITE_DISCOVERY.md
 */

// ─── Country → URL pattern table ──────────────────────────────────────────
export interface CountryPattern {
  /** Primary language codes expected on the regional site */
  primary: string[];
  /** Acceptable fallback languages */
  acceptable: string[];
  /** Common ccTLD suffixes (for full-domain substitution) */
  tlds: string[];
  /** Path hint tokens, tried as subpath and as first path segment */
  pathHints: string[];
}

export const COUNTRY_PATTERNS: Record<string, CountryPattern> = {
  ID: { primary: ['id'],        acceptable: ['en'],       tlds: ['co.id', 'id', 'com'],      pathHints: ['id', 'id-id', 'en-id', 'idn'] },
  VN: { primary: ['vi'],        acceptable: ['en'],       tlds: ['vn', 'com.vn'],            pathHints: ['vn', 'vi', 'vi-vn'] },
  TH: { primary: ['th'],        acceptable: ['en'],       tlds: ['co.th', 'th'],             pathHints: ['th', 'th-th', 'en-th'] },
  MY: { primary: ['ms', 'en'],  acceptable: ['zh'],       tlds: ['com.my', 'my'],            pathHints: ['my', 'ms-my', 'en-my'] },
  SG: { primary: ['en'],        acceptable: ['zh', 'ms'], tlds: ['com.sg', 'sg'],            pathHints: ['sg', 'en-sg', 'zh-sg'] },
  PH: { primary: ['en', 'fil'], acceptable: ['tl'],       tlds: ['com.ph', 'ph'],            pathHints: ['ph', 'en-ph'] },
  KH: { primary: ['km'],        acceptable: ['en'],       tlds: ['com.kh', 'kh'],            pathHints: ['kh', 'km-kh'] },
  MM: { primary: ['my'],        acceptable: ['en'],       tlds: ['com.mm', 'mm'],            pathHints: ['mm', 'my-mm'] },
  LA: { primary: ['lo'],        acceptable: ['en'],       tlds: ['la'],                      pathHints: ['la', 'lo-la'] },
  BN: { primary: ['ms'],        acceptable: ['en'],       tlds: ['com.bn'],                  pathHints: ['bn'] },
};

// ─── Candidate URL generation ─────────────────────────────────────────────
export interface CandidateURL {
  url: string;
  source: 'hreflang' | 'subpath' | 'subpath_langcode' | 'subdomain' | 'cctld';
  rationale: string;
}

/** Strip trailing slash + normalize protocol */
function norm(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    let s = parsed.toString();
    if (s.endsWith('/') && parsed.pathname === '/') s = s.slice(0, -1);
    return s;
  } catch {
    return u.replace(/\/$/, '');
  }
}

/**
 * Generate candidate regional URLs for a brand's global site.
 *
 * Pure: no network calls. Caller is expected to subsequently validate these
 * with HEAD requests.
 */
export function generateCandidates(brandHomepage: string, country: string): CandidateURL[] {
  const cc = country.toUpperCase();
  const pattern = COUNTRY_PATTERNS[cc];
  if (!pattern) return [];

  let parsed: URL;
  try {
    parsed = new URL(brandHomepage);
  } catch {
    return [];
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const scheme = parsed.protocol;
  const out: CandidateURL[] = [];

  // A. Subpath patterns on the existing host
  for (const hint of pattern.pathHints) {
    out.push({
      url: norm(`${scheme}//${parsed.hostname}/${hint}`),
      source: hint.length === 2 ? 'subpath' : 'subpath_langcode',
      rationale: `path "/${hint}" is a common ${cc} regional token`,
    });
  }

  // B. Subdomain patterns
  for (const hint of pattern.pathHints.slice(0, 2)) {
    out.push({
      url: norm(`${scheme}//${hint}.${host}`),
      source: 'subdomain',
      rationale: `${hint}.${host} — subdomain convention`,
    });
  }

  // C. ccTLD replacements on the registered brand root
  // Extract the "brand" label by stripping known global TLDs
  const hostParts = host.split('.');
  const brandLabel = hostParts[0];
  for (const tld of pattern.tlds) {
    const cand = `${scheme}//${brandLabel}.${tld}`;
    if (cand !== `${scheme}//${host}` && cand !== `${scheme}//${parsed.hostname}`) {
      out.push({
        url: norm(cand),
        source: 'cctld',
        rationale: `ccTLD ${brandLabel}.${tld}`,
      });
    }
  }

  // Dedup
  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return c.url !== norm(brandHomepage);
  });
}

// ─── hreflang parsing ─────────────────────────────────────────────────────
export interface HreflangEntry {
  hreflang: string;
  href: string;
}

/** Extract all <link rel="alternate" hreflang="..." href="..."> entries */
export function parseHreflang(html: string): HreflangEntry[] {
  const out: HreflangEntry[] = [];
  const re = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const h = tag.match(/hreflang=["']([^"']+)["']/i);
    const f = tag.match(/href=["']([^"']+)["']/i);
    if (h && f) out.push({ hreflang: h[1], href: f[1] });
  }
  return out;
}

/**
 * Given a hreflang list and a target country, pick the best-matching href.
 * Matching strategy (most → least specific):
 *   1. exact region+lang (e.g. id-ID matches country=ID + primary lang)
 *   2. region only (hreflang="ID")
 *   3. language-only matching one of primary languages
 *   4. x-default (as fallback anchor)
 */
export function pickHreflangForCountry(
  entries: HreflangEntry[],
  country: string,
): { match: HreflangEntry | null; reason: string } {
  const cc = country.toUpperCase();
  const pattern = COUNTRY_PATTERNS[cc];
  const primary = pattern?.primary ?? [];

  // Normalize each entry to { lang, region }
  const parsed = entries.map((e) => {
    const [lang = '', region = ''] = e.hreflang.toLowerCase().split('-');
    return { ...e, lang, region: region.toUpperCase() };
  });

  // 1. region + primary lang
  for (const e of parsed) {
    if (e.region === cc && primary.includes(e.lang)) {
      return { match: e, reason: `hreflang ${e.hreflang} matches country+primary language` };
    }
  }
  // 2. region any lang
  for (const e of parsed) {
    if (e.region === cc) {
      return { match: e, reason: `hreflang ${e.hreflang} matches country ${cc}` };
    }
  }
  // 3. language-only match (fallback)
  for (const e of parsed) {
    if (!e.region && primary.includes(e.lang)) {
      return { match: e, reason: `hreflang ${e.hreflang} matches target language` };
    }
  }
  // 4. x-default
  for (const e of parsed) {
    if (e.hreflang.toLowerCase() === 'x-default') {
      return { match: e, reason: `only x-default available — no country-specific hreflang` };
    }
  }
  return { match: null, reason: `no hreflang entry matched country ${cc}` };
}

// ─── Regional-fit scoring ─────────────────────────────────────────────────
export interface CandidateProbe {
  url: string;
  finalUrl: string;
  httpStatus: number;
  source: CandidateURL['source'] | 'hreflang';
  /** Extracted <html lang> if accessible */
  htmlLang?: string | null;
  /** Raw content-language header or meta */
  contentLang?: string | null;
  /** Sampled body text (first ~1000 chars after stripping tags) */
  bodySample?: string;
  /** `true` if finalUrl normalizes to the global homepage */
  isEcho?: boolean;
}

export interface RegionalFitResult {
  score: number;                         // 0..100
  components: {
    langMatch: number;                   // 0..100
    urlSignal: number;                   // 0..100
    contentLang: number;                 // 0..100
    hreflangSource: number;              // 0..100
  };
  verdict: 'strong' | 'moderate' | 'weak' | 'echo';
  reasons: string[];
}

/**
 * Detect target-language signal in body text by counting distinctive script
 * code-points. Used as a fallback when <html lang> is absent/wrong.
 */
function detectLanguageSignal(text: string, targetLangs: string[]): number {
  if (!text) return 0;
  const sample = text.slice(0, 2000);
  const total = sample.length || 1;

  // script-ratio per target lang
  const scripts: Record<string, RegExp> = {
    th: /[\u0E00-\u0E7F]/g,
    vi: /[\u00C0-\u1EF9]/g,          // Vietnamese diacritics
    zh: /[\u4E00-\u9FFF]/g,
    km: /[\u1780-\u17FF]/g,
    my: /[\u1000-\u109F]/g,          // Burmese / also Myanmar Zawgyi
    lo: /[\u0E80-\u0EFF]/g,
    // id/ms/en/fil all use Latin; lean on token frequency instead
  };

  let best = 0;
  for (const lang of targetLangs) {
    if (scripts[lang]) {
      const matches = sample.match(scripts[lang]) || [];
      best = Math.max(best, Math.min(100, (matches.length / total) * 400));
    } else if (lang === 'id' || lang === 'ms' || lang === 'fil') {
      // Latin-script detection via common function words
      const markers = {
        id: ['yang', 'dengan', 'dan', 'untuk', 'adalah', 'tidak'],
        ms: ['yang', 'dengan', 'dan', 'untuk', 'adalah', 'tidak', 'ialah'],
        fil: ['ang', 'mga', 'para', 'sa', 'ito', 'ayon'],
      }[lang as 'id' | 'ms' | 'fil'];
      const lower = sample.toLowerCase();
      const hits = markers.filter((w) => new RegExp(`\\b${w}\\b`, 'g').test(lower)).length;
      best = Math.max(best, (hits / markers.length) * 100);
    } else if (lang === 'en') {
      const markers = ['the', 'and', 'with', 'for', 'this', 'that'];
      const lower = sample.toLowerCase();
      const hits = markers.filter((w) => new RegExp(`\\b${w}\\b`, 'g').test(lower)).length;
      best = Math.max(best, (hits / markers.length) * 80);  // cap lower — English is ambiguous
    }
  }
  return best;
}

export function scoreRegionalFit(
  probe: CandidateProbe,
  country: string,
): RegionalFitResult {
  const cc = country.toUpperCase();
  const pattern = COUNTRY_PATTERNS[cc];
  const targets = pattern ? [...pattern.primary, ...pattern.acceptable] : [];

  if (probe.isEcho || probe.httpStatus >= 400) {
    return {
      score: 0,
      components: { langMatch: 0, urlSignal: 0, contentLang: 0, hreflangSource: 0 },
      verdict: probe.isEcho ? 'echo' : 'weak',
      reasons: probe.isEcho
        ? ['redirects back to global site — not a distinct regional presence']
        : [`http ${probe.httpStatus}`],
    };
  }

  const reasons: string[] = [];

  // 1. langMatch (40%)
  const lang = (probe.htmlLang || '').toLowerCase().split('-')[0];
  let langMatch = 0;
  if (pattern?.primary.includes(lang)) { langMatch = 100; reasons.push(`<html lang="${lang}"> ✓ primary`); }
  else if (pattern?.acceptable.includes(lang)) { langMatch = 60; reasons.push(`<html lang="${lang}"> ~ acceptable`); }
  else if (lang) { langMatch = 20; reasons.push(`<html lang="${lang}"> not a target language`); }
  else { reasons.push(`<html lang> missing`); }

  // 2. urlSignal (30%)
  const urlLower = probe.finalUrl.toLowerCase();
  let urlSignal = 0;
  if (pattern) {
    for (const hint of pattern.pathHints) {
      if (new RegExp(`(?:/|\\.|-)${hint}(?:/|\\.|-|$)`).test(urlLower)) {
        urlSignal = Math.max(urlSignal, 100);
        reasons.push(`URL contains "${hint}"`);
        break;
      }
    }
    if (urlSignal === 0) {
      for (const tld of pattern.tlds) {
        if (urlLower.includes(`.${tld}`)) {
          urlSignal = 90; reasons.push(`ccTLD .${tld}`); break;
        }
      }
    }
  }

  // 3. contentLang (20%)
  const contentLang = detectLanguageSignal(probe.bodySample || '', targets);
  if (contentLang >= 60) reasons.push(`body text reads as target language (${contentLang.toFixed(0)})`);
  else if (contentLang > 0) reasons.push(`weak target-language signal in body (${contentLang.toFixed(0)})`);

  // 4. hreflangSource (10%)
  const hreflangSource = probe.source === 'hreflang' ? 100 : 0;
  if (hreflangSource) reasons.push(`declared by brand via <link rel="alternate" hreflang>`);

  const score = langMatch * 0.4 + urlSignal * 0.3 + contentLang * 0.2 + hreflangSource * 0.1;
  const verdict: RegionalFitResult['verdict'] =
    score >= 70 ? 'strong' : score >= 50 ? 'moderate' : 'weak';

  return {
    score: Math.round(score),
    components: {
      langMatch: Math.round(langMatch),
      urlSignal: Math.round(urlSignal),
      contentLang: Math.round(contentLang),
      hreflangSource,
    },
    verdict,
    reasons,
  };
}

// ─── Regional AEO checks (augmenting brand-audit) ─────────────────────────
export interface RegionalAEOChecks {
  html_lang_matches_country: boolean;
  hreflang_cluster_complete: boolean;
  has_x_default: boolean;
  json_ld_sameAs_links: boolean;
  has_LocalBusiness_schema: boolean;
  content_wordcount_native_ok: boolean;
  /** 0..100 composite of the booleans weighted */
  regional_aeo_score: number;
}

export function computeRegionalAEOChecks(opts: {
  country: string;
  htmlLang: string | null;
  hreflangEntries: HreflangEntry[];
  jsonld: Array<Record<string, unknown>>;
  wordCount: number;
  bodyLanguageSignal: number;  // 0..100 from detectLanguageSignal
}): RegionalAEOChecks {
  const cc = opts.country.toUpperCase();
  const pattern = COUNTRY_PATTERNS[cc];
  const primaryLangs = pattern?.primary ?? [];

  const lang = (opts.htmlLang || '').toLowerCase().split('-')[0];
  const html_lang_matches_country = primaryLangs.includes(lang);

  const hrefs = opts.hreflangEntries;
  const has_x_default = hrefs.some((e) => e.hreflang.toLowerCase() === 'x-default');
  const hreflang_cluster_complete = hrefs.length >= 3 && has_x_default;

  // JSON-LD checks
  let json_ld_sameAs_links = false;
  let has_LocalBusiness_schema = false;
  const LOCAL_TYPES = new Set(['LocalBusiness', 'Store', 'Restaurant', 'Hotel', 'AutoDealer', 'FinancialService']);
  for (const obj of opts.jsonld) {
    const t = (obj as any)['@type'];
    const types = Array.isArray(t) ? t : t ? [t] : [];
    if (types.some((x: string) => LOCAL_TYPES.has(x))) has_LocalBusiness_schema = true;
    const sa = (obj as any).sameAs;
    if (sa && (Array.isArray(sa) ? sa.length : true)) json_ld_sameAs_links = true;
  }

  const content_wordcount_native_ok = opts.wordCount >= 300 && opts.bodyLanguageSignal >= 40;

  const weights = {
    html_lang_matches_country: 25,
    hreflang_cluster_complete: 20,
    json_ld_sameAs_links: 15,
    has_LocalBusiness_schema: 15,
    has_x_default: 10,
    content_wordcount_native_ok: 15,
  };
  const s =
    (html_lang_matches_country ? weights.html_lang_matches_country : 0) +
    (hreflang_cluster_complete ? weights.hreflang_cluster_complete : 0) +
    (json_ld_sameAs_links ? weights.json_ld_sameAs_links : 0) +
    (has_LocalBusiness_schema ? weights.has_LocalBusiness_schema : 0) +
    (has_x_default ? weights.has_x_default : 0) +
    (content_wordcount_native_ok ? weights.content_wordcount_native_ok : 0);

  return {
    html_lang_matches_country,
    hreflang_cluster_complete,
    has_x_default,
    json_ld_sameAs_links,
    has_LocalBusiness_schema,
    content_wordcount_native_ok,
    regional_aeo_score: s,
  };
}

// Re-export the language detector so the API route can compute its own signals
export { detectLanguageSignal };
