'use client';

// Intervention log UI — the action side of the intervention→outcome loop.
// Two entry points: "Mark published" on a deliverable (pre-fills kind, source
// run and the targeted question), and a general "Log an action" in the right
// rail for anything the client did on their own (a site update, a directory
// claim). Outcomes are computed server-side from the scans; the panel shows
// them as fractions.

import { useCallback, useEffect, useState } from 'react';

export interface InterventionRow {
  id: string; kind: string; url: string | null; domain: string | null; title: string | null; note: string | null;
  verified_at?: string | null; page_ok?: boolean | null; page_status?: number | null; page_title?: string | null; page_words?: number | null; changed_at?: string | null; verify_error?: string | null;
  published_at: string; target_prompts: { hash: string; prompt: string }[]; source_run_id: string | null;
}
interface Win { present: number; total: number }
export interface CitedAfterRow { cites: number; engines: number; firstTs: string | null }
export interface OutcomeRow {
  scansBefore: number; scansAfter: number; awaiting: boolean;
  prompts: { hash: string; prompt: string; engines: { engine: string; before: Win; after: Win }[] }[];
  domain: { domain: string; before: { cites: number; engines: string[] }; after: { cites: number; engines: string[] } } | null;
}

export const KIND_LABELS: Record<string, { en: string; zh: string; vi: string }> = {
  content_page: { en: 'Content page', zh: '内容页面', vi: 'Trang nội dung' },
  schema: { en: 'Schema / JSON-LD', zh: '结构化数据', vi: 'Schema / JSON-LD' },
  third_party_placement: { en: 'Third-party placement', zh: '第三方投放', vi: 'Đăng trên bên thứ ba' },
  encyclopedia: { en: 'Encyclopedia entry', zh: '百科条目', vi: 'Mục bách khoa' },
  directory_profile: { en: 'Directory profile', zh: '目录档案', vi: 'Hồ sơ danh bạ' },
  site_update: { en: 'Site update', zh: '官网更新', vi: 'Cập nhật website' },
  other: { en: 'Other', zh: '其他', vi: 'Khác' },
};
const ASSET_KIND: Record<string, string> = { content_draft: 'content_page', distribution_kit: 'third_party_placement', site_optimization: 'schema', encyclopedia_entry: 'encyclopedia' };

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (w: Win) => (w.total ? `${w.present}/${w.total}` : '—');

export function useInterventions(projectId: string | undefined, opts: { sourceRunId?: string; withOutcomes?: boolean } = {}) {
  const [list, setList] = useState<InterventionRow[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, OutcomeRow>>({});
  const [citedAfter, setCitedAfter] = useState<Record<string, CitedAfterRow>>({});
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const q = new URLSearchParams({ projectId });
    if (opts.sourceRunId) q.set('sourceRunId', opts.sourceRunId);
    if (opts.withOutcomes) q.set('withOutcomes', '1');
    const res = await fetch(`/api/workspace/interventions?${q}`).catch(() => null);
    const d = res && res.ok ? await res.json() : { interventions: [], outcomes: {} };
    setList(d.interventions ?? []); setOutcomes(d.outcomes ?? {}); setCitedAfter(d.citedAfter ?? {}); setLoading(false);
  }, [projectId, opts.sourceRunId, opts.withOutcomes]);
  useEffect(() => { reload(); }, [reload]);
  return { list, outcomes, citedAfter, loading, reload };
}

export async function logIntervention(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/workspace/interventions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? null : d.error || 'Failed';
}

/** Inline form. `preset` pre-fills from a deliverable. */
export function InterventionForm({ projectId, lang, t, preset, onDone, onCancel }: {
  projectId: string; lang: 'en' | 'zh' | 'vi'; t: (s: string) => string;
  preset?: { kind?: string; title?: string; targetPrompts?: string[]; sourceRunId?: string; sourceAssetType?: string };
  onDone: () => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState(preset?.kind ?? 'site_update');
  const [url, setUrl] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    const e = await logIntervention({ projectId, kind, url: url.trim() || undefined, publishedAt: date, title: preset?.title, note: note.trim() || undefined, targetPrompts: preset?.targetPrompts, sourceRunId: preset?.sourceRunId, sourceAssetType: preset?.sourceAssetType });
    setBusy(false);
    if (e) setErr(e); else onDone();
  };
  return (
    <div className="rounded-md border border-edge bg-raised p-2.5 space-y-1.5 text-[11px]">
      <div className="flex flex-wrap gap-1.5">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-surface border border-edge rounded px-1.5 py-1 text-ink">
          {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l[lang]}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-surface border border-edge rounded px-1.5 py-1 text-ink" />
      </div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('URL where it went live')} className="w-full bg-surface border border-edge rounded px-1.5 py-1 text-ink" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (optional)')} className="w-full bg-surface border border-edge rounded px-1.5 py-1 text-ink" />
      {preset?.targetPrompts?.length ? <div className="text-faint">{t('Targets')}: {preset.targetPrompts.map((p) => `“${p.slice(0, 60)}”`).join(' · ')}</div> : null}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={busy} className="px-2 py-0.5 rounded bg-brand text-on-brand disabled:opacity-50">{t('Log')}</button>
        <button onClick={onCancel} disabled={busy} className="px-2 py-0.5 rounded border border-edge text-dim">{t('Cancel')}</button>
        {err && <span className="text-garnet">{err}</span>}
      </div>
    </div>
  );
}

