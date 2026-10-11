// Deterministic helpers for the AUDIT half of client reports.
//
// Reporting principle (2026-10-03): the audit is an objective measurement of
// what the AI engines answered — nobody adjusts it, and it carries no
// prescriptions. Judgment enters only in suggestions (content, distribution),
// in the question set, and in the brand facts the client gives the platform.
// Everything here is rule-based and runs without a model, so the audit half of
// a report cannot be talked into a conclusion.
//
// Written after the 2026-10-03 FMVN digest: it compared a scheduled scan with a
// manual one ("+6" that was +3), called hardware vendors "category authorities
// to win", and let a model date a request "Q2 2026" in October.

import { competitorMatcher, looksLikeVendor, type CompetitorGroup } from '@/lib/agents/source-owners';
import { groundNumbers } from '@/lib/agents/grounding';

// ── Like-for-like baseline ───────────────────────────────────────────────────

export interface ScanRef { id: string; at: string | null; trigger: string | null; agent: string | null }

/** Scans that form the comparable series: the scheduled ones. A scan someone
 *  ran by hand is a spot check — reported, never used as a baseline. */
export const isSeriesScan = (r: { trigger_method?: string | null }) => r.trigger_method === 'schedule';

/** Score movement inside this band on an unchanged question set is sampling noise. */
export const NOISE_BAND = 3;

// ── Fixed-question (Core) split ──────────────────────────────────────────────

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

/** Names that make a question "branded": the brand and its own related entities. */
export function selfNames(brandName: string, country: string | null | undefined, groups: CompetitorGroup[] | null | undefined): string[] {
  const out = new Set<string>();
  const add = (s: unknown) => { const v = strip(String(s ?? '')).replace(/\s+/g, ' ').trim(); if (v.length >= 4) out.add(v); };
  add(brandName);
  // "Focus Media Vietnam" is asked about as "Focus Media" far more often than in full.
  const c = strip(String(country ?? ''));
  const short = strip(brandName).replace(new RegExp(`\\s+(${c ? c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|' : ''}vietnam|viet nam|vn)$`), '').trim();
  add(short);
  for (const g of groups ?? []) if (g.relationship === 'self') { add(g.canonical); for (const a of g.aliases ?? []) add(a); }
  return [...out];
}

export const isBrandedPrompt = (prompt: string, names: string[]) => { const p = strip(prompt); return names.some((n) => p.includes(n)); };

export interface Frac { present: number; total: number }
export interface CoreGap { prompt: string; now: Frac; before: Frac | null; engines: string[]; competitors: string[] }
export interface CoreSplit { questions: number; unbrandedQuestions: number; brandedQuestions: number; unbranded: Frac; branded: Frac; unbrandedByEngine: { engine: string; present: number; total: number }[]; before: { unbranded: Frac; branded: Frac } | null; gaps: CoreGap[] }

/** Brand presence on the fixed questions only — the like-for-like part of a
 *  panel whose remaining questions rotate between scans. */
