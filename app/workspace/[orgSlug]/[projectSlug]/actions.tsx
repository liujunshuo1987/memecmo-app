'use client';

// Intervention log UI — the action side of the intervention→outcome loop.
// Two entry points: "Mark published" on a deliverable (pre-fills kind, source
// run and the targeted question), and the right rail's panel for anything the
// client did on their own. The panel opens with the place to type: paste a
// link (or several "link date" lines), the kind is worked out from the link,
// Enter logs it. Outcomes are computed server-side from the scans; the panel
// says them in whole sentences, each figure with its label. The rail shows the
// latest few; the whole ledger, month by month, is the same panel on the
// workspace's stage (`whole`) — the "Actions" row of the left list, or "Show
// all" in the rail. Both read one useLedger, held by the workspace.
// A third, which asks for no typing: "Suggested actions" — pages the platform
// itself found on the brand's site (lib/suggestions). The team confirms or
// sets it aside ("not ours" — worded "Not an action", since the page is always
// on the brand's own host); only a confirmed one becomes an action, under
// their name.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { parseActionLine, type ActionDraft } from '@/lib/action-input';
import { NOTES_LINK_LABEL, NOTES_PATH } from '@/lib/notes/paths';

type Lang = 'en' | 'zh' | 'vi';
type T = (s: string) => string;
// A sentence from the dictionary with its figures put in: "{n}" becomes the value.
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
// Sentences one after another: a space between them, except after a Chinese full stop.
const JOINED = /[。！？]$/;
const sentences = (parts: (string | false | 0 | null | undefined)[]) => (parts.filter(Boolean) as string[]).reduce((all, s) => all + (all && !JOINED.test(all) ? ' ' : '') + s, '');

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
/** An engine began listing a different number of sources per answer from the scan dated `from` (lib/interventions sourceCountBreaks). */
export interface SourceBreakRow { engine: string; from: string; before: number; after: number }
export interface OutcomeRow {
  scansBefore: number; scansAfter: number; awaiting: boolean;
  prompts: { hash: string; prompt: string; engines: { engine: string; before: Win; after: Win }[] }[];
  domain: { domain: string; before: { cites: number; engines: string[] }; after: { cites: number; engines: string[] } } | null;
  sourceBreaks?: SourceBreakRow[];
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

/** The page behind a logged action, in whole sentences: was it read, is it live, has AI cited it since.
 *  `flow`: the sentences run on as one paragraph (the stage's row) instead of one to a line. */
export function VerifiedLine({ iv, cited, t, flow = false }: { iv: InterventionRow; cited?: CitedAfterRow; t: T; flow?: boolean }) {
  const day = String(iv.verified_at ?? '').slice(0, 10);
  const why = String(iv.verify_error ?? '');
  // Red is for a page that answers with an error. A page the platform will not or cannot read is not the reader's mistake.
  const broken = !!iv.verified_at && !iv.page_ok && (iv.page_status === 404 || iv.page_status === 410 || (iv.page_status ?? 0) >= 500);
  const check = !iv.verified_at ? t('The page has not been checked yet.')
    : iv.page_ok ? sentences([
      fill(t(iv.page_words ? 'The page is live ({words} words), checked on {date}.' : 'The page is live, checked on {date}.'), { words: iv.page_words ?? 0, date: day }),
      iv.changed_at && fill(t('Its content changed on {date}.'), { date: String(iv.changed_at).slice(0, 10) }),
    ])
    : broken ? fill(t('The page did not open (HTTP {status}) when checked on {date}.'), { status: iv.page_status ?? '', date: day })
    : /skipped host/.test(why) ? t('Recorded. The platform does not read pages on this site (it needs a sign-in or is an app), so the page itself is not checked.')
    : /robots/.test(why) ? t('Recorded. This site asks robots not to read the page, so the platform does not check it.')
    : fill(t('The platform could not read the page on {date}; it checks again every week.'), { date: day });
  const since = cited && (cited.cites > 0 ? fill(t('Since it was published, AI has cited this page {n}× on {e} of the AI engines.'), { n: cited.cites, e: cited.engines }) : t('AI has not cited this page since it was published.'));
  if (flow) return <div className="text-[11px] leading-snug text-dim"><span className={broken ? 'text-garnet' : undefined}>{check}</span>{since && `${JOINED.test(check) ? '' : ' '}${since}`}</div>;
  return (
    <>
      <div className={`text-[11px] leading-snug ${broken ? 'text-garnet' : 'text-dim'}`}>{check}</div>
      {since && <div className="text-[11px] leading-snug text-dim">{since}</div>}
    </>
  );
}

const MEASUREMENT_NOTE = 'Measurement note: from the {date} scan, {engine} lists about {after} sources per answer (about {before} before). This is a change on the engine\'s side, so citation counts before and after are not directly comparable.';

/** An engine changed how many sources it lists, so the citation counts on either side are not comparable. One sentence per change, quiet, with the public notes page. */
function MeasurementNote({ breaks, lang, t }: { breaks: SourceBreakRow[]; lang: Lang; t: T }) {
  if (!breaks.length) return null;
  return (
    <div className="text-[11px] leading-snug text-dim">
      {breaks.map((b) => <span key={`${b.engine} ${b.from}`}>{fill(t(MEASUREMENT_NOTE), { date: b.from, engine: b.engine, before: Math.round(b.before), after: Math.round(b.after) })} </span>)}
      <a href={NOTES_PATH[lang]} target="_blank" rel="noreferrer" className="text-brand hover:underline whitespace-nowrap">{NOTES_LINK_LABEL[lang]} →</a>
    </div>
  );
}

/** What the scans on either side of the publish date show. The figures are the
 *  server's, unchanged; each now carries its label. `note`: where the
 *  measurement note for this row is said — under its site line, or once above the list.
 *  `flow`: the sentences run on as one paragraph (the stage's row); a line per target question stays a line. */
export function OutcomeLine({ o, t, lang = 'en', note, flow = false }: { o?: OutcomeRow; t: T; lang?: Lang; note?: 'inline' | 'above'; flow?: boolean }) {
  if (!o) return null;
  if (o.awaiting) return <div className="text-[11px] leading-snug text-dim">{fill(t('Scans before the publish date: {b}. Waiting for the next scan to compare.'), { b: o.scansBefore })}</div>;
  const perScan = (cites: number, scans: number) => (scans ? Math.round(cites / scans) : '—');
  const compared = fill(t('Scans compared: {b} before the publish date, {a} after.'), { b: o.scansBefore, a: o.scansAfter });
  const questions = o.prompts.map((p) => (
    <div key={p.hash}>{fill(t('Answers naming the brand, before → after, to “{q}”:'), { q: p.prompt.length > 60 ? `${p.prompt.slice(0, 60)}…` : p.prompt })} {p.engines.map((e) => `${e.engine} ${fmt(e.before)} → ${fmt(e.after)}`).join(' · ')}</div>
  ));
  const site = o.domain && fill(t('Citations of the whole site {domain}, per scan, before → after: {pb} → {pa} (totals {cb} → {ca}).'), {
    domain: o.domain.domain, pb: perScan(o.domain.before.cites, o.scansBefore), pa: perScan(o.domain.after.cites, o.scansAfter), cb: o.domain.before.cites, ca: o.domain.after.cites,
  });
  const pointer = o.domain && note === 'above' && !!o.sourceBreaks?.length && t('※ See the measurement note at the top of the list.');
  // Run on: what is not a question's own line reads as one paragraph, in the same order.
  const tail = flow ? sentences([!questions.length && compared, site]) : '';
  return (
    <div className="space-y-0.5 text-[11px] leading-snug text-dim">
      {flow ? (
        <>
          {questions.length > 0 && <div>{compared}</div>}
          {questions}
          {(tail || pointer) && <div>{tail}{pointer && <>{tail && !JOINED.test(tail) ? ' ' : ''}<span className="inline-block text-faint">{pointer}</span></>}</div>}
        </>
      ) : (
        <>
          <div>{compared}</div>
          {questions}
          {site && <div>{site}</div>}
        </>
      )}
      {o.domain && note === 'inline' && <MeasurementNote breaks={o.sourceBreaks ?? []} lang={lang} t={t} />}
      {!flow && pointer && <div className="text-faint">{pointer}</div>}
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

// ── The ledger: a summary in the right rail, the whole of it on the stage ────
const PAGE = 50;       // the API's page size; the rest of the ledger is asked for page by page
const NONE: string[] = [];

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

// What the place is called, wherever it is named (the list's row, the rail's card, the stage): by what a person does there.
// "Actions" alone told nobody that this is where to say what was published, and in Vietnamese it is also a group's heading in the same list.
export const LOG_HERE = 'Log what you published';
const WHY_LOG = 'Log what the brand has published (an article, a web page, a profile) so the next scans can show whether the AI answers changed.';
// A link as a person reads it: no scheme, no www, no query string.
const shortLink = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');

interface LedgerRest { rows: InterventionRow[]; outcomes: Record<string, OutcomeRow>; citedAfter: Record<string, CitedAfterRow>; state: 'idle' | 'loading' | 'done' | 'failed' }
const NO_REST: LedgerRest = { rows: [], outcomes: {}, citedAfter: {}, state: 'idle' };

/** The project's whole ledger. The first page is useInterventions' own, so it
 *  reloads whenever that does; the project's count says whether there is more,
 *  and the later pages are fetched only when someone asks to see everything
 *  (`all`). The same small request brings what the paste field needs: the
 *  brand's own hosts and its core questions. The workspace holds one of these
 *  and hands it to the rail and to the stage, so an action logged in either
 *  shows in both. */
export function useLedger(projectId: string | undefined, all = false) {
  const first = useInterventions(projectId, { withOutcomes: true, withPeople: true });
  const [meta, setMeta] = useState<{ total: number | null; failed: boolean; hosts: string[]; core: string[] } | null>(null);
  const [rest, setRest] = useState<LedgerRest>(NO_REST);
  const unloaded = useRef(first.list); // the hook's starting list: while it is still this one, nothing has come back
  const round = useRef(0); // one per (re)load of the first page; answers of an older round are dropped
  const arrived = first.list !== unloaded.current;

  // On opening, and again after each (re)load of the first page: the later pages are stale, the count may have moved.
  useEffect(() => {
    if (!projectId || first.loading) return;
    const mine = ++round.current;
    setRest(NO_REST);
    (async () => {
      const res = await fetch(`/api/workspace/interventions?${new URLSearchParams({ projectId, meta: '1' })}`).catch(() => null);
      const d = res && res.ok ? await res.json().catch(() => null) : null;
      if (round.current !== mine) return;
      setMeta((was) => ({
        total: typeof d?.total === 'number' ? d.total : null, failed: !d,
        hosts: Array.isArray(d?.brandHosts) ? d.brandHosts : was?.hosts ?? NONE, core: Array.isArray(d?.core) ? d.core : was?.core ?? NONE,
      }));
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
  const known = meta?.total ?? null; // the server's count; null = not known
  // Without a count, a full first page may not be the end of it.
  const more = rest.state !== 'done' && (known != null ? known > rows.length : first.list.length >= PAGE);
  // The page came back with no rows although the count says there are some, or the count did not come either: that did not load; it is not "nothing logged".
  const failed = arrived && !first.loading && !!meta && !rows.length && (meta.failed || (known ?? 0) > 0);
  // Kept below the effect that starts a round, so on a (re)load of the first page this one reads the new round.
  useEffect(() => { if (all && more && rest.state === 'idle') loadRest(); }, [all, more, rest.state, loadRest]);
  return {
    rows, outcomes, citedAfter, failed, more, loaded: arrived && !!meta,
    total: Math.max(known ?? 0, rows.length), atLeast: known == null && more,
    hosts: meta?.hosts ?? NONE, core: meta?.core ?? NONE,
    rest: rest.state, loadRest, reload: first.reload,
  };
}
export type Ledger = ReturnType<typeof useLedger>;

interface Logged { rows: InterventionRow[]; already: InterventionRow[]; failed: { line: string; error: string }[] }

async function postAction(body: Record<string, unknown>): Promise<{ row: InterventionRow | null; duplicate: boolean; error: string | null }> {
  const res = await fetch('/api/workspace/interventions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const d = res ? await res.json().catch(() => ({})) : {};
  return res?.ok && d.intervention ? { row: d.intervention, duplicate: !!d.duplicate, error: null } : { row: null, duplicate: false, error: d.error || 'Failed' };
}

/** The place to type. One line: a link, Enter logs it. Several lines of "link
 *  date": a list to check, and one button to record them all. The kind is read
 *  from the link (lib/action-input, the Lark command's rule) and can be changed;
 *  note and target questions are there, folded. */
function QuickAdd({ projectId, lang, t, hosts, core, onLogged }: {
  projectId: string; lang: Lang; t: T; hosts: string[]; core: string[]; onLogged: (r: Logged) => void;
}) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(today());
  const [kinds, setKinds] = useState<Record<string, string>>({}); // a kind the person chose themself, by link
  const [more, setMore] = useState(false);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<{ i: number; n: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = box.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 168)}px`; }, [text]);

  const lines = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), [text]);
  const drafts = useMemo(() => lines.map((raw) => ({ raw, ...parseActionLine(raw, today(), hosts) })), [lines, hosts]);
  const one = drafts.length === 1 ? drafts[0] : null;
  // A date typed with the link is the publish date: it goes into the date box, so there is one date to read.
  const typedDate = one?.date;
  useEffect(() => { if (typedDate) setDate(typedDate); }, [typedDate]);

  const kindOf = (d: ActionDraft) => kinds[d.url ?? ''] ?? d.kind;
  const list = drafts.length > 1
    ? drafts.map((d, i) => ({ d, left: !d.url ? 'no link, left out' : drafts.findIndex((x) => x.url === d.url) < i ? 'same link as a line above, left out' : null }))
    : [];
  const toSave = one ? [one] : list.filter((x) => !x.left).map((x) => x.d);

  const save = async () => {
    if (busy) return;
    if (!toSave.length) { box.current?.focus(); return; }
    setErr(null);
    const out: Logged = { rows: [], already: [], failed: [] };
    const again: string[] = [];
    for (let i = 0; i < toSave.length; i++) {
      const d = toSave[i];
      setBusy({ i: i + 1, n: toSave.length });
      const targets = Array.from(new Set([...(one ? picked : []), ...d.targets.map((n) => core[n - 1]).filter(Boolean)]));
      const r = await postAction({
        projectId, kind: kindOf(d), url: d.url ?? undefined, ifNew: true,
        // One line: the date box is the date (a date typed with the link is already in it). A list: each line's own date, the box for lines without one.
        publishedAt: one ? date : d.date ?? date,
        title: d.url ? undefined : d.note || undefined,
        note: (one ? note.trim() : '') || (d.url ? d.note : '') || undefined,
        targetPrompts: targets.length ? targets : undefined,
      });
      if (!r.row) { out.failed.push({ line: d.url ?? d.note, error: r.error ?? 'Failed' }); again.push(d.raw); }
      else (r.duplicate ? out.already : out.rows).push(r.row);
    }
    setBusy(null);
    // Nothing went through: what was typed stays, with the server's words.
    if (out.failed.length === toSave.length) { setErr(out.failed[0].error); return; }
    setText(again.join('\n')); setNote(''); setPicked([]); setKinds({}); setMore(false); setDate(today());
    onLogged(out);
  };

  const kindSelect = (d: ActionDraft) => (
    <select value={kindOf(d)} onChange={(e) => setKinds({ ...kinds, [d.url ?? '']: e.target.value })} aria-label={t('Kind')}
      className="max-w-full bg-transparent text-[10px] text-ink underline decoration-dotted underline-offset-2 cursor-pointer">
      {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l[lang]}</option>)}
    </select>
  );
  const primary = 'mc-btn-brand text-[12px] font-semibold px-3 py-1 hover:brightness-110 disabled:opacity-60 whitespace-nowrap';
  const saving = busy && fill(t('Saving {i} of {n}…'), busy);
  return (
    <div className="space-y-1.5">
      <textarea ref={box} rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={!!busy}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && drafts.length <= 1) { e.preventDefault(); save(); } }}
        placeholder={t('Paste the link of what was published')} aria-label={t('Paste the link of what was published')}
        className="block w-full resize-none mc-input rounded-md px-2 py-1.5 text-[12px] leading-snug text-ink placeholder:text-faint" />
      {!drafts.length && <div className="text-[10px] text-faint">{t('One link, or several lines of “link date”.')}</div>}
      {one && (
        <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-dim">
          <span>{t('Kind')}:</span>{kindSelect(one)}
          {one.url && one.kindFrom === 'link' && !((one.url ?? '') in kinds) && <span className="text-faint">{t('worked out from the link; change it if it is wrong')}</span>}
        </div>
      )}
      {one && !one.url && <div className="text-[10px] text-dim">{t('No link found: it will be recorded as a description, and no page can be checked.')}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-dim">{t('Published on')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!busy} className="mc-input rounded px-1.5 py-1 text-[11px] text-ink" />
        </label>
        {!list.length && <button onClick={save} disabled={!!busy} className={primary}>{saving || t('Log')}</button>}
      </div>
      {list.length > 0 && (
        <div className="rounded-md mc-chip-inset p-2 space-y-1.5">
          <div className="text-[11px] text-ink">{fill(t('Check the list before anything is saved: {n} to record.'), { n: toSave.length })}</div>
          {list.map(({ d, left }, i) => (
            <div key={i} className={`border-t border-edge pt-1 text-[10px] ${left ? 'text-faint' : 'text-dim'}`}>
              <div className={`truncate ${left ? 'line-through' : 'text-ink'}`} title={d.url ?? d.note}>{i + 1}. {d.url ? shortLink(d.url) : d.note}</div>
              {left ? <div>{t(left)}</div> : (
                <div className="flex flex-wrap items-center gap-x-1.5">
                  <span className="tabular-nums">{d.date ?? date}</span>{kindSelect(d)}
                  {!d.date && <span className="text-faint">{t('no date on this line: the date above is used')}</span>}
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button onClick={save} disabled={!!busy || !toSave.length} className={primary}>{saving || fill(t('Record {n} actions'), { n: toSave.length })}</button>
            <button onClick={() => setText('')} disabled={!!busy} className="px-2 py-1 rounded mc-chip-inset text-[11px] text-dim">{t('Cancel')}</button>
          </div>
        </div>
      )}
      {one && (
        more ? (
          <div className="rounded-md mc-chip-inset p-2 space-y-1.5">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (optional)')} className="w-full mc-input rounded px-1.5 py-1 text-[11px] text-ink" />
            {core.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[10px] text-faint">{SUGGEST_LABELS.targets[lang]}</div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {core.map((p, i) => (
                    <label key={p} className="flex items-start gap-1.5 text-[10px] text-dim">
                      <input type="checkbox" checked={picked.includes(p)} onChange={() => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))} className="mt-0.5" />
                      <span>Q{i + 1} · {p}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : <button onClick={() => setMore(true)} className="text-[10px] text-dim underline decoration-dotted underline-offset-2 hover:text-brand">+ {t('Add a note or target questions')}</button>
      )}
      {err && <div className="text-[11px] text-garnet">{err}</div>}
    </div>
  );
}

/** One logged action: what it is, then kind and publish date as quiet labels, who logged it and from where, its note, the page check and the outcome.
 *  `wide` is the stage's row, laid out across where the column has the room (576 px):
 *    line 1  the title, with kind and publish date at the right edge
 *    line 2  who logged it, the channel, the on-behalf mark and the link
 *    then    the note, if there is one
 *    below   the page check on the left, the outcome on the right, their sentences run on
 *  Narrower than that it is the rail's order, one under the other. */
function ActionRow({ iv, outcome, cited, lang, t, note, wide = false }: {
  iv: InterventionRow; outcome?: OutcomeRow; cited?: CitedAfterRow; lang: Lang; t: T; note?: 'inline' | 'above'; wide?: boolean;
}) {
  const [full, setFull] = useState(false);
  const [cut, setCut] = useState(false); // two lines do not hold the note, at the width it has now
  const noteBox = useRef<HTMLDivElement>(null);
  const said = (iv.note ?? '').trim();
  useEffect(() => {
    const el = noteBox.current;
    if (!el || full) return;
    const measure = () => setCut(el.scrollHeight > el.clientHeight + 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [said, full]);
  const kind = KIND_LABELS[iv.kind]?.[lang] ?? iv.kind;
  // The title as logged, else the page's own title, else the address; an action with neither is named by its kind.
  const title = iv.title || iv.page_title || '';
  const by = iv.logger !== undefined ? `${t('Logged by')}: ${iv.logger?.operator ? 'MemeCMO' : iv.logger?.name || t('not recorded')}` : '';
  const channel = iv.channel ? `${t('Channel')}: ${CHANNEL_LABELS[iv.channel]?.[lang] ?? iv.channel}` : '';
  const head = `${wide ? 'text-[13px]' : 'text-[12px]'} font-medium leading-snug`;
  const small = wide ? 'text-[11px]' : 'text-[10px]';
  const name = title ? <div className={`${head} text-ink`}>{title}</div>
    : iv.url ? <a href={iv.url} target="_blank" rel="noreferrer" title={iv.url} className={`block ${head} text-brand break-all ${wide ? '@xl:truncate' : ''}`}>{shortLink(iv.url)}</a>
    : <div className={`${head} text-ink`}>{kind}</div>;
  const labels = <>{title || iv.url ? `${kind} · ` : ''}<span className="whitespace-nowrap">{fill(t('published {date}'), { date: iv.published_at })}</span></>;
  const who = (by || channel) && <>{by && <span className="min-w-0 break-words">{by}</span>}<span className="whitespace-nowrap">{channel}</span></>;
  const behalf = said && ON_BEHALF.test(said.normalize('NFC')) && (
    <span className={`inline-block ${small} px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30`}>{t('Entered on the client\'s behalf')}</span>
  );
  const remark = said && (
    <div className={`${small} text-dim pl-2 border-l-2 border-gold/50 break-words ${wide ? 'flex items-end gap-x-3' : ''}`}>
      <div ref={noteBox} className={`min-w-0 ${full ? '' : wide ? 'line-clamp-2 @xl:line-clamp-1' : 'line-clamp-2'}`}>{t('Note')}: {said}</div>
      {(cut || full) && <button onClick={() => setFull(!full)} aria-expanded={full} className="shrink-0 text-brand hover:underline">{full ? t('Collapse') : t('Full text')}</button>}
    </div>
  );
  const link = (cls: string) => title && iv.url && <a href={iv.url} target="_blank" rel="noreferrer" title={iv.url} className={`truncate ${small} text-brand ${cls}`}>{shortLink(iv.url)}</a>;
  if (!wide) return (
    <div className="border-t border-edge pt-1.5 space-y-0.5">
      {name}
      <div className={`${small} text-faint`}>{labels}</div>
      {who && <div className={`flex flex-wrap gap-x-2 ${small} text-faint`}>{who}</div>}
      {behalf && <div>{behalf}</div>}
      {remark}
      {link('block')}
      {iv.url && <VerifiedLine iv={iv} cited={cited} t={t} />}
      <OutcomeLine o={outcome} t={t} lang={lang} note={note} />
    </div>
  );
  return (
    <div className="border-t border-edge pt-2 space-y-0.5">
      <div className="@xl:flex @xl:items-baseline @xl:justify-between @xl:gap-x-4">
        <div className="min-w-0">{name}</div>
        <div className={`${small} text-faint @xl:shrink-0 @xl:whitespace-nowrap`}>{labels}</div>
      </div>
      {(who || behalf || (title && iv.url)) && (
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${small} text-faint`}>{who}{behalf}{link('min-w-0 flex-[1_1_12rem]')}</div>
      )}
      {remark}
      {iv.url && <VerifiedLine iv={iv} cited={cited} t={t} flow />}
      <OutcomeLine o={outcome} t={t} lang={lang} note={note} flow />
    </div>
  );
}

/** The ledger's two places, one panel. In the right rail, first card: the place
 *  to type, what was just logged, suggested actions, and the way to the list —
 *  short enough to sit on the first screen; the rows themselves are on the
 *  stage. On the stage (`whole`): the place to type on top, then every action
 *  under its publish month, at the column's full width. `typing={false}`: the
 *  stage is already showing the place to type, so the rail keeps only what
 *  waits for an answer (suggested actions). */
export function ActionsPanel({ projectId, lang, t, ledger, whole = false, typing: canType = true, onShowAll }: {
  projectId?: string; lang: Lang; t: T; ledger: Ledger; whole?: boolean; typing?: boolean; onShowAll?: () => void;
}) {
  const suggested = useSuggestions(whole ? undefined : projectId);
  const [logged, setLogged] = useState<Logged | null>(null);
  const { rows, total, rest, loadRest } = ledger;
  if (!projectId) return null;

  // What was just logged stays on top until dismissed (the list itself is by publish date); the list below leaves those rows out.
  const fresh = (r: InterventionRow) => rows.find((x) => x.id === r.id) ?? r;
  const onTop = logged ? (logged.rows.length ? logged.rows : logged.already.slice(0, 1)).map(fresh) : [];
  const pinned = new Set(onTop.map((r) => r.id));
  const below = rows.filter((r) => !pinned.has(r.id));
  const shown = whole ? below : [];

  // An engine-side change is said once. One row touched: under that row's site line. Several: once above the list, and each row points to it.
  const touched = [...onTop, ...shown].filter((r) => ledger.outcomes[r.id]?.sourceBreaks?.length);
  const where: 'inline' | 'above' = touched.length > 1 ? 'above' : 'inline';
  const breaks = Array.from(new Map(touched.flatMap((r) => ledger.outcomes[r.id]?.sourceBreaks ?? []).map((b) => [`${b.engine} ${b.from}`, b])).values());

  const row = (iv: InterventionRow) => <ActionRow key={iv.id} iv={iv} outcome={ledger.outcomes[iv.id]} cited={ledger.citedAfter[iv.id]} lang={lang} t={t} note={where} wide={whole} />;
  const count = total > 0 ? ` · ${total}${ledger.atLeast ? '+' : ''}` : '';
  const alone = logged && logged.rows.length + logged.already.length + logged.failed.length === 1;
  const said = logged && sentences([
    alone && logged.rows.length === 1 && t('Logged.'),
    !alone && logged.rows.length > 0 && fill(t('Logged: {n}.'), { n: logged.rows.length }),
    alone && logged.already.length === 1 && fill(t('This link was already logged (published {date}); nothing was added.'), { date: logged.already[0].published_at }),
    !alone && logged.already.length > 0 && fill(t('Already logged before, not added again: {n}.'), { n: logged.already.length }),
    logged.failed.length > 0 && fill(t('Not saved: {n}.'), { n: logged.failed.length }),
    logged.rows.length > 0 && t('From the next scan on, this panel compares the AI answers before and after the publish date.'),
  ]);
  const typing = <QuickAdd projectId={projectId} lang={lang} t={t} hosts={ledger.hosts} core={ledger.core} onLogged={(r) => { setLogged(r); ledger.reload(); }} />;
  const noteAbove = where === 'above' && <div className="rounded-md mc-chip-inset p-2"><MeasurementNote breaks={breaks} lang={lang} t={t} /></div>;
  const justLogged = logged && (
    <div className="rounded-md mc-chip-inset p-2 space-y-1.5" role="status">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] leading-snug text-ink">{said}</div>
        <button onClick={() => setLogged(null)} aria-label={t('Close')} className="shrink-0 px-1 text-[12px] leading-none text-faint hover:text-brand">×</button>
      </div>
      {logged.failed.map((f, i) => <div key={i} className="text-[10px] text-garnet break-all">{f.line}: {f.error}</div>)}
      {onTop.length > 0 && <div className="text-[10px] uppercase tracking-widest text-sage">{t(logged.rows.length ? 'Just logged' : 'Already logged')}</div>}
      {/* In the rail there is no list below to carry the note: it goes with the rows it is about. */}
      {!whole && noteAbove}
      {onTop.map(row)}
    </div>
  );
  const failure = ledger.failed && <div className={`${whole ? 'text-xs' : 'text-[10px]'} text-garnet`}>{t('Load failed')} · <button onClick={ledger.reload} className="underline hover:text-brand">{t('Retry')}</button></div>;

  if (!whole) {
    const waiting = <SuggestedActions projectId={projectId} lang={lang} t={t} list={suggested.list} can={suggested.can} onDone={() => { suggested.reload(); ledger.reload(); }} />;
    if (!canType) return suggested.list.length ? <div className="mc-card mc-card-sm p-3 space-y-2">{waiting}</div> : null;
    return (
      <div className="mc-card mc-card-sm p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink"><span className="shrink-0 text-brand"><Icon name="actions" size={15} /></span>{t(LOG_HERE)}</div>
        <div className="text-[11px] leading-snug text-dim">{t(WHY_LOG)}</div>
        {typing}
        {justLogged}
        {waiting}
        {failure}
        {total > 0 && (
          <button onClick={onShowAll} className="w-full mc-btn-soft text-[11px] text-dim hover:text-brand py-1.5 tabular-nums">{fill(t('See all {n} logged'), { n: `${total}${ledger.atLeast ? '+' : ''}` })} →</button>
        )}
      </div>
    );
  }

  // Every row under its publish month (the rows arrive newest first).
  const months: { month: string; rows: InterventionRow[] }[] = [];
  for (const iv of shown) {
    const month = iv.published_at.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) last.rows.push(iv); else months.push({ month, rows: [iv] });
  }
  return (
    <div className="@container space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-ink tabular-nums"><span className="text-brand"><Icon name="actions" size={16} /></span>{t(LOG_HERE)}{count}</div>
        <div className="text-[11px] leading-snug text-dim">{t(WHY_LOG)}</div>
      </div>
      <div className="mc-card p-4 space-y-2 max-w-2xl">
        {typing}
        {justLogged}
      </div>
      {failure}
      {noteAbove}
      {months.map((m) => (
        <section key={m.month} className="mc-card p-4 space-y-2.5">
          <div className="flex items-baseline justify-between text-[11px] tracking-widest text-gold tabular-nums"><span>{m.month}</span><span className="text-faint">{m.rows.length}</span></div>
          {m.rows.map(row)}
        </section>
      ))}
      {rest === 'loading' && <div className="text-[11px] text-faint tabular-nums">{t('Loading…')} {rows.length}{ledger.atLeast ? '' : `/${total}`}</div>}
      {rest === 'failed' && <div className="text-xs text-garnet tabular-nums">{t('Load failed')} ({rows.length}{ledger.atLeast ? '+' : `/${total}`}) · <button onClick={loadRest} className="underline hover:text-brand">{t('Retry')}</button></div>}
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
