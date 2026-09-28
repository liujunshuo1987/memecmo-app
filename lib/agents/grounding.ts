// Deterministic content guardrails shared by every content-producing agent
// (FMVN CMO review, 2026-09-28: invented prices/screen counts in a cost draft,
// a Sino-Vietnamese coinage "Tứ Khả" in a distribution kit).
//
// 1. Numbers: a numeric claim (price, %, count of screens/buildings/clients…)
//    survives only if its figures appear in the grounding corpus (canonical
//    brand facts + uploaded brand docs + text the human supplied). Anything
//    else is replaced by a placeholder the client fills in — never repaired by
//    guessing. The prompt asks for the same; this is the guarantee.
// 2. Style: a prompt block for plain, locally-natural language, plus a scan for
//    tell-tale coinages (TitleCase term + English gloss, leaked CJK in vi copy).

const PLACEHOLDER: Record<string, string> = {
  vi: '[cần số liệu]',
  zh: '[待补数字]',
  'zh-tw': '[待補數字]',
  'zh-hk': '[待補數字]',
  th: '[ต้องยืนยันตัวเลข]',
  id: '[perlu data]',
  ms: '[perlu data]',
  fil: '[kailangan ng datos]',
  tl: '[kailangan ng datos]',
  en: '[figure needed]',
};

export function numberPlaceholder(lang?: string | null): string {
  return PLACEHOLDER[(lang || 'en').toLowerCase()] ?? PLACEHOLDER.en;
}

// Units that turn a bare number into a factual claim. Durations (giây, tháng…)
// and years are deliberately absent: "15 giây" or "năm 2025" are not the
// invented-figure failure mode.
const CURRENCY_UNITS = ['đồng', 'vnđ', 'vnd', 'usd', 'đ', '₫', '元', '美元', '越南盾', 'baht', 'บาท', 'rupiah', 'ringgit', 'peso'];
// Magnitudes are not money: "3 million+ terminals" must not back "3 triệu đồng".
const MAGNITUDE_UNITS = ['triệu', 'tỷ', 'tỉ', 'nghìn', 'ngàn', 'million', 'billion', 'bn', 'k', '万', '亿'];
const MONEY_UNITS = [...CURRENCY_UNITS, ...MAGNITUDE_UNITS];
const PERCENT_UNITS = ['%', 'phần trăm', 'percent', '个百分点'];
const COUNT_UNITS = [
  'màn hình', 'tòa nhà', 'toà nhà', 'thiết bị', 'vị trí', 'điểm', 'khách hàng', 'thương hiệu', 'doanh nghiệp', 'người', 'lượt', 'lần',
  'screens', 'screen', 'buildings', 'building', 'devices', 'device', 'locations', 'location', 'clients', 'client', 'customers', 'customer',
  'brands', 'brand', 'users', 'user', 'people', 'impressions', 'impression', 'views',
  '块', '栋', '台', '个', '家', '人', '次', '倍',
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).map(esc).join('|');
// Latin-script units must not be the start of a longer word ("15 đ" ≠ "15 đến").
const NOT_LATIN = '(?![A-Za-zÀ-ỹĐđ])';
const UNIT = `(?:(?:${alt([...MONEY_UNITS, ...PERCENT_UNITS, ...COUNT_UNITS])})${NOT_LATIN})`;
const NUM = '\\d{1,3}(?:[.,\\u00a0 ]\\d{3})+(?:[.,]\\d+)?\\+?|\\d+(?:[.,]\\d+)?\\+?';
const CUR = '(?:US\\$|\\$|₫|RM|Rp\\.?|₱|¥|€)';
const RANGE = '\\s*(?:-|–|—|~|đến|tới|to|至|到)\\s*';
const CLAIM_SRC =
  `(?<![A-Za-zÀ-ỹĐđ\\d])(?:` + // CJK may sit flush against a number ("有30000块")
  `${CUR}\\s?(?:${NUM})(?:${RANGE}${CUR}?\\s?(?:${NUM}))?(?:\\s?${UNIT})*` + // $1,200 · $1-2 million
  `|(?:${NUM})(?:\\s?${UNIT})*(?:${RANGE}(?:${NUM}))?\\s?${UNIT}(?:\\s?${UNIT})*` + // 15-50 triệu đồng · 18.000 màn hình · 40%
  `)`;
