// Fetch queue over the citation index: which cited urls we have not read yet
// (or are due for a monthly re-read), most-cited first; results upserted into
// geo_pages. Called from the Inngest function in batches so each batch fits
// one serverless invocation.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPage, type PageFeatures } from './fetch';

const REFRESH_DAYS = 30;
const POLITE_GAP_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DueUrl { url: string; domain: string; cites: number }

export async function dueUrls(sb: SupabaseClient, projectId: string | null, limit: number): Promise<DueUrl[]> {
  const { data, error } = await sb.rpc('geo_pages_due', { p_project_id: projectId, p_limit: limit });
  if (error) throw new Error(`geo_pages_due: ${error.message}`);
  return ((data ?? []) as { url: string; domain: string; cites: number | string }[]).map((r) => ({ url: r.url, domain: r.domain, cites: Number(r.cites) }));
}

function rowFor(f: PageFeatures, attempts: number) {
  const now = new Date();
  const next = f.ok
    ? new Date(now.getTime() + REFRESH_DAYS * 86_400_000)
    : f.retryable
      ? new Date(now.getTime() + Math.min(14, 2 * (attempts + 1)) * 86_400_000)
      : new Date(now.getTime() + 365 * 86_400_000);
  return {
    url: f.url, domain: f.domain, fetched_at: now.toISOString(), next_fetch_at: next.toISOString(),
    attempts: f.ok || !f.retryable ? Math.max(attempts + 1, 4) : attempts + 1,
    ok: f.ok, status: f.status, error: f.error, blocked_by_robots: f.blockedByRobots, final_url: f.finalUrl, content_type: f.contentType,
    title: f.title, lang: f.lang, published_at: f.publishedAt, modified_at: f.modifiedAt, author: f.author, canonical: f.canonical,
    word_count: f.wordCount, headings_count: f.headingsCount, has_faq: f.hasFaq, schema_types: f.schemaTypes, outbound_domains: f.outboundDomains,
    excerpt: f.excerpt, text_hash: f.textHash, text: f.text, fetch_ms: f.fetchMs,
  };
}

export interface BatchResult { fetched: number; ok: number; blocked: number; skipped: number; failed: number; ms: number }

// Politeness is per HOST: urls of one host go one after another with a gap;
// different hosts run in parallel (up to HOST_PARALLEL). The first version
// was fully sequential and managed ~2 pages/min once slow sites and 15s
// timeouts stacked up — a 600-url backfill would have taken five hours.
const HOST_PARALLEL = 4;
export async function fetchBatch(sb: SupabaseClient, urls: DueUrl[]): Promise<BatchResult> {
  const t0 = Date.now();
  const out: BatchResult = { fetched: 0, ok: 0, blocked: 0, skipped: 0, failed: 0, ms: 0 };
  const { data: existingRows } = await sb.from('geo_pages').select('url, attempts').in('url', urls.map((u) => u.url));
  const attempts = new Map<string, number>((existingRows ?? []).map((r: any) => [String(r.url), Number(r.attempts ?? 0)]));
  const byHost = new Map<string, DueUrl[]>();
  for (const u of urls) (byHost.get(u.domain) ?? byHost.set(u.domain, []).get(u.domain)!).push(u);
  const hosts = [...byHost.values()];
  const one = async (u: DueUrl) => {
    const f = await fetchPage(u.url);
    const row = rowFor(f, attempts.get(u.url) ?? 0);
    const { error } = await sb.from('geo_pages').upsert(row, { onConflict: 'url' });
    if (error) console.error('[pages] upsert failed', u.url, error.message);
    out.fetched++;
    if (f.ok) out.ok++; else if (f.blockedByRobots) out.blocked++; else if (!f.retryable) out.skipped++; else out.failed++;
  };
  const worker = async () => {
    for (;;) {
      const group = hosts.shift();
      if (!group) return;
      for (let i = 0; i < group.length; i++) { await one(group[i]); if (i < group.length - 1) await sleep(POLITE_GAP_MS); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(HOST_PARALLEL, hosts.length) }, worker));
  out.ms = Date.now() - t0;
  return out;
}

export const chunk = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
