// Cited-page fetcher — one public page in, a feature row out. No copies of
// third-party content leave this module except a ≤600-char excerpt; the full
// text is kept only for internal analysis (column-level grant in the schema).
//
// Etiquette: identified UA, robots.txt honoured (specific group first, then
// *), 15s per page, 2 MB cap, HTML only, hosts behind login walls skipped.
// No headless browser in v1 — SEA news/directory sites are server-rendered.

import { createHash } from 'node:crypto';

export const BOT_UA = 'Mozilla/5.0 (compatible; MemeCMOBot/1.0; +https://memecmo.ai/bot)';
const PAGE_TIMEOUT_MS = 15_000;
const ROBOTS_TIMEOUT_MS = 8_000;
const MAX_BYTES = 2_000_000;
const MAX_TEXT = 200_000;
export const EXCERPT_CHARS = 600;

// Login walls / JS-only apps / search engines: not fetchable meaningfully.
const SKIP_HOSTS = /(^|\.)(facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|youtu\.be|google\.[a-z.]+|bing\.com|reddit\.com|threads\.net|zalo\.me)$/i;

export interface PageFeatures {
  url: string;
  domain: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  blockedByRobots: boolean;
  finalUrl: string | null;
  contentType: string | null;
  title: string | null;
  lang: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  author: string | null;
  canonical: string | null;
  wordCount: number | null;
  headingsCount: number | null;
  hasFaq: boolean;
  schemaTypes: string[];
  outboundDomains: string[];
  excerpt: string | null;
  textHash: string | null;
  text: string | null;
  fetchMs: number;
  /** false = do not retry (non-html, skipped host, 4xx) */
  retryable: boolean;
}

export const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

// ── robots.txt ───────────────────────────────────────────────────────────────
type Rules = { allow: string[]; disallow: string[] };
const robotsCache = new Map<string, Rules | null>();

function parseRobots(txt: string): Rules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'disallow') { if (val) cur.disallow.push(val); }
    else if (key === 'allow') { if (val) cur.allow.push(val); }
  }
  const specific = groups.find((g) => g.agents.some((a) => a.includes('memecmobot')));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = specific ?? star;
  return g ? { allow: g.allow, disallow: g.disallow } : { allow: [], disallow: [] };
}

function pathMatches(rule: string, path: string): boolean {
  // robots patterns: '*' wildcard, '$' end anchor; everything else literal prefix
  const esc = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$$/, '$').replace(/\*/g, '.*');
  return new RegExp('^' + esc).test(path);
}

export async function robotsAllows(u: URL): Promise<boolean> {
  const key = u.origin;
  let rules = robotsCache.get(key);
  if (rules === undefined) {
    rules = null;
    try {
      const res = await fetch(`${key}/robots.txt`, { headers: { 'user-agent': BOT_UA }, signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS), redirect: 'follow' });
      if (res.ok) rules = parseRobots((await res.text()).slice(0, 200_000));
    } catch { /* unreachable robots → allow (standard practice) */ }
    robotsCache.set(key, rules);
  }
  if (!rules) return true;
  const path = u.pathname + u.search;
  const dis = rules.disallow.filter((r) => pathMatches(r, path)).sort((a, b) => b.length - a.length)[0];
  if (!dis) return true;
  const allow = rules.allow.filter((r) => pathMatches(r, path)).sort((a, b) => b.length - a.length)[0];
  return !!allow && allow.length >= dis.length;
}

// ── extraction (regex, no DOM dependency) ────────────────────────────────────
const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; } });

function metaMap(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s+[^>]*?>/gi)) {
    const tag = m[0];
    const name = (tag.match(/\b(?:name|property|itemprop|http-equiv)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (name && content && !(name.toLowerCase() in out)) out[name.toLowerCase()] = decode(content.trim());
  }
  return out;
}

function validDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v.trim());
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  // Sites publish nonsense dates (a focusmedia.vn page claimed 2026-12-08 in
  // September 2026); a date more than 2 days in the future is not a date.
  if (y < 2000 || d.getTime() > Date.now() + 2 * 86_400_000) return null;
  return d.toISOString();
}