// Whole-word unit matcher: "k" must not fire inside "Stock", nor "đ" inside "đến".
const LATIN = 'A-Za-zÀ-ỹĐđ';
const unitRe = (units: string[], extra = '') =>
  new RegExp(`(?<![${LATIN}])(?:${alt(units)}${extra ? `|${extra}` : ''})(?![${LATIN}])`, 'iu');
const PERCENT_RE = unitRe(PERCENT_UNITS);
const MONEY_RE = unitRe(MONEY_UNITS, CUR); // "is this a money/percent claim at all?"
const CURRENCY_RE = unitRe(CURRENCY_UNITS, CUR);

// A figure is backed only when the corpus states it with the same KIND of
// unit — "100 triệu đồng" is not backed by "100% owned", nor "5 triệu" by
// "5G". Families are cross-language: facts are often English, copy is not.
const FAMILIES: RegExp[] = [
  CURRENCY_RE,
  PERCENT_RE,
  unitRe(['màn hình', 'thiết bị', 'điểm', 'screens', 'screen', 'devices', 'device', 'touchpoints', 'touchpoint', 'points', 'point', 'displays', 'display', '块', '屏', '台']),
  unitRe(['tòa nhà', 'toà nhà', 'buildings', 'building', '栋', '楼']),
  unitRe(['người', 'khách hàng', 'people', 'users', 'user', 'clients', 'client', 'customers', 'customer', 'viewers', 'viewer', '人']),
  unitRe(['thương hiệu', 'doanh nghiệp', 'brands', 'brand', 'companies', 'advertisers', 'advertiser', '家', '品牌']),
  unitRe(['vị trí', 'locations', 'location', 'sites', 'site', 'cities', 'thành phố', '城市']),
  unitRe(['lần', 'lượt', 'phát', 'views', 'view', 'impressions', 'impression', 'plays', 'play', 'spots', 'spot', 'times', '次', '倍', '播放']),
  unitRe(MAGNITUDE_UNITS),
];
// The counted noun stays after the placeholder: "92% người tiêu dùng" →
// "[cần số liệu] người tiêu dùng", "15-20 màn hình" → "[cần số liệu] màn hình".
const COUNT_TAIL_RE = new RegExp(`(?:\\s?(?:${alt(COUNT_UNITS)}))+$`, 'iu');
const familyOf = (claim: string): RegExp | null => FAMILIES.find((re) => re.test(claim.replace(/\d/g, ''))) ?? null;

/** Canonical digit form: thousands separators dropped, decimal comma → dot. */
function normNums(s: string): string {
  let prev = '';
  let out = s;
  while (out !== prev) {
    prev = out;
    out = out.replace(/(\d)[.,  ](\d{3})(?!\d)/g, '$1$2');
  }
  return out.replace(/(\d),(\d)/g, '$1.$2');
}

function tokens(claim: string): string[] {
  return normNums(claim).match(/\d+(?:\.\d+)?/g) ?? [];
}

export interface GroundingResult {
  text: string;
  /** The ungrounded claims that were replaced, as the model wrote them. */
  removed: string[];
}

/**
 * Replace every numeric claim whose figures are absent from `corpus` with the
 * language's placeholder. Small counts (≤10, no money/percent unit — "3 lần")
 * are treated as ordinary language and left alone.
 */