/** Compact outcome line for one intervention. */
/** Phase 2: the page behind a logged action — live? how long? changed? cited since? */
export function VerifiedLine({ iv, cited, t }: { iv: InterventionRow; cited?: CitedAfterRow; t: (s: string) => string }) {
  const parts: string[] = [];
  if (!iv.verified_at) parts.push(t('verifying…'));
  else if (iv.page_ok) parts.push(`✓ ${t('live')}${iv.page_words ? ` · ${iv.page_words} ${t('words')}` : ''}${iv.changed_at ? ` · ${t('changed')} ${String(iv.changed_at).slice(0, 10)}` : ''} · ${t('checked')} ${String(iv.verified_at).slice(0, 10)}`);
  else parts.push(`✗ ${t('not reachable')}${iv.page_status ? ` (${iv.page_status})` : iv.verify_error ? ` (${iv.verify_error})` : ''} · ${t('checked')} ${String(iv.verified_at).slice(0, 10)}`);
  if (cited) parts.push(cited.cites > 0 ? `${t('cited since publish')}: ${cited.cites}× · ${cited.engines} ${t('engines')}` : t('not cited yet since publish'));
  return <div className={`text-[10px] ${iv.verified_at && !iv.page_ok ? 'text-garnet' : 'text-faint'}`}>{parts.join(' · ')}</div>;
}

export function OutcomeLine({ o, t }: { o?: OutcomeRow; t: (s: string) => string }) {
  if (!o) return null;
  if (o.awaiting) return <div className="text-[10px] text-faint">{o.scansBefore} {t('scans before')} · {t('awaiting the next scan')}</div>;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-faint">{o.scansBefore} {t('scans before')} · {o.scansAfter} {t('after')}</div>
      {o.prompts.map((p) => (
        <div key={p.hash} className="text-[10px] text-dim">
          “{p.prompt.slice(0, 50)}…” — {p.engines.map((e) => `${e.engine} ${fmt(e.before)} → ${fmt(e.after)}`).join(' · ')}
        </div>
      ))}
      {o.domain && <div className="text-[10px] text-dim">{o.domain.domain} — {t('cited')} {o.domain.before.cites}{o.scansBefore ? ` (${Math.round(o.domain.before.cites / o.scansBefore)}/scan)` : ''} → {o.domain.after.cites}{o.scansAfter ? ` (${Math.round(o.domain.after.cites / o.scansAfter)}/scan)` : ''}</div>}
    </div>
  );
}

/** Right-rail panel: list + "Log an action". */
export function ActionsPanel({ projectId, lang, t }: { projectId?: string; lang: 'en' | 'zh' | 'vi'; t: (s: string) => string }) {
  const { list, outcomes, citedAfter, reload } = useInterventions(projectId, { withOutcomes: true });
  const [open, setOpen] = useState(false);
  if (!projectId) return null;
  return (
    <div className="mc-card mc-card-sm p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-faint">{t('Actions')}</div>
        {!open && <button onClick={() => setOpen(true)} className="text-[10px] text-faint hover:text-brand">+ {t('Log an action')}</button>}
      </div>
      {open && <InterventionForm projectId={projectId} lang={lang} t={t} onDone={() => { setOpen(false); reload(); }} onCancel={() => setOpen(false)} />}
      {list.length === 0 && !open && <div className="text-[10px] text-faint">{t('Nothing logged yet — log what the brand publishes and the next scans show what moved.')}</div>}
      {list.slice(0, 6).map((iv) => (
        <div key={iv.id} className="border-t border-edge pt-1.5">
          <div className="text-[11px] text-ink">{KIND_LABELS[iv.kind]?.[lang] ?? iv.kind}{iv.title ? ` · ${iv.title}` : ''} <span className="text-faint">· {iv.published_at}</span></div>
          {iv.url && <a href={iv.url} target="_blank" rel="noreferrer" className="text-[10px] text-brand break-all">{iv.domain ?? iv.url}</a>}
          {iv.url && <VerifiedLine iv={iv} cited={citedAfter[iv.id]} t={t} />}
          <OutcomeLine o={outcomes[iv.id]} t={t} />
        </div>
      ))}
    </div>
  );
}

/** "Mark published" for a deliverable: button → form → badge. */
export function MarkPublished({ projectId, runId, artifactType, title, targetPrompts, lang, t }: {
  projectId?: string; runId?: string; artifactType: string; title?: string; targetPrompts?: string[]; lang: 'en' | 'zh' | 'vi'; t: (s: string) => string;
}) {
  const { list, reload } = useInterventions(runId ? projectId : undefined, { sourceRunId: runId });
  const [open, setOpen] = useState(false);
  if (!projectId || !runId) return null;
  const done = list[0];
  if (done) return <span className="self-center text-[10px] text-gold">{t('Published')} · {done.published_at}{done.domain ? ` · ${done.domain}` : ''}</span>;
  return (
    <>
      {!open && <button onClick={() => setOpen(true)} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition">{t('Mark published')}</button>}
      {open && (
        <div className="basis-full mt-2">
          <InterventionForm projectId={projectId} lang={lang} t={t} preset={{ kind: ASSET_KIND[artifactType] ?? 'other', title, targetPrompts, sourceRunId: runId, sourceAssetType: artifactType }} onDone={() => { setOpen(false); reload(); }} onCancel={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
