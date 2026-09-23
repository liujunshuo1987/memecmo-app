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

export async function discoverSitePages(brandUrl: string, limit = 60): Promise<string[]> {
  let origin: URL;
  try { origin = new URL(brandUrl.startsWith('http') ? brandUrl : `https://${brandUrl}`); } catch { return []; }
  const host = domainOf(origin.toString());
  const candidates: string[] = [];
  const robots = await text(`${origin.origin}/robots.txt`);
  if (robots) for (const m of robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) candidates.push(m[1]);
  candidates.push(`${origin.origin}/sitemap.xml`, `${origin.origin}/sitemap_index.xml`, `${origin.origin}/sitemap-index.xml`);

  const pages = new Set<string>();
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
  return [...pages].map((u, i) => ({ u, i, d: (new URL(u).pathname.match(/\//g) || []).length })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, limit).map((x) => x.u);
}

export async function registerSitePages(sb: SupabaseClient, projectId: string, urls: string[]): Promise<number> {
  if (!urls.length) return 0;
  const rows = urls.map((url) => ({ project_id: projectId, url, source: 'sitemap' }));
  const { error } = await sb.from('project_pages').upsert(rows, { onConflict: 'project_id,url', ignoreDuplicates: true });
  if (error) throw new Error(`project_pages: ${error.message}`);
  return rows.length;
}