export function groundNumbers(text: string, corpus: string, lang?: string | null): GroundingResult {
  if (!text) return { text, removed: [] };
  const hay = normNums(corpus || '');
  const ph = numberPlaceholder(lang);
  const removed: string[] = [];
  const out = text.replace(new RegExp(CLAIM_SRC, 'giu'), (claim) => {
    const toks = tokens(claim);
    if (!toks.length) return claim;
    const strict = PERCENT_RE.test(claim) || MONEY_RE.test(claim);
    if (!strict && toks.every((t) => Number(t) <= 10)) return claim;
    const family = familyOf(claim);
    const grounded = toks.every((t) => {
      for (const m of hay.matchAll(new RegExp(`(?<![\\d.])${esc(t)}(?!\\.?\\d)`, 'g'))) {
        const at = m.index ?? 0;
        if (!family || family.test(hay.slice(Math.max(0, at - 50), at + t.length + 50))) return true;
      }
      return false;
    });
    if (grounded) return claim;
    removed.push(claim.trim());
    const tail = claim.match(COUNT_TAIL_RE)?.[0] ?? '';
    return ph + (/^[A-Za-zÀ-ỹĐđ]/.test(tail) ? ' ' : '') + tail;
  });
  return { text: out, removed };
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese', th: 'Thai', fil: 'Filipino', tl: 'Filipino', ms: 'Malay', id: 'Indonesian',
  zh: 'Chinese', 'zh-tw': 'Chinese', 'zh-hk': 'Chinese', en: 'English',
};

/** Prompt block: the number rule + plain-language style rule for `lang`. */
export function contentRulesBlock(lang?: string | null): string {
  const code = (lang || 'en').toLowerCase();
  const name = LANGUAGE_NAMES[code] ?? 'the target language';
  const lines = [
    'CONTENT RULES (hard):',
    `- NUMBERS: use a number (price, percentage, count, market size, growth, ranking) ONLY if it appears in the CANONICAL BRAND FACTS or uploaded brand documents above. Where a number would help but is not there, write the placeholder ${numberPlaceholder(code)} instead — never estimate, round, or borrow figures from general knowledge or competitors. For price/cost questions, explain what the price depends on, without figures.`,
    `- LANGUAGE: write natural, plain ${name} the way local marketers and journalists write today. Never literally translate terms from source material written in another language (e.g. Chinese slogans or internal concept names) — describe the idea in plain words instead. Avoid jargon a business reader would need explained.`,
  ];
  if (code === 'vi') {
    lines.push(
      '- VIETNAMESE: never coin Sino-Vietnamese (Hán-Việt) renderings of Chinese terms (e.g. 四可 → "Tứ Khả"); Vietnamese readers do not recognise them. Keep English trade terms (DOOH, CPM, KPI) only where Vietnamese marketers commonly use them.',
    );
  }
  return lines.join('\n');
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z]/g, '');
}

// A TitleCase term immediately glossed in English — "Tứ Khả (Four Can)" — is
// the signature of a coined translation. Proper nouns glossed with their own
// unaccented spelling ("Hồ Chí Minh (Ho Chi Minh City)") are not flagged.
const GLOSS_RE = new RegExp('(\\p{Lu}\\p{L}*(?:\\s\\p{Lu}\\p{L}*){1,3})\\s*\\(((?=[^)]*[a-z])[A-Z][A-Za-z-]*(?:\\s[A-Za-z-]+){0,3})\\)', 'gu');
const CJK_RE = /[㐀-鿿]/;

/** Review flags for copy that reads like a literal translation. */
export function scanStyle(text: string, lang?: string | null): string[] {
  const code = (lang || 'en').toLowerCase();
  if (code !== 'vi' || !text) return [];
  const flags: string[] = [];
  for (const m of text.matchAll(GLOSS_RE)) {
    const [vi, gloss] = [m[1], m[2]];
    if (!/[À-ỹĐđ]/.test(vi)) continue; // coinages carry Vietnamese diacritics; "Focus Media (Vietnam)" is a name
    if (fold(gloss).startsWith(fold(vi)) || fold(vi).startsWith(fold(gloss))) continue;
    flags.push(`Possible coined translation "${m[0]}" — rewrite in plain Vietnamese.`);
  }
  if (CJK_RE.test(text)) flags.push('Chinese characters left in Vietnamese copy — translate or remove.');
  return [...new Set(flags)];
}
