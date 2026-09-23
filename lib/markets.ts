// Market → language defaults. One place that answers "which language do
// buyers ask AI in here?" (prompt panel) and "which language does the client
// read deliverables in?" (report). The two differ: a Hong Kong reader gets
// Traditional Chinese even where a panel was built in Simplified.
//
// Precedence: explicit project value → market default → 'en'.
//   prompt language      = projects.target_language ?? MARKET[country].prompt
//   deliverable language = projects.metadata.reportLanguage ?? MARKET[country].deliverable ?? target_language

export const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  th: 'Thai',
  fil: 'Filipino (Tagalog)',
  tl: 'Filipino (Tagalog)',
  ms: 'Malay',
  id: 'Indonesian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese (Simplified)',
  'zh-cn': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional, Taiwan)',
  'zh-hk': 'Chinese (Traditional, Hong Kong)',
  en: 'English',
};

export const MARKET_DEFAULTS: Record<string, { prompt: string; deliverable: string }> = {
  VN: { prompt: 'vi', deliverable: 'vi' },
  TH: { prompt: 'th', deliverable: 'th' },
  ID: { prompt: 'id', deliverable: 'id' },
  MY: { prompt: 'en', deliverable: 'en' },
  SG: { prompt: 'en', deliverable: 'en' },
  PH: { prompt: 'en', deliverable: 'en' },
  HK: { prompt: 'zh-hk', deliverable: 'zh-hk' },
  TW: { prompt: 'zh-tw', deliverable: 'zh-tw' },
  CN: { prompt: 'zh', deliverable: 'zh' },
  JP: { prompt: 'ja', deliverable: 'ja' },
  KR: { prompt: 'ko', deliverable: 'ko' },
  US: { prompt: 'en', deliverable: 'en' },
  GB: { prompt: 'en', deliverable: 'en' },
  AU: { prompt: 'en', deliverable: 'en' },
};

const norm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : '');

// projects.target_country holds the display name ('Hong Kong', 'Vietnam'), not
// an ISO code — accept both. Unknown names fall through to '' (no default).
const COUNTRY_CODES: Record<string, string> = {
  vietnam: 'VN', 'viet nam': 'VN', thailand: 'TH', indonesia: 'ID', malaysia: 'MY', singapore: 'SG',
  philippines: 'PH', 'hong kong': 'HK', hongkong: 'HK', taiwan: 'TW', china: 'CN', 'mainland china': 'CN',
  japan: 'JP', korea: 'KR', 'south korea': 'KR', 'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', australia: 'AU',
};
export function countryCode(c: string | null | undefined): string {
  const v = norm(c);
  if (!v) return '';
  if (/^[a-z]{2}$/.test(v)) return v.toUpperCase();
  if (/,\s*us$/.test(v)) return 'US'; // US-state markets are stored as 'California, US'
  return COUNTRY_CODES[v] ?? '';
}
const country = countryCode;

export function promptLanguageFor(p: { target_country: string; target_language: string | null }): string {
  return norm(p.target_language) || MARKET_DEFAULTS[country(p.target_country)]?.prompt || 'en';
}

export function deliverableLanguageFor(p: { target_country: string; target_language: string | null; metadata?: Record<string, any> | null }): string {
  const override = norm(p.metadata?.reportLanguage);
  if (override && LANGUAGE_NAMES[override]) return override;
  return MARKET_DEFAULTS[country(p.target_country)]?.deliverable || norm(p.target_language) || 'en';
}

export function languageName(code: string | null | undefined): string {
  return LANGUAGE_NAMES[norm(code)] || 'English';
}

// Output token budget for a deliverable written in `lang`. Non-Latin scripts
// and diacritic-heavy Vietnamese/Thai tokenize 1.5–2× denser than English;
// the base is what the English version needed. Only the CEILING grows — a
// model that stops early costs the same — so this is safe to apply everywhere.
const TOKEN_DENSITY: Record<string, number> = { en: 1, ms: 1.25, id: 1.25, fil: 1.3, tl: 1.3, vi: 1.7, th: 1.9, zh: 1.6, ja: 1.6, ko: 1.6 };
export function outputTokenBudget(baseTokens: number, lang: string | null | undefined): number {
  const code = norm(lang).split('-')[0];
  return Math.round(baseTokens * (TOKEN_DENSITY[code] ?? 1.5));
}
