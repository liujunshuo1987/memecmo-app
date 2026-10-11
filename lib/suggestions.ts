// Suggested actions — the platform already reads the client's site (site-discover,
// the page fetcher, the citation index), so a new page is found here and offered
// for confirmation instead of asking a person to type its link and date.
//
// Detection is by rule only; no model reads anything. For each page on the
// brand's own hosts (address variants, redirects, canonicals and identical text
// count as one page):
//   first seen  = the earliest of: site-discover, the fetcher, the first citation
//                 in this project's scans
//   suggested   ⇔ first seen inside the window (45 days), the page is live, and
//                 no logged action and no earlier suggestion covers it
//   not suggested when
//     · nothing but a baseline sighting speaks for it — site-discover's first
//       pass over a host, or the project's first scan, where everything is
//       "first seen"
//     · its only sign of being new is a single citation: an old page the
//       engines reach once (a changed prompt set does this) is not a new page
//     · the page itself states a publish date before the window (an old page
//       found late)
//     · it is the home page, a section index with pages beneath it, a utility
//       page (contact, language switch, …), or nearly empty
//   The fetcher's own first-seen date only bounds the date: the fetcher reads
//   what citations and site-discover hand it, so on its own it is queue timing.
//   publish-date guess = the page's stated publish date → sitemap lastmod (each
//   only when not later than first seen) → the first-seen date. The source of
//   the guess is stored and shown; the person confirming can correct the date.
//
// A suggestion is not an action. It becomes one only when a person confirms it,
// and the intervention is then signed with that person's account. Unconfirmed
// suggestions are never counted — not as actions, not in collaboration alignment.

import { unitHash } from '@/lib/edits';
import { domainOf } from '@/lib/interventions';

export const DETECT_WINDOW_DAYS = 45;
const BASELINE_MS = 24 * 3600e3;   // sightings this close to a channel's first one are its baseline
const THIN_WORDS = 80;
const MIN_CITES = 2;                // a first citation counts as news only from the second one on
const MAX_PER_RUN = 30;

export type GuessSource = 'page_meta' | 'sitemap_lastmod' | 'first_seen';
export interface TargetCandidate { n: number; prompt: string; shared: number; strong: boolean }
export interface SuggestionEvidence {
  firstSeenAt: string;
  discoveredAt: string | null;
  firstCitedAt: string | null;
  cites: number;
  engines: string[];
  words: number | null;
  aliases: string[];              // other addresses of the same page seen so far
}
export interface Suggested {
  url: string;
  urlKey: string;
  domain: string | null;
  title: string | null;
  publishedGuess: string;         // YYYY-MM-DD
  guessSource: GuessSource;
  targetCandidates: TargetCandidate[];
  evidence: SuggestionEvidence;
}
export interface SuggestionRow {
  id: string;
  project_id: string;
  seq: number;
  url: string;
  url_key: string;
  domain: string | null;
  title: string | null;
  detected_at: string;
  published_guess: string;
  guess_source: GuessSource;
  target_candidates: TargetCandidate[];
  evidence: Partial<SuggestionEvidence>;
  status: 'pending' | 'confirmed' | 'dismissed';
  confirmed_by: string | null;
  confirmed_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  intervention_id: string | null;
  channel: 'web' | 'lark' | null;
  lark_posted_at: string | null;
  lark_posted_by: string | null;
}

// ─── URL identity ────────────────────────────────────────────────────────────
const TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|msclkid|yclid|srsltid|igshid|mc_cid|mc_eid|_ga|_gl|ref|ref_src|spm)$/i;

/** One key per address: no scheme, no www, no trailing slash, no fragment, no
 *  tracking parameters, remaining parameters sorted, lower case. */
export function normUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s || /^(mailto|tel|javascript|data|file|ftp):/i.test(s)) return null;
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username) return null;
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  if (!host.includes('.')) return null;
  let path = u.pathname.replace(/\/{2,}/g, '/').replace(/\/index\.(html?|php)$/i, '/').replace(/\/+$/, '');
  try { path = decodeURI(path); } catch { /* keep the encoded form */ }
  const query = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
    .map(([k, v]) => (v ? `${k}=${v}` : k))
    .join('&');
  return (host + path + (query ? `?${query}` : '')).toLowerCase();
}

