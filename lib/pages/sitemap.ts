// Discover the client's own pages from its sitemap (or, failing that, the
// homepage's internal links) so the fetcher reads the client's site too —
// the corpus the report compares AI answers against ("facts live on the
// client's site, not in our app").

import type { SupabaseClient } from '@supabase/supabase-js';
import { BOT_UA, domainOf } from './fetch';

const T = 10_000;
const NOISE = /\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|css|js)(\?|$)|\/(tag|tags|category|categories|author|page|feed|wp-json|wp-content|cart|checkout|login|search)\b|\?(replytocom|s=|p=\d+$)|#/i;

async function text(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': BOT_UA }, signal: AbortSignal.timeout(T), redirect: 'follow' });
    if (!r.ok) return null;
    const t = await r.text();
    return t.length > 3_000_000 ? null : t;
  } catch { return null; }
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());

// <lastmod> per <url> entry. Sites write nonsense here too: a date in the future is not kept.
function lastmods(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const loc = (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1];
    const d = new Date(((m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i) || [])[1] ?? '').trim());
    if (loc && !isNaN(d.getTime()) && d.getUTCFullYear() >= 2000 && d.getTime() <= Date.now() + 2 * 86_400_000) out.set(loc.trim(), d.toISOString());
  }
  return out;
}

export interface SitePage { url: string; lastmod: string | null }

export async function discoverSitePages(brandUrl: string, limit = 60): Promise<string[]> {
  return (await discoverSitePagesDated(brandUrl, limit)).map((p) => p.url);
}

/** The same pages, each with its sitemap <lastmod> when the sitemap gives one. */
export async function discoverSitePagesDated(brandUrl: string, limit = 60): Promise<SitePage[]> {
  let origin: URL;
  try { origin = new URL(brandUrl.startsWith('http') ? brandUrl : `https://${brandUrl}`); } catch { return []; }
  const host = domainOf(origin.toString());
  const candidates: string[] = [];
  const robots = await text(`${origin.origin}/robots.txt`);
  if (robots) for (const m of robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) candidates.push(m[1]);
  candidates.push(`${origin.origin}/sitemap.xml`, `${origin.origin}/sitemap_index.xml`, `${origin.origin}/sitemap-index.xml`);

  const pages = new Set<string>();
  const modified = new Map<string, string>();
  const seenMaps = new Set<string>();
  let mapsRead = 0;
  const readMap = async (u: string, depth: number) => {
    if (seenMaps.has(u) || mapsRead >= 6 || depth > 2) return;
    seenMaps.add(u);
    const xml = await text(u); if (!xml) return;
    mapsRead++;
    if (/<sitemapindex/i.test(xml)) {
      const children = locs(xml).filter((c) => !/image|video|news|tag|category|author/i.test(c)).slice(0, 4);
      for (const c of children) await readMap(c, depth + 1);
    } else {
      for (const l of locs(xml)) if (domainOf(l) === host && !NOISE.test(l)) pages.add(l);
      for (const [l, d] of lastmods(xml)) modified.set(l, d);
    }
    return;
  };
  for (const c of candidates) { if (pages.size >= limit * 3) break; await readMap(c, 0); }

  if (!pages.size) {
    // No sitemap: internal links from the homepage, in order of appearance.
    const html = await text(origin.origin);
    if (html) for (const m of html.matchAll(/\bhref\s*=\s*["']([^"'#?\s>]+)["']/gi)) {
      let u: string; try { u = new URL(m[1], origin.origin).toString(); } catch { continue; }
      if (domainOf(u) === host && !NOISE.test(u)) pages.add(u.replace(/\/$/, ''));
      if (pages.size >= limit) break;
    }
  }
  // Shallow paths first (hubs before leaves), stable order otherwise.
  return [...pages].map((u, i) => ({ u, i, d: (new URL(u).pathname.match(/\//g) || []).length })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, limit).map((x) => ({ url: x.u, lastmod: modified.get(x.u) ?? null }));
}

export async function registerSitePages(sb: SupabaseClient, projectId: string, pages: (string | SitePage)[]): Promise<number> {
  if (!pages.length) return 0;
  const list = pages.map((p) => (typeof p === 'string' ? { url: p, lastmod: null } : p));
  const rows = list.map((p) => ({ project_id: projectId, url: p.url, source: 'sitemap' }));
  const { error } = await sb.from('project_pages').upsert(rows, { onConflict: 'project_id,url', ignoreDuplicates: true });
  if (error) throw new Error(`project_pages: ${error.message}`);
  // The lastmod at first sighting is a publish-date guess for suggested actions
  // (lib/suggestions); later values would be edits, so it is written once.
  // Best effort — the column arrives with 20261011_intervention_suggestions.sql.
  const dated = list.filter((p) => p.lastmod);
  if (dated.length) {
    try {
      const { data: blank, error: e } = await sb.from('project_pages').select('url').eq('project_id', projectId).is('lastmod', null).limit(1000);
      if (e) throw new Error(e.message);
      const want = new Set((blank ?? []).map((r: any) => String(r.url)));
      for (const p of dated) if (want.has(p.url)) await sb.from('project_pages').update({ lastmod: p.lastmod }).eq('project_id', projectId).eq('url', p.url).is('lastmod', null);
    } catch (e) { console.warn('[pages] lastmod not recorded:', e instanceof Error ? e.message : String(e)); }
  }
  return rows.length;
}
