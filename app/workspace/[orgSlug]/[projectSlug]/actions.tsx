'use client';

// Intervention log UI — the action side of the intervention→outcome loop.
// Two entry points: "Mark published" on a deliverable (pre-fills kind, source
// run and the targeted question), and a general "Log an action" in the right
// rail for anything the client did on their own (a site update, a directory
// claim). Outcomes are computed server-side from the scans; the panel shows
// them as fractions. The rail shows the latest few and opens in place to the
// whole ledger, month by month, each row with who logged it and from where.
// A third, which asks for no typing: "Suggested actions" — pages the platform
// itself found on the brand's site (lib/suggestions). The team confirms or
// sets it aside ("not ours" — worded "Not an action", since the page is always
// on the brand's own host); only a confirmed one becomes an action, under
// their name.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface InterventionRow {
  id: string; kind: string; url: string | null; domain: string | null; title: string | null; note: string | null;
  verified_at?: string | null; page_ok?: boolean | null; page_status?: number | null; page_title?: string | null; page_words?: number | null; changed_at?: string | null; verify_error?: string | null;
  published_at: string; target_prompts: { hash: string; prompt: string }[]; source_run_id: string | null;
  channel?: string | null;
  /** Who logged it — sent only when asked for (withPeople). null = nobody on record. */
  logger?: { name: string | null; operator: boolean } | null;
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

export function useInterventions(projectId: string | undefined, opts: { sourceRunId?: string; withOutcomes?: boolean; withPeople?: boolean } = {}) {
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
    if (opts.withPeople) q.set('withPeople', '1');
    const res = await fetch(`/api/workspace/interventions?${q}`).catch(() => null);
    const d = res && res.ok ? await res.json() : { interventions: [], outcomes: {} };
    setList(d.interventions ?? []); setOutcomes(d.outcomes ?? {}); setCitedAfter(d.citedAfter ?? {}); setLoading(false);
  }, [projectId, opts.sourceRunId, opts.withOutcomes, opts.withPeople]);
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
    <div className="rounded-md mc-chip-inset mc-chip-inset p-2.5 space-y-1.5 text-[11px]">
      <div className="flex flex-wrap gap-1.5">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="mc-input rounded px-1.5 py-1 text-ink">
          {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l[lang]}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mc-input rounded px-1.5 py-1 text-ink" />
      </div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('URL where it went live')} className="w-full mc-input rounded px-1.5 py-1 text-ink" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (optional)')} className="w-full mc-input rounded px-1.5 py-1 text-ink" />
      {preset?.targetPrompts?.length ? <div className="text-faint">{t('Targets')}: {preset.targetPrompts.map((p) => `“${p.slice(0, 60)}”`).join(' · ')}</div> : null}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={busy} className="px-2 py-0.5 rounded bg-brand text-on-brand disabled:opacity-50">{t('Log')}</button>
        <button onClick={onCancel} disabled={busy} className="px-2 py-0.5 rounded mc-chip-inset text-dim">{t('Cancel')}</button>
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

// ── Suggested actions ────────────────────────────────────────────────────────
export interface SuggestionItem {
  id: string; seq: number; url: string; domain: string | null; title: string | null;
  published_guess: string; guess_source: 'page_meta' | 'sitemap_lastmod' | 'first_seen';
  target_candidates: { n: number; prompt: string; shared: number; strong: boolean }[];
  evidence: { cites?: number; engines?: string[] };
}

// Kept here rather than in the workspace dictionary: these strings belong to this block only.
const SUGGEST_LABELS = {
  heading: { en: 'Suggested actions', zh: '建议登记的行动', vi: 'Hành động gợi ý' },
  intro: {
    en: 'New pages the platform found on the brand\'s site. Nothing is logged until someone on the team confirms.',
    zh: '平台在品牌官网上发现的新页面。团队成员确认后才登记,未确认的不算行动。',
    vi: 'Trang mới nền tảng phát hiện trên website của thương hiệu. Chỉ ghi khi thành viên đội ngũ xác nhận.',
  },
  confirm: { en: 'Confirm', zh: '确认', vi: 'Xác nhận' },
  notOurs: { en: 'Not an action', zh: '不算行动', vi: 'Không phải hành động' },
  published: { en: 'Published', zh: '发布日期', vi: 'Ngày đăng' },
  page_meta: { en: 'date stated on the page', zh: '页面标注的日期', vi: 'ngày ghi trên trang' },
  sitemap_lastmod: { en: 'date in the sitemap', zh: 'sitemap 中的日期', vi: 'ngày trong sitemap' },
  first_seen: { en: 'first seen by the platform', zh: '平台首次发现的日期', vi: 'ngày nền tảng thấy lần đầu' },
  fixDate: { en: 'correct it if it is off', zh: '如有出入请修改', vi: 'sửa nếu chưa đúng' },
  cited: { en: 'cited in the scans', zh: '在扫描中被引用', vi: 'được trích dẫn trong các lần quét' },
  targets: { en: 'Target questions (optional)', zh: '目标问题(可选)', vi: 'Câu hỏi mục tiêu (tùy chọn)' },
  waiting: {
    en: 'Waiting for the client team to confirm — MemeCMO does not confirm on their behalf.',
    zh: '等待客户团队确认 —— MemeCMO 不代为确认。',
    vi: 'Đang chờ đội ngũ khách hàng xác nhận — MemeCMO không xác nhận thay.',
  },
  more: { en: 'more', zh: '条更多', vi: 'mục nữa' },
} as const;

