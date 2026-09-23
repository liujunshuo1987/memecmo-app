// Verified actions: an intervention's url is fetched, its text hashed, and
// re-checked weekly — so "we published X" becomes "X is live, N words, last
// changed on D", and the outcome loop has a real signal instead of trust.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPage } from './fetch';

const RECHECK_DAYS = 7;

export interface VerifyResult { id: string; ok: boolean; status: number | null; changed: boolean; error: string | null }

export async function verifyIntervention(sb: SupabaseClient, iv: { id: string; url: string; text_hash?: string | null }): Promise<VerifyResult> {
  const f = await fetchPage(iv.url);
  const changed = !!(iv.text_hash && f.textHash && f.textHash !== iv.text_hash);
  const patch: Record<string, unknown> = {
    verified_at: new Date().toISOString(), page_ok: f.ok, page_status: f.status, verify_error: f.ok ? null : f.error,
  };
  if (f.ok) { patch.page_title = f.title; patch.page_words = f.wordCount; patch.text_hash = f.textHash; if (changed) patch.changed_at = new Date().toISOString(); }
  const { error } = await sb.from('interventions').update(patch).eq('id', iv.id);
  if (error) console.error('[verify] update failed', iv.id, error.message);
  return { id: iv.id, ok: f.ok, status: f.status, changed, error: f.ok ? null : f.error };
}

export async function verifyDueInterventions(sb: SupabaseClient, opts: { projectId?: string | null; limit?: number } = {}): Promise<{ checked: number; ok: number; changed: number }> {
  const since = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString();
  let q = sb.from('interventions').select('id, url, text_hash, verified_at').eq('status', 'live').not('url', 'is', null)
    .or(`verified_at.is.null,verified_at.lt.${since}`).order('verified_at', { ascending: true, nullsFirst: true }).limit(opts.limit ?? 30);
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  const { data, error } = await q;
  if (error) throw new Error(`interventions due: ${error.message}`);
  const out = { checked: 0, ok: 0, changed: 0 };
  for (const iv of (data ?? []) as { id: string; url: string; text_hash: string | null }[]) {
    const r = await verifyIntervention(sb, iv);
    out.checked++; if (r.ok) out.ok++; if (r.changed) out.changed++;
    await new Promise((res) => setTimeout(res, 500));
  }
  return out;
}