function walkJsonLd(node: any, acc: { types: Set<string>; published?: string; modified?: string; author?: string; faq: boolean }) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walkJsonLd(n, acc)); return; }
  const t = node['@type'];
  const types = Array.isArray(t) ? t : t ? [t] : [];
  for (const x of types) if (typeof x === 'string') { acc.types.add(x.replace(/^https?:\/\/schema\.org\//i, '')); if (/FAQPage/i.test(x)) acc.faq = true; }
  if (!acc.published) acc.published = validDate(node.datePublished) ?? undefined;
  if (!acc.modified) acc.modified = validDate(node.dateModified) ?? undefined;
  if (!acc.author) {
    const a = node.author; const name = typeof a === 'string' ? a : Array.isArray(a) ? a[0]?.name : a?.name;
    if (typeof name === 'string' && name.trim()) acc.author = name.trim().slice(0, 120);
  }
  if (node['@graph']) walkJsonLd(node['@graph'], acc);
  if (node.mainEntity) walkJsonLd(node.mainEntity, acc);
}

const FAQ_HEADING = /\bfaq\b|frequently asked|câu hỏi thường gặp|常见问题|常見問題|คำถามที่พบบ่อย|pertanyaan (yang )?sering|soalan lazim/i;

export function extractFeatures(url: string, finalUrl: string, html: string): Omit<PageFeatures, 'ok' | 'status' | 'error' | 'blockedByRobots' | 'contentType' | 'fetchMs' | 'retryable'> {
  const host = domainOf(finalUrl || url);
  const meta = metaMap(html);
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ?? meta['og:title'] ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  const lang = ((html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i) || [])[1] ?? meta['content-language'] ?? '').toLowerCase().slice(0, 10) || null;
  const canonical = ((html.match(/<link[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']+)["']/i) || html.match(/<link[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']canonical["']/i) || [])[1] ?? '').slice(0, 1000) || null;

  const ld = { types: new Set<string>(), faq: false } as { types: Set<string>; published?: string; modified?: string; author?: string; faq: boolean };
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walkJsonLd(JSON.parse(m[1].trim()), ld); } catch { /* malformed JSON-LD is common; ignore */ }
  }
  for (const m of html.matchAll(/\bitemtype\s*=\s*["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)) ld.types.add(m[1]);

  const publishedAt = ld.published ?? validDate(meta['article:published_time']) ?? validDate(meta['datepublished']) ?? validDate(meta['pubdate']) ?? validDate(meta['date']) ?? validDate(meta['dc.date']) ?? validDate(meta['dc.date.issued']) ?? validDate((html.match(/<time[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i) || [])[1]);
  const modifiedAt = ld.modified ?? validDate(meta['article:modified_time']) ?? validDate(meta['og:updated_time']) ?? validDate(meta['last-modified']) ?? validDate(meta['datemodified']);
  const author = (ld.author ?? meta['author'] ?? meta['article:author'] ?? '').slice(0, 120) || null;

  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
  const hasFaq = ld.faq || headings.some((h) => FAQ_HEADING.test(h));

  const outbound = new Map<string, number>();
  for (const m of html.matchAll(/\bhref\s*=\s*["'](https?:\/\/[^"'\s>]+)["']/gi)) {
    const d = domainOf(m[1]); if (!d || d === host || d.endsWith('.' + host) || host.endsWith('.' + d)) continue;
    outbound.set(d, (outbound.get(d) ?? 0) + 1);
  }
  const outboundDomains = [...outbound.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([d]) => d);

  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body).replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, MAX_TEXT);
  const latin = (text.match(/[A-Za-zÀ-ỹ0-9]+/g) || []).length;
  const cjk = (text.match(/[㐀-鿿぀-ヿ가-힯฀-๿]/g) || []).length;
  const wordCount = latin + cjk;
  const excerpt = text.replace(/\n+/g, ' ').slice(0, EXCERPT_CHARS) || null;
  const textHash = text ? createHash('sha256').update(text).digest('hex') : null;

  return { url, domain: domainOf(url), finalUrl: finalUrl || null, title, lang, publishedAt, modifiedAt, author, canonical, wordCount, headingsCount: headings.length, hasFaq, schemaTypes: [...ld.types].slice(0, 20), outboundDomains, excerpt, textHash, text: text || null };
}

// ── fetch one page ───────────────────────────────────────────────────────────
export async function fetchPage(url: string): Promise<PageFeatures> {
  const t0 = Date.now();
  const base = { url, domain: domainOf(url), finalUrl: null, contentType: null, title: null, lang: null, publishedAt: null, modifiedAt: null, author: null, canonical: null, wordCount: null, headingsCount: null, hasFaq: false, schemaTypes: [] as string[], outboundDomains: [] as string[], excerpt: null, textHash: null, text: null, blockedByRobots: false };
  let u: URL;
  try { u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error('scheme'); } catch { return { ...base, ok: false, status: null, error: 'invalid url', retryable: false, fetchMs: Date.now() - t0 }; }
  if (SKIP_HOSTS.test(u.hostname)) return { ...base, ok: false, status: null, error: 'skipped host (login wall / app)', retryable: false, fetchMs: Date.now() - t0 };
  if (!(await robotsAllows(u))) return { ...base, ok: false, status: null, error: 'disallowed by robots.txt', blockedByRobots: true, retryable: false, fetchMs: Date.now() - t0 };
  try {
    const res = await fetch(u.toString(), { headers: { 'user-agent': BOT_UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'vi,zh,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() || null;
    if (!res.ok) return { ...base, ok: false, status: res.status, error: `http ${res.status}`, contentType, finalUrl: res.url || null, retryable: res.status >= 500 || res.status === 429, fetchMs: Date.now() - t0 };
    if (contentType && !/html|xml/.test(contentType)) return { ...base, ok: false, status: res.status, error: `non-html (${contentType})`, contentType, finalUrl: res.url || null, retryable: false, fetchMs: Date.now() - t0 };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return { ...base, ok: false, status: res.status, error: 'too large', contentType, finalUrl: res.url || null, retryable: false, fetchMs: Date.now() - t0 };
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    const f = extractFeatures(url, res.url || url, html);
    return { ...f, ok: true, status: res.status, error: null, blockedByRobots: false, contentType, retryable: false, fetchMs: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : e.message) : String(e);
    return { ...base, ok: false, status: null, error: msg.slice(0, 200), retryable: true, fetchMs: Date.now() - t0 };
  }
}