const keyHost = (key: string) => key.split(/[/?]/)[0];
const keyPath = (key: string) => key.slice(keyHost(key).length).split('?')[0];

// ─── Candidate target questions ──────────────────────────────────────────────
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Words of two letters or more, accents folded; a run of Han characters is cut into pairs. */
export function tokens(s: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const part of fold(String(s ?? '')).split(/[^a-z0-9㐀-鿿]+/)) {
    for (const run of part.match(/[㐀-鿿]+|[a-z0-9]+/g) ?? []) {
      if (/[㐀-鿿]/.test(run)) { for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2)); }
      else if (run.length >= 2) out.add(run);
    }
  }
  return [...out];
}

/** Up to three of the fixed questions, by plain word overlap with the page title.
 *  Words of the brand name and words that occur in more than half of the
 *  questions tell nothing apart and are left out. `strong` marks a title that
 *  covers most of a question; it only orders the list. A candidate is an
 *  offer — which question an action aims at is the confirming person's choice,
 *  and nothing is recorded that they did not pick. */
export function candidateQuestions(title: string | null | undefined, core: string[], brandName = ''): TargetCandidate[] {
  if (!title || !core.length) return [];
  const brand = new Set(tokens(brandName));
  const perQuestion = core.map((q) => tokens(q).filter((w) => !brand.has(w)));
  const df = new Map<string, number>();
  for (const ws of perQuestion) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
  const inTitle = new Set(tokens(title).filter((w) => !brand.has(w)));
  const common = core.length >= 4 ? core.length / 2 : core.length;   // too few questions to call a word common
  return core
    .map((prompt, i) => {
      const distinct = perQuestion[i].filter((w) => (df.get(w) ?? 0) <= common);
      const shared = distinct.filter((w) => inTitle.has(w)).length;
      return { n: i + 1, prompt, shared, cover: distinct.length ? shared / distinct.length : 0 };
    })
    .filter((c) => c.shared >= 2 && c.cover >= 0.34)
    .sort((a, b) => b.cover - a.cover || b.shared - a.shared || a.n - b.n)
    .slice(0, 3)
    .map((c) => ({ n: c.n, prompt: c.prompt, shared: c.shared, strong: c.shared >= 3 && c.cover >= 0.6 }));
}

// ─── Detection (pure) ────────────────────────────────────────────────────────
export interface DiscoveredPage { url: string; discoveredAt: string; lastmod?: string | null }
export interface FetchedPage {
  url: string; ok: boolean | null; title: string | null; canonical: string | null; finalUrl: string | null;
  textHash: string | null; wordCount: number | null; publishedAt: string | null; firstSeenAt: string;
}
export interface CitedUrl { url: string; firstTs: string; cites: number; engines: string[] }
export interface DetectionInput {
  now: Date;
  windowDays?: number;
  ownHosts: string[];
  core: string[];
  brandName: string;
  discovered: DiscoveredPage[];      // project_pages (site-discover)
  pages: FetchedPage[];              // geo_pages on the own hosts (the fetcher)
  cited: CitedUrl[];                 // own urls in this project's citation index
  firstScanAt: string | null;        // the project's first recorded citation of any source
  loggedUrls: string[];              // urls of interventions, any status
  suggestedKeys: string[];           // url_key of suggestions already stored, any status
}
export type SkipReason = 'logged' | 'already-suggested' | 'home' | 'utility' | 'hub' | 'not-read-yet' | 'not-live' | 'thin' | 'stated-old' | 'baseline' | 'cited-once';
export interface DetectionResult {
  suggestions: Suggested[];
  seenBeforeWindow: number;                    // pages known before the window: never candidates
  skipped: Record<SkipReason, string[]>;       // pages inside the window that a rule left out
  unread: { url: string; cites: number }[];    // the not-read-yet ones, most cited first
}