export function coreSplit(sc: any, prevSc: any | null, corePrompts: string[], names: string[]): CoreSplit | null {
  const core = new Set(corePrompts);
  const pick = (s: any): any[] => ((s?.rawSamples ?? []) as any[]).filter((x) => core.has(x.prompt));
  const cur = pick(sc);
  if (!cur.length) return null;
  const prev = prevSc ? pick(prevSc) : [];
  const frac = (L: any[]): Frac => ({ present: L.filter((x) => x.brandPresent).length, total: L.length });
  const by = (L: any[]) => { const m = new Map<string, any[]>(); for (const x of L) m.set(x.prompt, [...(m.get(x.prompt) ?? []), x]); return m; };
  const curQ = by(cur), prevQ = by(prev);
  const gaps: CoreGap[] = [];
  for (const [prompt, L] of curQ) {
    if (isBrandedPrompt(prompt, names)) continue;
    const now = frac(L);
    if (now.present === now.total) continue;
    const comp = new Map<string, number>();
    for (const x of L) if (!x.brandPresent) for (const c of x.competitorsPresent ?? []) comp.set(c, (comp.get(c) ?? 0) + 1);
    gaps.push({
      prompt, now,
      before: prevQ.has(prompt) ? frac(prevQ.get(prompt)!) : null,
      engines: L.filter((x) => x.brandPresent).map((x) => String(x.engine)),
      competitors: [...comp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} ${n}/${now.total}`),
    });
  }
  gaps.sort((a, b) => a.now.present / a.now.total - b.now.present / b.now.total || a.prompt.localeCompare(b.prompt));
  const unbrandedQuestions = [...curQ.keys()].filter((q) => !isBrandedPrompt(q, names)).length;
  // Per engine, on the questions without the brand name: one answer per question.
  const eng = new Map<string, Frac>();
  for (const x of cur) {
    if (isBrandedPrompt(x.prompt, names)) continue;
    const f = eng.get(String(x.engine)) ?? { present: 0, total: 0 };
    eng.set(String(x.engine), { present: f.present + (x.brandPresent ? 1 : 0), total: f.total + 1 });
  }
  return {
    questions: curQ.size,
    unbrandedQuestions,
    unbrandedByEngine: [...eng.entries()].map(([engine, f]) => ({ engine, ...f })).sort((x, y) => y.present - x.present || x.engine.localeCompare(y.engine)),
    brandedQuestions: curQ.size - unbrandedQuestions,
    unbranded: frac(cur.filter((x) => !isBrandedPrompt(x.prompt, names))),
    branded: frac(cur.filter((x) => isBrandedPrompt(x.prompt, names))),
    before: prev.length
      ? { unbranded: frac(prev.filter((x) => !isBrandedPrompt(x.prompt, names))), branded: frac(prev.filter((x) => isBrandedPrompt(x.prompt, names))) }
      : null,
    gaps,
  };
}

// ── Source type: what a cited domain IS, separate from how often it is cited ─

export type SourceType =
  | 'own' | 'competitor' | 'media' | 'industry' | 'research' | 'reseller' | 'hardware'
  | 'platform' | 'reference' | 'directory' | 'unknown';

// Seed lists. A project can correct or extend them with
// projects.metadata.sourceTypes = { "domain": "type" } — a fact the team tells
// the platform, applied before any rule.
const MEDIA = [
  'vnexpress.net', 'cafef.vn', 'cafebiz.vn', 'vietnamnet.vn', 'thanhnien.vn', 'tuoitre.vn', 'dantri.com.vn', 'vtv.vn', 'vov.vn',
  'baomoi.com', 'vietnam.vn', 'vietnamplus.vn', 'forbes.vn', 'congthuong.vn', 'tinnhanhchungkhoan.vn', 'vneconomy.vn', 'nhandan.vn',
  'laodong.vn', 'znews.vn', 'zingnews.vn', 'kenh14.vn', 'msn.com', 'doanhnghiepcuocsong.vn', 'vietnammoi.vn', 'baodautu.vn', 'nld.com.vn',
  'sggp.org.vn', 'tienphong.vn', '24h.com.vn', 'soha.vn', 'genk.vn', 'vir.com.vn', 'vietnamnews.vn', 'bnews.vn', 'thesaigontimes.vn',
  'reuters.com', 'bloomberg.com', 'nikkei.com', 'forbes.com', 'scmp.com', 'cnbc.com', 'bbc.com', 'ft.com', 'wsj.com', 'techcrunch.com',
];
const INDUSTRY = ['brandsvietnam.com', 'advertisingvietnam.com', 'adszone.vn', 'marketingai.vn', 'campaignasia.com', 'thedrum.com', 'adweek.com', 'marketing-interactive.com'];
const RESEARCH = ['mordorintelligence.com', 'statista.com', 'kantar.com', 'nielseniq.com', 'nielsen.com', 'euromonitor.com', 'ipsos.com', 'cbinsights.com', 'emarketer.com'];
const PLATFORM = [
  'facebook.com', 'youtube.com', 'linkedin.com', 'tiktok.com', 'instagram.com', 'pinterest.com', 'sites.google.com', 'scribd.com',
  'slideshare.net', 'medium.com', 'reddit.com', 'quora.com', 'x.com', 'twitter.com', 'zalo.me', 'blogspot.com', 'wordpress.com', 'hackernoon.com',
];
const REFERENCE = ['wikipedia.org', 'wikiwand.com', 'britannica.com'];
const DIRECTORY = ['topcv.vn', 'vieclamtot.com', 'glints.com', 'vietnamworks.com', 'careerviet.vn', 'itviec.com', 'datanyze.com', 'zoominfo.com', 'crunchbase.com', 'yellowpages.vn'];

const inList = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith('.' + d));

// A site whose cited pages sell or install screens is an equipment vendor: it
// answers "what does a screen cost", not "who runs the media network".
const HARDWARE_TITLE_RE = /cung cấp màn hình|màn hình (led|lcd|quảng cáo|cảm ứng)|lắp đặt|thi công|thiết bị|(?<![A-Za-zÀ-ỹ])led(?![A-Za-zÀ-ỹ])|digital signage|kiosk|manufacturer|显示屏|广告机|安装/iu;
const HARDWARE_HOST_RE = /led|light|signage|screen|display|manhinh/i;

export function classifySource(
  domain: string,
  titles: string[],
  ctx: { groups?: CompetitorGroup[] | null; brandDomains?: Set<string>; overrides?: Record<string, string> | null },
): SourceType {
  const host = String(domain || '').toLowerCase().replace(/^www\./, '');
  const o = ctx.overrides?.[host];
  if (o && (TYPE_ORDER as readonly string[]).includes(o)) return o as SourceType;
  if (ctx.brandDomains?.has(host)) return 'own';
  const c = competitorMatcher({ groups: ctx.groups ?? [] })(host);
  if (c) return c.relationship === 'self' ? 'own' : 'competitor';
  if (inList(host, PLATFORM)) return 'platform';
  if (inList(host, REFERENCE)) return 'reference';
  if (inList(host, DIRECTORY)) return 'directory';
  if (inList(host, RESEARCH)) return 'research';
  if (inList(host, MEDIA)) return 'media';
  if (inList(host, INDUSTRY)) return 'industry';
  const t = titles.filter(Boolean);
  const hw = t.filter((x) => HARDWARE_TITLE_RE.test(x)).length;
  if (hw >= 2 || (hw >= 1 && (HARDWARE_HOST_RE.test(host.split('.')[0]) || t.length <= 3))) return 'hardware';
  if (looksLikeVendor(t)) return 'reseller';
  return 'unknown';
}

const TYPE_ORDER = ['own', 'competitor', 'media', 'industry', 'research', 'reseller', 'hardware', 'platform', 'reference', 'directory', 'unknown'] as const;

type L3 = { zh: string; en: string; vi: string };
export const SOURCE_TYPE_LABEL: Record<SourceType, L3> = {
  own: { zh: '品牌自有站', en: 'Brand-owned site', vi: 'Trang của thương hiệu' },
  competitor: { zh: '竞品自有站', en: 'Competitor-owned site', vi: 'Trang của đối thủ' },
  media: { zh: '新闻媒体', en: 'News media', vi: 'Báo chí' },
  industry: { zh: '营销/广告行业媒体', en: 'Marketing & advertising trade media', vi: 'Trang chuyên ngành marketing – quảng cáo' },
  research: { zh: '市场研究机构', en: 'Market research firm', vi: 'Đơn vị nghiên cứu thị trường' },
  reseller: { zh: '代理商/同类服务的销售方', en: 'Agency or seller of the same service', vi: 'Đại lý / đơn vị bán cùng loại dịch vụ' },
  hardware: { zh: '设备、屏幕销售商', en: 'Equipment / screen vendor', vi: 'Đơn vị bán thiết bị, màn hình' },
  platform: { zh: '用户自发布平台', en: 'Self-publishing platform', vi: 'Nền tảng người dùng tự đăng' },
  reference: { zh: '百科/查询站', en: 'Reference / encyclopedia', vi: 'Trang tra cứu / bách khoa' },
  directory: { zh: '企业名录/招聘站', en: 'Business directory / job board', vi: 'Danh bạ doanh nghiệp / tuyển dụng' },
  unknown: { zh: '未分类', en: 'Unclassified', vi: 'Chưa phân loại' },
};

/** How a source type relates to the brand's own line of business. */
export const SOURCE_FIT_LABEL: Record<SourceType, L3> = {
  own: { zh: '自有', en: 'own', vi: 'của thương hiệu' },
  competitor: { zh: '竞品', en: 'competitor', vi: 'đối thủ' },
  media: { zh: '可发稿的媒体', en: 'editorial venue', vi: 'kênh báo chí có thể đăng bài' },
  industry: { zh: '可发稿的行业媒体', en: 'trade venue', vi: 'kênh chuyên ngành có thể đăng bài' },
  research: { zh: '第三方数据来源', en: 'third-party data source', vi: 'nguồn số liệu bên thứ ba' },
  reseller: { zh: '同类服务的卖方', en: 'sells the same service', vi: 'bên bán cùng loại dịch vụ' },
  hardware: { zh: '不同行业(卖设备)', en: 'different business (sells equipment)', vi: 'khác ngành (bán thiết bị)' },
  platform: { zh: '任何人可发布', en: 'anyone can publish', vi: 'ai cũng tự đăng được' },
  reference: { zh: '查询类', en: 'reference', vi: 'tra cứu' },
  directory: { zh: '名录类', en: 'listing', vi: 'danh bạ' },
  unknown: { zh: '未知', en: 'unknown', vi: 'chưa rõ' },
};

/** Where a suggestion may place a gap source. The audit only states the type. */
export const sourceLane = (t: SourceType): 'presence' | 'study' | 'unclassified' =>
  t === 'media' || t === 'industry' ? 'presence' : t === 'unknown' ? 'unclassified' : 'study';

// ── Time and outside-research checks on model prose ─────────────────────────

export function quarterOf(d: Date): { q: number; y: number; label: string } {
  const q = Math.floor(d.getUTCMonth() / 3) + 1, y = d.getUTCFullYear();
  return { q, y, label: `Q${q} ${y}` };
}

// "Q2 2026", "Q2/2026", "quý 2/2026", "2026年第二季度", "2026 年 Q2"
const QUARTER_RE = /\bQ([1-4])\s*[\/\-]?\s*(20\d{2})\b|\bqu[ýy]\s*([1-4]|I{1,3}|IV)\s*[\/\-]?\s*(?:năm\s*)?(20\d{2})\b|(20\d{2})\s*年\s*(?:第\s*([一二三四1-4])\s*季度|Q([1-4]))/giu;
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, 一: 1, 二: 2, 三: 3, 四: 4 };

/** Quarter references that are already in the past. In forward-looking text
 *  ("approve the budget in Q2 2026", said in October) they are a model error. */
export function stalePeriods(text: string, now: Date): string[] {
  const cur = quarterOf(now);
  const out: string[] = [];
  for (const m of text.matchAll(QUARTER_RE)) {
    const qRaw = m[1] ?? m[3] ?? m[6] ?? m[7];
    const y = Number(m[2] ?? m[4] ?? m[5]);
    const q = ROMAN[String(qRaw).toUpperCase()] ?? Number(qRaw);
    if (y < cur.y || (y === cur.y && q < cur.q)) out.push(m[0]);
  }
  return out;
}

/** Third-party research brands. A figure "according to Kantar" in a report must
 *  come from the client's own documents, never from the model's memory. */
export const EXTERNAL_RESEARCH_RE = /\b(Kantar|Nielsen(?:IQ)?|Mordor(?:\s+Intelligence)?|Statista|Euromonitor|Ipsos|eMarketer|Comscore|Gartner|IDC|GWI|Frost\s*&\s*Sullivan)\b/iu;

/** Split prose into sentences without breaking on decimals, domains or "v.v.". */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?。！？])\s+(?=[\p{Lu}\[“"(（]|\d+[.)]\s)/u).map((s) => s.trim()).filter(Boolean);
}

// Deterministic backstop on a model's prose — the rules it was given, enforced.
// A sentence is removed (not patched) when it carries a figure that is in
// neither the scan data nor the client's own facts, cites outside research the
// client never supplied, or — in forward-looking text — names a quarter already
// past. 2026-10-03, all in one digest: "Chicilon 92% … theo Kantar 2025",
// Mordor's figures for the brand's own entity pinned on a competitor, an
// invented "brand recall 45%", and a budget request for "Q2 2026" in October.
// A word in a script the report's language never uses is a generation slip
// (2026-10-03 preview: Russian "охват" in the middle of a Vietnamese sentence).
const CYRILLIC_ETC = '\\u0400-\\u04FF\\u0600-\\u06FF\\u0E00-\\u0E7F\\uAC00-\\uD7AF\\u0900-\\u097F';
const CJK = '\\u3040-\\u30FF\\u4E00-\\u9FFF';
function foreignScript(text: string, lang: string): boolean {
  const code = (lang || 'en').toLowerCase().split('-')[0];
  if (code === 'th') return new RegExp(`[\\u0400-\\u04FF\\u0600-\\u06FF\\uAC00-\\uD7AF${CJK}]`).test(text);
  return new RegExp(`[${CYRILLIC_ETC}${code === 'zh' || code === 'ja' || code === 'ko' ? '' : CJK}]`).test(text);
}

const PROJECTION_RE = /\[\s*(?:Projection|预测|預測|Dự\s*báo|Dự\s*phóng)\s*\]/iu;

export function scrub(
  text: string,
  figureCorpus: string,
  factsCorpus: string,
  lang: string,
  now: Date,
  opts: { forwardLooking?: boolean; allowProjection?: boolean } = {},
): { text: string; removed: string[] } {
  const kept: string[] = [];
  const removed: string[] = [];
  const facts = factsCorpus.toLowerCase();
  for (const sn of sentences(text)) {
    const research = sn.match(EXTERNAL_RESEARCH_RE)?.[1];
    // A sentence explicitly labelled as a projection may carry its own target
    // figures; outside research and past periods are wrong in any sentence.
    const numbersFree = !!opts.allowProjection && PROJECTION_RE.test(sn);
    // A scorecard holds ~100 distinct numbers and covers two thirds of the
    // integers 0–100, so "is this figure somewhere in the scan" passes most
    // invented percentages by coincidence (measured on FMVN 2026-10-02: 68 of
    // 101). Advice therefore may carry only figures from the client's own
    // material; it cites its measured reason as a fraction ("0/15"), which is
    // not a unit-bearing claim. Interpretation keeps the scan figures.
    const corpus = opts.forwardLooking ? factsCorpus : `${figureCorpus}\n${factsCorpus}`;
    const bad =
      foreignScript(sn, lang) ||
      (!numbersFree && groundNumbers(sn, corpus, lang).removed.length > 0) ||
      (!!research && !facts.includes(research.toLowerCase())) ||
      (!!opts.forwardLooking && stalePeriods(sn, now).length > 0);
    (bad ? removed : kept).push(sn);
  }
  return { text: kept.join(' '), removed };
}

/** Every figure the scans support, written next to each unit family the
 *  grounding check looks for (it wants the same KIND of unit near the number). */
export function figureCorpusOf(figures: Iterable<string>): string {
  const out = new Set<string>();
  for (const f of figures) {
    const n = Number(f);
    if (!Number.isFinite(n)) continue;
    out.add(String(n)); out.add(String(Math.round(n)));
    if (n > 0 && n <= 1) out.add(String(Math.round(n * 100)));
  }
  return [...out].map((v) => `${v}% ${v} điểm ${v} points ${v} lần ${v} thương hiệu ${v} 个`).join(' | ');
}