export function useSuggestions(projectId: string | undefined) {
  const [list, setList] = useState<SuggestionItem[]>([]);
  const [can, setCan] = useState({ confirm: false, dismiss: false });
  const reload = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/workspace/suggestions?projectId=${encodeURIComponent(projectId)}`).catch(() => null);
    const d = res && res.ok ? await res.json() : { suggestions: [] };
    setList(d.suggestions ?? []); setCan({ confirm: !!d.canConfirm, dismiss: !!d.canDismiss });
  }, [projectId]);
  useEffect(() => { reload(); }, [reload]);
  return { list, can, reload };
}

async function decideSuggestion(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/workspace/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? null : d.error || 'Failed';
}

/** One found page: link, where the date guess comes from, Confirm / Not ours. */
function SuggestionCard({ s, projectId, lang, t, can, onDone }: {
  s: SuggestionItem; projectId: string; lang: 'en' | 'zh' | 'vi'; t: (s: string) => string; can: { confirm: boolean; dismiss: boolean }; onDone: () => void;
}) {
  const L = (k: keyof typeof SUGGEST_LABELS) => SUGGEST_LABELS[k][lang];
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(s.published_guess);
  // Candidates start unticked: the target question is the confirming person's choice, not the matcher's.
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    const e = await decideSuggestion({ projectId, id: s.id, ...body });
    setBusy(false);
    if (e) setErr(e); else onDone();
  };
  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  return (
    <div className="border-t border-edge pt-1.5 space-y-1">
      <div className="text-[11px] text-ink">{s.title || s.domain || s.url}</div>
      <a href={s.url} target="_blank" rel="noreferrer" className="block text-[10px] text-brand break-all">{s.url.replace(/^https?:\/\/(www\.)?/, '')}</a>
      <div className="text-[10px] text-faint">
        {L('published')} {s.published_guess} · {L(s.guess_source)}
        {s.evidence?.cites ? ` · ${L('cited')} ${s.evidence.cites}×` : ''}
      </div>
      {open ? (
        <div className="rounded-md mc-chip-inset p-2 space-y-1.5 text-[11px]">
          <label className="flex flex-wrap items-center gap-1.5 text-dim">
            {L('published')}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mc-input rounded px-1.5 py-1 text-ink" />
            <span className="text-[10px] text-faint">{L(s.guess_source)} — {L('fixDate')}</span>
          </label>
          {s.target_candidates.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] text-faint">{L('targets')}</div>
              {s.target_candidates.map((c) => (
                <label key={c.n} className="flex items-start gap-1.5 text-[10px] text-dim">
                  <input type="checkbox" checked={picked.includes(c.prompt)} onChange={() => toggle(c.prompt)} className="mt-0.5" />
                  <span>Q{c.n} · {c.prompt}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => send({ action: 'confirm', publishedAt: date, targetPrompts: picked })} disabled={busy || !date} className="px-2 py-0.5 rounded bg-brand text-on-brand disabled:opacity-50">{L('confirm')}</button>
            <button onClick={() => setOpen(false)} disabled={busy} className="px-2 py-0.5 rounded mc-chip-inset text-dim">{t('Cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[10px]">
          {can.confirm && <button onClick={() => setOpen(true)} disabled={busy} className="px-2 py-0.5 rounded bg-brand text-on-brand disabled:opacity-50">{L('confirm')}</button>}
          {can.dismiss && <button onClick={() => send({ action: 'dismiss' })} disabled={busy} className="px-2 py-0.5 rounded mc-chip-inset text-dim hover:text-brand disabled:opacity-50">{L('notOurs')}</button>}
        </div>
      )}
      {err && <div className="text-[10px] text-garnet">{err}</div>}
    </div>
  );
}

function SuggestedActions({ projectId, lang, t, list, can, onDone }: {
  projectId: string; lang: 'en' | 'zh' | 'vi'; t: (s: string) => string; list: SuggestionItem[]; can: { confirm: boolean; dismiss: boolean }; onDone: () => void;
}) {
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 4);
  return (
    <div className="rounded-md mc-chip-inset p-2 space-y-1.5">
      <div className="text-[10px] uppercase tracking-widest text-gold">{SUGGEST_LABELS.heading[lang]} · {list.length}</div>
      <div className="text-[10px] text-faint">{SUGGEST_LABELS.intro[lang]}</div>
      {!can.confirm && <div className="text-[10px] text-dim">{SUGGEST_LABELS.waiting[lang]}</div>}
      {shown.map((s) => <SuggestionCard key={s.id} s={s} projectId={projectId} lang={lang} t={t} can={can} onDone={onDone} />)}
      {!all && list.length > shown.length && <button onClick={() => setAll(true)} className="text-[10px] text-faint hover:text-brand">+ {list.length - shown.length} {SUGGEST_LABELS.more[lang]}</button>}
    </div>
  );
}

// ── The ledger in the right rail ─────────────────────────────────────────────
const COMPACT = 6;     // rows shown before "Show all"
const PAGE = 50;       // the API's page size; the rest of the ledger is asked for page by page
const NOTE_CLIP = 90;  // a note longer than this is cut to two lines until opened

// Where an action was logged from (interventions.channel).
const CHANNEL_LABELS: Record<string, { en: string; zh: string; vi: string }> = {
  web: { en: 'Workspace (web)', zh: '工作台(网页)', vi: 'Nền tảng (web)' },
  lark: { en: 'Lark', zh: 'Lark', vi: 'Lark' },
  connector: { en: 'Connector', zh: '连接器', vi: 'Connector' },
};

// A note saying someone else entered the action for the client team. No column
// records this, so the note's wording is the only signal; these are the
// phrasings in use (the 2026-10-13 re-entries read "Nhập lại từ lệnh … · 据…补录").
// The note itself is always shown, so a phrasing missed here can still be read.
const ON_BEHALF = /on behalf|re-?entered|nhập lại|nhập thay|nhập hộ|ghi thay|ghi hộ|thay mặt|补录|代录|代为登记|代为录入|代客户/i;

const WHAT_AN_ACTION_IS = 'An action is something the brand has published where AI can read it (a web page, a press article, a directory profile), logged here so the next scans can show what changed.';

interface LedgerRest { rows: InterventionRow[]; outcomes: Record<string, OutcomeRow>; citedAfter: Record<string, CitedAfterRow>; state: 'idle' | 'loading' | 'done' | 'failed' }
const NO_REST: LedgerRest = { rows: [], outcomes: {}, citedAfter: {}, state: 'idle' };

/** The project's whole ledger. The first page is useInterventions' own, so it
 *  reloads whenever that does; the project's count says whether there is more,
 *  and the later pages are fetched only when someone asks to see everything. */
function useLedger(projectId: string | undefined) {
  const first = useInterventions(projectId, { withOutcomes: true, withPeople: true });
  const [count, setCount] = useState<{ total: number | null; failed: boolean } | null>(null); // null until the first page has come back
  const [rest, setRest] = useState<LedgerRest>(NO_REST);
  const unloaded = useRef(first.list); // the hook's starting list: while it is still this one, nothing has come back
  const round = useRef(0); // one per (re)load of the first page; later pages of an older round are dropped

  useEffect(() => {
    if (!projectId || first.loading || first.list === unloaded.current) return;
    const mine = ++round.current;
    setRest(NO_REST);
    (async () => {
      const res = await fetch(`/api/workspace/interventions?${new URLSearchParams({ projectId, count: '1' })}`).catch(() => null);
      const d = res && res.ok ? await res.json().catch(() => null) : null;
      if (round.current === mine) setCount({ total: typeof d?.total === 'number' ? d.total : null, failed: !d });
    })();
  }, [projectId, first.loading, first.list]);

  const loadRest = useCallback(async () => {
    if (!projectId) return;
    const mine = round.current;
    const seen = new Set(first.list.map((iv) => iv.id));
    let acc: LedgerRest = { ...NO_REST, state: 'loading' };
    let have = first.list.length;
    setRest(acc);
    for (;;) {
      const q = new URLSearchParams({ projectId, withOutcomes: '1', withPeople: '1', offset: String(have), limit: String(PAGE) });
      const res = await fetch(`/api/workspace/interventions?${q}`).catch(() => null);
      const d = res && res.ok ? await res.json().catch(() => null) : null;
      if (round.current !== mine) return;
      if (!d) { setRest({ ...acc, state: 'failed' }); return; }
      const page: InterventionRow[] = d.interventions ?? [];
      have += page.length;
      const more = page.length > 0 && (typeof d.total === 'number' ? have < d.total : page.length === PAGE);
      acc = {
        rows: [...acc.rows, ...page.filter((iv) => !seen.has(iv.id))],
        outcomes: { ...acc.outcomes, ...(d.outcomes ?? {}) }, citedAfter: { ...acc.citedAfter, ...(d.citedAfter ?? {}) },
        state: more ? 'loading' : 'done',
      };
      page.forEach((iv) => seen.add(iv.id));
      setRest(acc);
      if (!more) return;
    }
  }, [projectId, first.list]);

  const rows = useMemo(() => [...first.list, ...rest.rows], [first.list, rest.rows]);
  const outcomes = useMemo(() => ({ ...first.outcomes, ...rest.outcomes }), [first.outcomes, rest.outcomes]);
  const citedAfter = useMemo(() => ({ ...first.citedAfter, ...rest.citedAfter }), [first.citedAfter, rest.citedAfter]);
  const known = count?.total ?? null; // the server's count; null = not known
  // Without a count, a full first page may not be the end of it.
  const more = rest.state !== 'done' && (known != null ? known > rows.length : first.list.length >= PAGE);
  // No rows although the count says there are some, or no count either: that did not load; it is not "nothing logged".
  const failed = !!count && !rows.length && (count.failed || (known ?? 0) > 0);
  return {
    rows, outcomes, citedAfter, loaded: !!count, failed, more,
    total: Math.max(known ?? 0, rows.length), atLeast: known == null && more,
    rest: rest.state, loadRest, reload: first.reload,
  };
}

/** One logged action: what, when, who logged it and from where, its note, then the page check and the outcome. */
function ActionRow({ iv, outcome, cited, lang, t }: {
  iv: InterventionRow; outcome?: OutcomeRow; cited?: CitedAfterRow; lang: 'en' | 'zh' | 'vi'; t: (s: string) => string;
}) {
  const [full, setFull] = useState(false);
  const note = (iv.note ?? '').trim();
  const label = iv.title || iv.domain;
  const by = iv.logger !== undefined ? `${t('Logged by')}: ${iv.logger?.operator ? 'MemeCMO' : iv.logger?.name || t('not recorded')}` : '';
  const channel = iv.channel ? `${t('Channel')}: ${CHANNEL_LABELS[iv.channel]?.[lang] ?? iv.channel}` : '';
  return (
    <div className="border-t border-edge pt-1.5 space-y-0.5">
      <div className="text-[11px] text-ink">{KIND_LABELS[iv.kind]?.[lang] ?? iv.kind}{label ? ` · ${label}` : ''} <span className="text-faint whitespace-nowrap">· {iv.published_at}</span></div>
      {(by || channel) && <div className="flex flex-wrap gap-x-2 text-[10px] text-faint"><span className="min-w-0 break-words">{by}</span><span className="whitespace-nowrap">{channel}</span></div>}
      {note && ON_BEHALF.test(note.normalize('NFC')) && (
        <div><span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">{t('Entered on the client\'s behalf')}</span></div>
      )}
      {note && (
        <div className="text-[10px] text-dim pl-2 border-l-2 border-gold/50 break-words">
          <div className={full ? '' : 'line-clamp-2'}>{t('Note')}: {note}</div>
          {note.length > NOTE_CLIP && <button onClick={() => setFull(!full)} aria-expanded={full} className="text-brand hover:underline">{full ? t('Collapse') : t('Full text')}</button>}
        </div>
      )}
      {iv.url && <a href={iv.url} target="_blank" rel="noreferrer" title={iv.url} className="block truncate text-[10px] text-brand">{iv.url.replace(/^https?:\/\/(www\.)?/, '')}</a>}
      {iv.url && <VerifiedLine iv={iv} cited={cited} t={t} />}
      <OutcomeLine o={outcome} t={t} />
    </div>
  );
}

/** Right-rail panel: "Log an action", suggested actions, the latest few and, opened, the whole ledger by month. */
export function ActionsPanel({ projectId, lang, t }: { projectId?: string; lang: 'en' | 'zh' | 'vi'; t: (s: string) => string }) {
  const ledger = useLedger(projectId);
  const suggested = useSuggestions(projectId);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const { rows, total, more, rest, loadRest } = ledger;
  useEffect(() => { if (all && more && rest === 'idle') loadRest(); }, [all, more, rest, loadRest]);
  if (!projectId) return null;
  const empty = ledger.loaded && !ledger.failed && total === 0;
  const logButton = (wide: boolean) => (
    <button onClick={() => setOpen(true)} className={`mc-btn-brand text-[11px] font-semibold px-2.5 hover:brightness-110 whitespace-nowrap ${wide ? 'w-full py-1.5' : 'py-1'}`}>+ {t('Log an action')}</button>
  );
  const toggle = rows.length > 0 && total > COMPACT && (
    <button onClick={() => setAll(!all)} aria-expanded={all} className="w-full mc-btn-soft text-[11px] text-dim hover:text-brand py-1.5 tabular-nums">{all ? t('Collapse') : `${t('Show all')} (${total}${ledger.atLeast ? '+' : ''})`}</button>
  );
  const row = (iv: InterventionRow) => <ActionRow key={iv.id} iv={iv} outcome={ledger.outcomes[iv.id]} cited={ledger.citedAfter[iv.id]} lang={lang} t={t} />;
  // Opened: every row, under its publish month (the rows arrive newest first).
  const months: { month: string; rows: InterventionRow[] }[] = [];
  if (all) for (const iv of rows) {
    const month = iv.published_at.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) last.rows.push(iv); else months.push({ month, rows: [iv] });
  }
  return (
    <div className="mc-card mc-card-sm p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-faint tabular-nums">{t('Actions')}{total > 0 ? ` · ${total}${ledger.atLeast ? '+' : ''}` : ''}</div>
        {!open && !empty && logButton(false)}
      </div>
      {open && <InterventionForm projectId={projectId} lang={lang} t={t} onDone={() => { setOpen(false); ledger.reload(); }} onCancel={() => setOpen(false)} />}
      {empty && !open && (
        <>
          <div className="text-[11px] leading-relaxed text-dim">{t(WHAT_AN_ACTION_IS)}</div>
          {logButton(true)}
        </>
      )}
      {!empty && total > 0 && <div className="text-[10px] text-faint">{t('What the brand published, and what AI did afterwards.')}</div>}
      <SuggestedActions projectId={projectId} lang={lang} t={t} list={suggested.list} can={suggested.can} onDone={() => { suggested.reload(); ledger.reload(); }} />
      {ledger.failed && <div className="text-[10px] text-garnet">{t('Load failed')} · <button onClick={ledger.reload} className="underline hover:text-brand">{t('Retry')}</button></div>}
      {all && toggle}
      {all
        ? months.map((m) => (
          <div key={m.month} className="space-y-1.5">
            <div className="flex items-baseline justify-between pt-1 text-[10px] tracking-widest text-gold tabular-nums"><span>{m.month}</span><span className="text-faint">{m.rows.length}</span></div>
            {m.rows.map(row)}
          </div>
        ))
        : rows.slice(0, COMPACT).map(row)}
      {all && rest === 'loading' && <div className="text-[10px] text-faint tabular-nums">{t('Loading…')} {rows.length}{ledger.atLeast ? '' : `/${total}`}</div>}
      {all && rest === 'failed' && <div className="text-[10px] text-garnet tabular-nums">{t('Load failed')} ({rows.length}{ledger.atLeast ? '+' : `/${total}`}) · <button onClick={loadRest} className="underline hover:text-brand">{t('Retry')}</button></div>}
      {toggle}
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
      {!open && <button onClick={() => setOpen(true)} className="text-[11px] px-2 py-0.5 rounded mc-chip-inset text-dim hover:border-brand/50 hover:text-brand transition">{t('Mark published')}</button>}
      {open && (
        <div className="basis-full mt-2">
          <InterventionForm projectId={projectId} lang={lang} t={t} preset={{ kind: ASSET_KIND[artifactType] ?? 'other', title, targetPrompts, sourceRunId: runId, sourceAssetType: artifactType }} onDone={() => { setOpen(false); reload(); }} onCancel={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