const LOCALE_ROOT = /^\/[a-z]{2}(-[a-z]{2})?$/;
const UTILITY = /^(lien-he|contact|contact-us|lang|login|dang-nhap|register|dang-ky|search|tim-kiem|cart|gio-hang|checkout|coming-soon|privacy|privacy-policy|terms|chinh-sach[a-z-]*|dieu-khoan[a-z-]*|tuyen-dung|tuyen_dung|careers?|jobs?|404|sitemap[a-z.-]*)$/;
const day = (iso: string) => iso.slice(0, 10);
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const earliest = (list: (string | null | undefined)[]): string | null =>
  list.filter((x): x is string => !!x && !isNaN(ms(x))).sort((a, b) => ms(a) - ms(b))[0] ?? null;

export function detectSuggestions(input: DetectionInput): DetectionResult {
  const own = new Set(input.ownHosts.map((h) => h.toLowerCase().replace(/^www\./, '')));
  const keyOf = (url: string | null | undefined) => { const k = normUrl(url); return k && own.has(keyHost(k)) ? k : null; };
  const windowStart = input.now.getTime() - (input.windowDays ?? DETECT_WINDOW_DAYS) * 86400e3;

  // One page, many addresses: union by redirect target, canonical, and identical text.
  const parent = new Map<string, string>();
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(k, r); return r; };
  const add = (k: string) => { if (!parent.has(k)) parent.set(k, k); };
  const union = (a: string, b: string) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const discovered = new Map<string, DiscoveredPage[]>();
  const fetched = new Map<string, FetchedPage[]>();
  const cited = new Map<string, CitedUrl[]>();
  const push = <T,>(m: Map<string, T[]>, k: string, v: T) => { add(k); (m.get(k) ?? m.set(k, []).get(k)!).push(v); };
  for (const d of input.discovered) { const k = keyOf(d.url); if (k) push(discovered, k, d); }
  for (const c of input.cited) { const k = keyOf(c.url); if (k) push(cited, k, c); }
  const byText = new Map<string, string>();
  for (const p of input.pages) {
    const k = keyOf(p.url);
    if (!k) continue;
    push(fetched, k, p);
    if (!p.ok) continue;
    const landed = keyOf(p.finalUrl);
    if (landed) union(k, landed);
    // A canonical pointing every page at the home page is a site misconfiguration, not an identity.
    const canon = keyOf(p.canonical);
    if (canon && (keyPath(canon) !== '' || keyPath(k) === '')) union(k, canon);
    if (p.textHash && (p.wordCount ?? 0) >= THIN_WORDS) {
      const same = byText.get(p.textHash);
      if (same) union(k, same); else byText.set(p.textHash, k);
    }
  }

  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) { const r = find(k); (groups.get(r) ?? groups.set(r, []).get(r)!).push(k); }
  const allKeys = [...parent.keys()];

  // Baselines: site-discover's first pass over each host; the project's first scan.
  const discoverBase = new Map<string, number>();
  for (const [k, list] of discovered) for (const d of list) {
    const t = ms(d.discoveredAt), h = keyHost(k);
    if (!isNaN(t) && t < (discoverBase.get(h) ?? Infinity)) discoverBase.set(h, t);
  }
  const scanBase = ms(input.firstScanAt);

  const logged = new Set(input.loggedUrls.map((u) => normUrl(u)).filter(Boolean) as string[]);
  const already = new Set(input.suggestedKeys);
  const skipped: Record<SkipReason, string[]> = { logged: [], 'already-suggested': [], home: [], utility: [], hub: [], 'not-read-yet': [], 'not-live': [], thin: [], 'stated-old': [], baseline: [], 'cited-once': [] };
  const out: (Suggested & { rank: number })[] = [];
  const unread: { url: string; cites: number }[] = [];
  let seenBeforeWindow = 0;

  for (const keys of groups.values()) {
    const disc = keys.flatMap((k) => discovered.get(k) ?? []);
    const cit = keys.flatMap((k) => cited.get(k) ?? []);
    const pgs = keys.flatMap((k) => fetched.get(k) ?? []);
    const discoveredAt = earliest(disc.map((d) => d.discoveredAt));
    const firstCitedAt = earliest(cit.map((c) => c.firstTs));
    const firstSeenAt = earliest([discoveredAt, firstCitedAt, ...pgs.map((p) => p.firstSeenAt)]);
    if (!firstSeenAt) continue;
    if (ms(firstSeenAt) < windowStart) { seenBeforeWindow++; continue; }

    // The address people open: where the page lives now (its canonical, else where the fetch landed).
    const live = pgs.filter((p) => p.ok).sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0))[0] ?? null;
    const rep = live ? [live.canonical, live.finalUrl, live.url].map((u) => ({ u, k: keyOf(u) })).find((x) => x.k && keys.includes(x.k)) : null;
    const repKey = rep?.k ?? keys[0];
    const repUrl = rep?.u ?? disc[0]?.url ?? cit[0]?.url ?? `https://${repKey}`;
    const skip = (why: SkipReason) => { skipped[why].push(repUrl); };

    if (keys.some((k) => logged.has(k))) { skip('logged'); continue; }
    if (keys.some((k) => already.has(k))) { skip('already-suggested'); continue; }
    if (keys.some((k) => keyPath(k) === '' || LOCALE_ROOT.test(keyPath(k)))) { skip('home'); continue; }
    if (keyPath(repKey).split('/').some((seg) => UTILITY.test(seg))) { skip('utility'); continue; }
    if (allKeys.some((k) => !keys.includes(k) && k.startsWith(`${repKey.split('?')[0]}/`))) { skip('hub'); continue; }
    if (!pgs.length) { skip('not-read-yet'); unread.push({ url: repUrl, cites: cit.reduce((a, c) => a + c.cites, 0) }); continue; }
    if (!live) { skip('not-live'); continue; }
    if ((live.wordCount ?? 0) < THIN_WORDS) { skip('thin'); continue; }

    // A stated date later than the first sighting cannot be the publish date.
    const notAfterSeen = (iso: string | null) => (iso && ms(iso) <= ms(firstSeenAt) + BASELINE_MS ? iso : null);
    const meta = notAfterSeen(earliest(pgs.filter((p) => p.ok).map((p) => p.publishedAt)));
    const lastmod = notAfterSeen(earliest(disc.map((d) => d.lastmod)));
    const stated = meta ?? lastmod;
    if (stated && ms(stated) < windowStart) { skip('stated-old'); continue; }

    const newlyDiscovered = disc.some((d) => { const k = keyOf(d.url)!; return ms(d.discoveredAt) > (discoverBase.get(keyHost(k)) ?? Infinity) + BASELINE_MS; });
    const cites = cit.reduce((a, c) => a + c.cites, 0);
    const newlyCited = !!firstCitedAt && !isNaN(scanBase) && ms(firstCitedAt) > scanBase + BASELINE_MS;
    if (!stated && !newlyDiscovered && !(newlyCited && cites >= MIN_CITES)) { skip(newlyCited ? 'cited-once' : 'baseline'); continue; }

    const targetCandidates = candidateQuestions(live.title, input.core, input.brandName);
    out.push({
      url: repUrl,
      urlKey: repKey,
      domain: domainOf(repUrl),
      title: live.title,
      publishedGuess: day(stated ?? firstSeenAt),
      guessSource: meta ? 'page_meta' : lastmod ? 'sitemap_lastmod' : 'first_seen',
      targetCandidates,
      evidence: {
        firstSeenAt, discoveredAt, firstCitedAt, cites,
        engines: [...new Set(cit.flatMap((c) => c.engines))].sort(),
        words: live.wordCount,
        aliases: keys.filter((k) => k !== repKey).sort(),
      },
      rank: cites * 10 + (targetCandidates.some((c) => c.strong) ? 5 : targetCandidates.length ? 2 : 0),
    });
  }

  out.sort((a, b) => b.rank - a.rank || b.publishedGuess.localeCompare(a.publishedGuess) || a.urlKey.localeCompare(b.urlKey));
  unread.sort((a, b) => b.cites - a.cites);
  return { suggestions: out.slice(0, MAX_PER_RUN).map(({ rank: _rank, ...s }) => s), seenBeforeWindow, skipped, unread };
}

