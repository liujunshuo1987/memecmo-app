'use client';

// Edit affordances for content a re-run must never overwrite (lib/edits.ts,
// /api/workspace/edits). The generated value stays untouched in the run
// output; what the user saves lives in asset_edits and is applied last by
// every reader, so the only way an edit disappears is the Revert button here.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface EditRow { unit_key: string; value: any; base_value?: any; edited_at?: string; source?: string }
export type EditMap = Record<string, EditRow>;

export function useEdits(projectId: string | undefined, assetType: string) {
  const [edits, setEdits] = useState<EditMap>({});
  useEffect(() => {
    if (!projectId) return;
    let off = false;
    fetch(`/api/workspace/edits?projectId=${projectId}&assetType=${assetType}`)
      .then((r) => (r.ok ? r.json() : { edits: [] }))
      .then((d) => {
        if (off) return;
        const m: EditMap = {};
        for (const e of d.edits ?? []) m[e.unit_key] = e;
        setEdits(m);
      })
      .catch(() => {});
    return () => { off = true; };
  }, [projectId, assetType]);

  const save = useCallback(async (unitKey: string, value: unknown, baseValue: unknown): Promise<string | null> => {
    if (!projectId) return 'No project';
    const res = await fetch('/api/workspace/edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, assetType, unitKey, value, baseValue }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return d.error || 'Save failed';
    setEdits((m) => ({ ...m, [unitKey]: { unit_key: unitKey, value, base_value: baseValue, edited_at: d.edit?.edited_at, source: 'user' } }));
    return null;
  }, [projectId, assetType]);

  const revert = useCallback(async (unitKey: string): Promise<string | null> => {
    if (!projectId) return 'No project';
    const res = await fetch(`/api/workspace/edits?projectId=${projectId}&assetType=${assetType}&unitKey=${encodeURIComponent(unitKey)}`, { method: 'DELETE' });
    if (!res.ok) return 'Revert failed';
    setEdits((m) => { const n = { ...m }; delete n[unitKey]; return n; });
    return null;
  }, [projectId, assetType]);

  return { edits, save, revert };
}

// Same identity as answerKey() on the server: sha256(trim+lowercase) → 16 hex.
export async function answerUnitKey(prompt: string, lang: 'local' | 'en'): Promise<string> {
  const bytes = new TextEncoder().encode(String(prompt).trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `answer:${hex.slice(0, 16)}:${lang}`;
}

export type UnitKind = 'text' | 'lines' | 'facts';

const toText = (v: any, kind: UnitKind): string =>
  kind === 'lines' ? (Array.isArray(v) ? v.join('\n') : '')
    : kind === 'facts' ? (Array.isArray(v) ? v.map((f: any) => `${f.label}: ${f.value}`).join('\n') : '')
      : String(v ?? '');

const fromText = (s: string, kind: UnitKind): any => {
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  if (kind === 'lines') return lines;
  if (kind === 'facts') return lines.map((l) => { const i = l.indexOf(':'); return i < 0 ? { label: l, value: '' } : { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }; });
  return s.trim();
};

/** One editable unit. `generated` is what the latest run produced; `row` is the
 *  user's edit if any. Children render the value currently in force. */
export function EditableUnit({ unitKey, kind = 'text', generated, row, save, revert, t, rows = 3, children }: {
  unitKey: string;
  kind?: UnitKind;
  generated: any;
  row?: EditRow;
  save: (unitKey: string, value: unknown, baseValue: unknown) => Promise<string | null>;
  revert: (unitKey: string) => Promise<string | null>;
  t: (s: string) => string;
  rows?: number;
  children: ReactNode;
}) {
  const inForce = row ? row.value : generated;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The run produced something different from what the user edited against.
  const drifted = !!row && row.base_value !== undefined && row.base_value !== null
    && JSON.stringify(row.base_value) !== JSON.stringify(generated ?? null);

  const begin = () => { setDraft(toText(inForce, kind)); setErr(null); setEditing(true); };
  const commit = async () => {
    setBusy(true);
    const e = await save(unitKey, fromText(draft, kind), generated ?? null);
    setBusy(false);
    if (e) setErr(e); else setEditing(false);
  };
  const undo = async () => { setBusy(true); const e = await revert(unitKey); setBusy(false); if (e) setErr(e); };

  return (
    <div className="group/edit">
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={rows}
            className="w-full bg-raised border border-edge rounded-md p-2 text-[12px] text-ink leading-relaxed focus:outline-none focus:border-brand/50"
          />
          {kind !== 'text' && <div className="text-[10px] text-faint">{kind === 'facts' ? t('One fact per line — Label: value') : t('One item per line')}</div>}
          <div className="flex items-center gap-2">
            <button onClick={commit} disabled={busy} className="text-[11px] px-2 py-0.5 rounded bg-brand text-on-brand disabled:opacity-50">{t('Save')}</button>
            <button onClick={() => setEditing(false)} disabled={busy} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim">{t('Cancel')}</button>
            {err && <span className="text-[10px] text-garnet">{err}</span>}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          <button onClick={begin} className="shrink-0 text-[10px] text-faint hover:text-brand opacity-0 group-hover/edit:opacity-100 focus:opacity-100 transition">{t('Edit')}</button>
        </div>
      )}
      {row && !editing && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px]">
          <span className="text-gold">{t('Edited · kept on re-run')}</span>
          <button onClick={undo} disabled={busy} className="text-faint hover:text-brand underline decoration-dotted">{t('Revert to generated')}</button>
          {drifted && <span className="text-faint">{t('The generated value has changed since your edit')}</span>}
          {err && <span className="text-garnet">{err}</span>}
        </div>
      )}
    </div>
  );
}
