// Operator alerting.
//
// Until 2026-09-07 the capacity-exhausted error told clients "the operator has
// been notified" while no notification existed anywhere in the codebase; the
// founder learned of a platform-wide outage from a customer. This module makes
// that sentence true. Recipients come from OPERATOR_ALERT_EMAILS (comma-
// separated); if it is unset the alert still lands in the server log at error
// level, loudly, so a missing env var is itself visible.

import { sendEmail } from '@/lib/email';
import { createClient } from '@supabase/supabase-js';

const svc = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

export interface OperatorAlert {
  kind: 'engine_capacity' | 'run_failed' | 'scan_incomplete' | 'engine_retired' | 'engine_fallback' | 'serpapi_quota';
  title: string;
  detail: string;
  runId?: string;
  projectId?: string;
  projectSlug?: string;
  brand?: string;
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function operatorRecipients(): string[] {
  return String(process.env.OPERATOR_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function notifyOperator(alert: OperatorAlert): Promise<{ sent: boolean; error?: string }> {
  const to = operatorRecipients();
  const line = `[operator-alert:${alert.kind}] ${alert.title} — ${alert.detail}` +
    (alert.brand ? ` · ${alert.brand}` : '') + (alert.runId ? ` · run ${alert.runId}` : '');
  console.error(line);

  // Durable record first; delivery is recorded against it below.
  const sb = svc();
  const { data: row } = await sb
    .from('platform_alerts')
    .insert({ kind: alert.kind, title: alert.title, detail: alert.detail, agent_run_id: alert.runId ?? null, project_id: alert.projectId ?? null, recipients: to })
    .select('id')
    .maybeSingle();
  const mark = async (delivered: boolean, err?: string) => {
    if (row?.id) await sb.from('platform_alerts').update({ delivered, delivery_err: err ?? null }).eq('id', row.id);
  };
  if (!to.length) {
    await mark(false, 'OPERATOR_ALERT_EMAILS not set');
    return { sent: false, error: 'OPERATOR_ALERT_EMAILS not set' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.memecmo.ai';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2B2B2B;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#C0455C;margin-bottom:8px;">Operator alert · ${esc(alert.kind)}</div>
      <h2 style="margin:0 0 12px;font-size:18px;">${esc(alert.title)}</h2>
      <p style="margin:0 0 14px;line-height:1.55;">${esc(alert.detail)}</p>
      ${alert.brand || alert.runId ? `<p style="margin:0 0 14px;font-size:13px;color:#6B6B6B;">${alert.brand ? `Brand: ${esc(alert.brand)}` : ''}${alert.projectSlug ? ` · ${esc(alert.projectSlug)}` : ''}${alert.runId ? ` · run ${esc(alert.runId)}` : ''}</p>` : ''}
      ${alert.kind === 'engine_capacity' ? `<p style="margin:0 0 14px;line-height:1.55;"><strong>Every LLM-backed run is failing until capacity is restored.</strong> Top up at the engine provider, then re-run the affected scans — failed runs were refunded automatically.</p>` : ''}
      <p style="margin:0;font-size:12px;color:#9A9A9A;">${esc(appUrl)} · ${new Date().toISOString()}</p>
    </div>`;
  const res = await sendEmail({ to, subject: `[MemeCMO alert] ${alert.title}`, html });
  await mark(res.sent, res.error);
  return res;
}