// ─── Loading ─────────────────────────────────────────────────────────────────
type Sb = any;

// Same rule as brandDomainSet (lib/agents/run): brand_url plus metadata.brandDomains.
export function ownHostsOf(project: { brand_url?: string | null; metadata?: any }): string[] {
  const hosts = new Set<string>();
  const primary = domainOf(project.brand_url ?? '');
  if (primary) hosts.add(primary);
  for (const d of (Array.isArray(project.metadata?.brandDomains) ? project.metadata.brandDomains : []) as unknown[]) {
    const h = String(d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (h) hosts.add(h);
  }
  return [...hosts];
}

// Every row of a bounded read (a site's own pages, its own cited urls) — PostgREST caps a reply at 1000.
async function allRows<T>(what: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, maxPages = 20): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * 1000, i * 1000 + 999);
    if (error) throw new Error(`suggestions: ${what}: ${error.message ?? error}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
  // A cut-off read would make old pages look new; better no suggestions than wrong ones.
  throw new Error(`suggestions: ${what}: more than ${maxPages * 1000} rows`);
}

/** Everything detection reads, for one project. `preMigration` is for the
 *  read-only dry run before 20261011_intervention_suggestions.sql is applied:
 *  it groups the raw citation rows itself and expects neither the lastmod
 *  column nor the suggestions table. */
export async function loadDetectionInput(sb: Sb, projectId: string, opts: { now?: Date; windowDays?: number; preMigration?: boolean } = {}): Promise<DetectionInput> {
  const { data: project, error } = await sb.from('projects').select('id, brand_name, brand_url, metadata').eq('id', projectId).maybeSingle();
  if (error) throw new Error(`suggestions: project: ${error.message}`);
  if (!project) throw new Error('suggestions: project not found');
  const ownHosts = ownHostsOf(project);
  const core: string[] = Array.isArray(project.metadata?.coreKeyPrompts) ? project.metadata.coreKeyPrompts : [];
  const base = { now: opts.now ?? new Date(), windowDays: opts.windowDays, ownHosts, core, brandName: String(project.brand_name ?? '') };
  if (!ownHosts.length) return { ...base, discovered: [], pages: [], cited: [], firstScanAt: null, loggedUrls: [], suggestedKeys: [] };

  const discovered = (await allRows<any>('project_pages', (from, to) =>
    sb.from('project_pages').select(opts.preMigration ? 'url, discovered_at' : 'url, discovered_at, lastmod').eq('project_id', projectId).order('url').range(from, to),
  )).map((r) => ({ url: String(r.url), discoveredAt: String(r.discovered_at), lastmod: r.lastmod ?? null }));

  const pages = (await allRows<any>('geo_pages', (from, to) =>
    sb.from('geo_pages').select('url, ok, title, canonical, final_url, text_hash, word_count, published_at, first_seen_at').in('domain', ownHosts).order('url').range(from, to),
  )).map((r) => ({ url: String(r.url), ok: r.ok, title: r.title, canonical: r.canonical, finalUrl: r.final_url, textHash: r.text_hash, wordCount: r.word_count, publishedAt: r.published_at, firstSeenAt: String(r.first_seen_at) }));

  let cited: CitedUrl[];
  if (opts.preMigration) {
    const by = new Map<string, CitedUrl>();
    const raw = await allRows<any>('geo_citations', (from, to) =>
      sb.from('geo_citations').select('url, engine, ts').eq('project_id', projectId).in('domain', ownHosts).order('ts').order('id').range(from, to), 50);
    for (const r of raw) {
      const e = by.get(r.url) ?? by.set(r.url, { url: r.url, firstTs: r.ts, cites: 0, engines: [] }).get(r.url)!;
      e.cites++; if (!e.engines.includes(r.engine)) e.engines.push(r.engine);
    }
    cited = [...by.values()];
  } else {
    cited = (await allRows<any>('geo_own_url_cites', (from, to) =>
      sb.rpc('geo_own_url_cites', { p_project_id: projectId, p_domains: ownHosts }).range(from, to),
    )).map((r) => ({ url: String(r.url), firstTs: String(r.first_ts), cites: Number(r.cites ?? 0), engines: Array.isArray(r.engines) ? r.engines.map(String) : [] }));
  }

  const first = await sb.from('geo_citations').select('ts').eq('project_id', projectId).order('ts', { ascending: true }).limit(1);
  if (first.error) throw new Error(`suggestions: first scan: ${first.error.message}`);
  const logged = await allRows<any>('interventions', (from, to) =>
    sb.from('interventions').select('url').eq('project_id', projectId).not('url', 'is', null).order('created_at').range(from, to));
  const stored = opts.preMigration ? [] : await allRows<any>('intervention_suggestions', (from, to) =>
    sb.from('intervention_suggestions').select('url_key').eq('project_id', projectId).order('seq').range(from, to));

  return {
    ...base, discovered, pages, cited,
    firstScanAt: first.data?.[0]?.ts ?? null,
    loggedUrls: logged.map((r) => String(r.url)),
    suggestedKeys: stored.map((r) => String(r.url_key)),
  };
}

/** Own pages detection cannot judge yet because the fetcher has not read them.
 *  The shared queue goes by citation count, so a brand's own new page can wait
 *  behind thousands of third-party urls; the caller reads these first. */
export async function unreadOwnPages(sb: Sb, projectId: string, limit = 24): Promise<{ url: string; domain: string; cites: number }[]> {
  const { unread } = detectSuggestions(await loadDetectionInput(sb, projectId));
  return unread.slice(0, limit).map((u) => ({ url: u.url, domain: domainOf(u.url) ?? '', cites: u.cites }));
}

/** Detect and store. New pages become pending suggestions; a pending suggestion
 *  whose page has meanwhile been logged by hand is closed against that action. */
export async function runDetection(sb: Sb, projectId: string, opts: { now?: Date; windowDays?: number } = {}): Promise<{ added: number; closed: number }> {
  const result = detectSuggestions(await loadDetectionInput(sb, projectId, opts));

  let closed = 0;
  const { data: pending } = await sb.from('intervention_suggestions').select('id, url_key').eq('project_id', projectId).eq('status', 'pending');
  if ((pending ?? []).length) {
    const { data: ivx } = await sb.from('interventions').select('id, url, logged_by, created_at').eq('project_id', projectId).not('url', 'is', null);
    const byKey = new Map<string, any>();
    for (const iv of ivx ?? []) { const k = normUrl(iv.url); if (k && !byKey.has(k)) byKey.set(k, iv); }
    for (const s of pending ?? []) {
      const iv = byKey.get(s.url_key);
      if (!iv) continue;
      const { error } = await sb.from('intervention_suggestions')
        .update({ status: 'confirmed', confirmed_by: iv.logged_by ?? null, confirmed_at: iv.created_at, intervention_id: iv.id })
        .eq('id', s.id).eq('status', 'pending');
      if (!error) closed++;
    }
  }

  if (!result.suggestions.length) return { added: 0, closed };
  const { data: last } = await sb.from('intervention_suggestions').select('seq').eq('project_id', projectId).order('seq', { ascending: false }).limit(1);
  let seq = Number(last?.[0]?.seq ?? 0);
  const rows = result.suggestions.map((s) => ({
    project_id: projectId, seq: ++seq, url: s.url, url_key: s.urlKey, domain: s.domain, title: s.title,
    published_guess: s.publishedGuess, guess_source: s.guessSource, target_candidates: s.targetCandidates, evidence: s.evidence,
  }));
  const { data: inserted, error } = await sb.from('intervention_suggestions').upsert(rows, { onConflict: 'project_id,url_key', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`suggestions: store: ${error.message}`);
  return { added: (inserted ?? []).length, closed };
}

/** Pending suggestions, most cited first. One whose page already has a logged
 *  action is left out even before detection closes it. Throws on a failed read. */
export async function loadPendingSuggestions(sb: Sb, projectId: string): Promise<SuggestionRow[]> {
  const { data, error } = await sb.from('intervention_suggestions').select('*').eq('project_id', projectId).eq('status', 'pending').order('seq', { ascending: true }).limit(200);
  if (error) throw new Error(`suggestions: pending: ${error.message}`);
  const list = (data ?? []) as SuggestionRow[];
  if (!list.length) return [];
  const ivx = await sb.from('interventions').select('url').eq('project_id', projectId).not('url', 'is', null);
  if (ivx.error) throw new Error(`suggestions: interventions: ${ivx.error.message}`);
  const logged = new Set((ivx.data ?? []).map((r: any) => normUrl(r.url)));
  return list.filter((s) => !logged.has(s.url_key)).sort((a, b) => Number(b.evidence?.cites ?? 0) - Number(a.evidence?.cites ?? 0) || a.seq - b.seq);
}

// ─── Confirm / dismiss ───────────────────────────────────────────────────────
// The latest calendar date anywhere (UTC+14): a date is "in the future" only if it is so everywhere.
const latestToday = () => new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10);

export type ConfirmResult =
  | { ok: true; suggestion: SuggestionRow; intervention: { id: string; url: string | null; published_at: string; target_prompts: { hash: string; prompt: string }[] } }
  | { ok: false; error: 'not-found' | 'already-confirmed' | 'already-dismissed' | 'bad-date' | 'future-date' | string };

/**
 * Turn a pending suggestion into an action signed by `userId`. The caller has
 * already checked that this account may sign for the project (canSignForOrg).
 * `publishedAt` defaults to the stored guess. `targetPrompts` is the person's
 * own choice, limited to the fixed questions; without one the action carries
 * no target question — the candidates the matcher found are never applied on
 * their behalf (the target feeds collaboration alignment).
 */
export async function confirmSuggestion(sb: Sb, d: {
  projectId: string; id?: string; seq?: number; userId: string; channel: 'web' | 'lark';
  publishedAt?: string | null; targetPrompts?: string[]; larkMessageId?: string | null; today?: string;
}): Promise<ConfirmResult> {
  let q = sb.from('intervention_suggestions').select('*').eq('project_id', d.projectId);
  q = d.id ? q.eq('id', d.id) : q.eq('seq', d.seq ?? -1);
  const { data: s } = await q.maybeSingle();
  if (!s) return { ok: false, error: 'not-found' };
  if (s.status !== 'pending') return { ok: false, error: `already-${s.status}` };

  const date = String(d.publishedAt ?? s.published_guess);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(`${date}T00:00:00Z`).getTime())) return { ok: false, error: 'bad-date' };
  if (date > (d.today ?? latestToday())) return { ok: false, error: 'future-date' };

  const { data: project } = await sb.from('projects').select('metadata').eq('id', d.projectId).maybeSingle();
  const core: string[] = Array.isArray(project?.metadata?.coreKeyPrompts) ? project.metadata.coreKeyPrompts : [];
  const targets = core.filter((p) => (d.targetPrompts ?? []).includes(p)).map((p) => ({ hash: unitHash(p), prompt: p }));

  // Claim first: a double click (or the same reply delivered twice) must not log the action twice.
  const now = new Date().toISOString();
  const { data: claimed } = await sb.from('intervention_suggestions')
    .update({ status: 'confirmed', confirmed_by: d.userId, confirmed_at: now, channel: d.channel })
    .eq('id', s.id).eq('status', 'pending').select('*').maybeSingle();
  if (!claimed) return { ok: false, error: 'already-confirmed' };

  const { data: iv, error } = await sb.from('interventions')
    .insert({
      project_id: d.projectId, kind: 'content_page', url: s.url, domain: s.domain ?? domainOf(s.url), title: s.title ?? null,
      target_prompts: targets, published_at: date, logged_by: d.userId, channel: d.channel, lark_message_id: d.larkMessageId ?? null,
    })
    .select('id, url, published_at, target_prompts')
    .single();
  if (error || !iv) {
    await sb.from('intervention_suggestions').update({ status: 'pending', confirmed_by: null, confirmed_at: null, channel: null }).eq('id', s.id);
    return { ok: false, error: error?.message ?? 'insert failed' };
  }
  await sb.from('intervention_suggestions').update({ intervention_id: iv.id }).eq('id', s.id);
  return { ok: true, suggestion: { ...claimed, intervention_id: iv.id }, intervention: iv };
}

/** "Not ours": the page stays off the list for good; nothing is logged. */
export async function dismissSuggestion(sb: Sb, d: { projectId: string; id: string; userId: string }): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb.from('intervention_suggestions')
    .update({ status: 'dismissed', dismissed_by: d.userId, dismissed_at: new Date().toISOString() })
    .eq('project_id', d.projectId).eq('id', d.id).eq('status', 'pending').select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  return data ? { ok: true } : { ok: false, error: 'not-pending' };
}
