'use client';

// The readable side of a deliverable sandbox. The sandbox used to show the
// agent's Markdown source in one scrolling box (literal **, #, >); this lays
// the same text out the way a person would hand it over:
//   distribution kit — one card per placement: where, what kind, how much
//     work, the copy (a row per field when the draft is a form), why this
//     site, and its own "published" button;
//   content draft — page title and meta description as rows, the article
//     typeset, the FAQ as questions and answers, the JSON-LD set apart for
//     whoever maintains the site;
//   anything else — the document typeset.
// Everything is derived from the version of the Markdown on screen
// (lib/deliverables), so Edit, Copy, refinements and asset_edits keep working
// on one source. Model text reaches the page as React children only.

import { useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { parseMarkdown, blocksText, toPlainText, type Block, type Inline } from '@/lib/deliverables/markdown';
import { splitFields, isFieldList, parseKit, matchPlacements, parseContentDoc, type Kit, type KitPlacement } from '@/lib/deliverables/layout';
import { InterventionForm, MarkPublished, useInterventions, type InterventionRow } from './actions';

export type Lang = 'en' | 'zh' | 'vi';
type T = (s: string) => string;

// Kept here rather than in the workspace dictionary: these strings belong to this view only.
const LABELS = {
  viewSource: { en: 'View source', zh: '查看源文本', vi: 'Xem bản nguồn' },
  viewLayout: { en: 'Back to layout', zh: '返回排版视图', vi: 'Về bản trình bày' },
  atAGlance: { en: 'At a glance', zh: '要点一览', vi: 'Tóm tắt nhanh' },
  copy: { en: 'Copy', zh: '复制', vi: 'Sao chép' },
  copyText: { en: 'Copy text', zh: '复制正文', vi: 'Sao chép nội dung' },
  copied: { en: 'Copied', zh: '已复制', vi: 'Đã sao chép' },
  copyFailed: { en: 'Could not copy', zh: '复制失败', vi: 'Không sao chép được' },
  tier1: { en: 'Tier 1 · National and mainstream media', zh: '第一层 · 全国性与主流媒体', vi: 'Nhóm 1 · Báo chí quốc gia và đại chúng' },
  tier1Hint: { en: 'highest authority, hardest to land', zh: '权威最高,也最难上', vi: 'uy tín cao nhất, khó đăng nhất' },
  tier2: { en: 'Tier 2 · Industry media and large platforms', zh: '第二层 · 行业媒体与大平台', vi: 'Nhóm 2 · Báo ngành và nền tảng lớn' },
  tier2Hint: { en: 'read by the trade', zh: '行业内的人在看', vi: 'người trong ngành đọc' },
  tier3: { en: 'Tier 3 · Directories and listings', zh: '第三层 · 目录与名录', vi: 'Nhóm 3 · Danh bạ và hồ sơ' },
  tier3Hint: { en: 'quick wins — start here', zh: '最容易,建议先做', vi: 'dễ làm nhất — nên bắt đầu từ đây' },
  ch_directory: { en: 'Directory listing', zh: '目录条目', vi: 'Hồ sơ danh bạ' },
  ch_industry_media: { en: 'Media article', zh: '媒体稿件', vi: 'Bài báo' },
  ch_review_site: { en: 'Review site', zh: '评测网站', vi: 'Trang đánh giá' },
  ch_social: { en: 'Social page', zh: '社交媒体主页', vi: 'Trang mạng xã hội' },
  ch_video: { en: 'Video description', zh: '视频简介', vi: 'Mô tả video' },
  ch_community: { en: 'Community', zh: '社区', vi: 'Cộng đồng' },
  ch_other: { en: 'Other', zh: '其他', vi: 'Khác' },
  ef_quick: { en: 'little work', zh: '工作量小', vi: 'ít công sức' },
  ef_medium: { en: 'some work', zh: '工作量中等', vi: 'công sức vừa phải' },
  ef_high: { en: 'a lot of work', zh: '工作量大', vi: 'nhiều công sức' },
  title: { en: 'Title', zh: '标题', vi: 'Tiêu đề' },
  text: { en: 'Text', zh: '正文', vi: 'Nội dung' },
  why: { en: 'Why this site', zh: '为什么选这里', vi: 'Vì sao chọn trang này' },
  check: { en: 'Check before sending', zh: '发送前请核对', vi: 'Kiểm tra trước khi gửi' },
  checkPage: { en: 'Check before publishing', zh: '发布前请核对', vi: 'Kiểm tra trước khi đăng' },
  briefNote: {
    en: 'A guide for taking part, not text to post: join from the brand\'s official account and share verified facts only.',
    zh: '这是参与指引,不是可直接发布的文案:请用品牌官方账号参与,只分享已核实的事实。',
    vi: 'Đây là hướng dẫn tham gia, không phải nội dung để đăng: hãy dùng tài khoản chính thức của thương hiệu và chỉ chia sẻ thông tin đã xác minh.',
  },
  notPublished: { en: 'Not published yet', zh: '尚未发布', vi: 'Chưa đăng' },
  published: { en: 'Published', zh: '已发布', vi: 'Đã đăng' },
  notLogged: { en: 'Nothing logged yet', zh: '尚未登记', vi: 'Chưa ghi nhận' },
  logged: { en: 'Logged', zh: '已登记', vi: 'Đã ghi nhận' },
  markPublished: { en: 'Mark as published', zh: '标记为已发布', vi: 'Đánh dấu đã đăng' },
  logTakingPart: { en: 'Log taking part', zh: '登记一次参与', vi: 'Ghi nhận đã tham gia' },
  logAnother: { en: 'Log another', zh: '再登记一条', vi: 'Ghi thêm' },
  publishedCount: { en: 'published', zh: '已发布', vi: 'đã đăng' },
  unmatched: {
    en: 'Logged for this kit, but it could not be tied to one placement:',
    zh: '已为这份分发包登记,但无法对应到具体哪一条投放:',
    vi: 'Đã ghi nhận cho bộ phân phối này nhưng chưa gắn được với một vị trí cụ thể:',
  },
  pageTitle: { en: 'Page title', zh: '页面标题', vi: 'Tiêu đề trang' },
  pageTitleHint: { en: 'browser tab and search result headline', zh: '浏览器标签和搜索结果的标题', vi: 'tiêu đề trên tab trình duyệt và kết quả tìm kiếm' },
  metaDescription: { en: 'Meta description', zh: '页面描述', vi: 'Mô tả trang' },
  metaHint: { en: 'the summary under the headline in search results', zh: '搜索结果标题下方的摘要', vi: 'đoạn tóm tắt dưới tiêu đề trong kết quả tìm kiếm' },
  article: { en: 'Article', zh: '文章正文', vi: 'Bài viết' },
  faq: { en: 'Questions and answers', zh: '常见问答', vi: 'Câu hỏi thường gặp' },
  schema: { en: 'Structured data (JSON-LD)', zh: '结构化数据(JSON-LD)', vi: 'Dữ liệu có cấu trúc (JSON-LD)' },
  schemaNote: {
    en: 'For whoever maintains the website: paste this block into the page\'s HTML as it is. It tells search and AI engines what is on the page; visitors never see it.',
    zh: '给网站维护人员:把这段代码原样粘贴进该页面的 HTML。它用来告诉搜索引擎和 AI 引擎页面上有什么,访客看不到。',
    vi: 'Dành cho người quản trị website: dán nguyên khối mã này vào HTML của trang. Nó cho công cụ tìm kiếm và AI biết trang có gì; khách truy cập không nhìn thấy.',
  },
  code: { en: 'Code', zh: '代码', vi: 'Mã' },
  rewrite: { en: 'Rewrite', zh: '改写', vi: 'Viết lại' },
  rewriting: { en: 'Rewriting…', zh: '改写中…', vi: 'Đang viết lại…' },
  refinePlaceholder: { en: 'e.g. "more conversational, add our pricing"', zh: '例如:"更口语,加入我们的报价"', vi: 'vd: "tự nhiên hơn, thêm báo giá của chúng tôi"' },
  versionsNote: {
    en: 'Versions live in this session; the original deliverable is unchanged. Use Edit or Copy to keep a version.',
    zh: '各版本只保存在本次会话中,原始交付物不变。要保留某个版本,请用「编辑」保存或复制。',
    vi: 'Các phiên bản chỉ lưu trong phiên này; bản gốc không thay đổi. Dùng Chỉnh sửa hoặc Sao chép để giữ lại một phiên bản.',
  },
} as const;
type LabelKey = keyof typeof LABELS;
export const dl = (lang: Lang, key: LabelKey): string => LABELS[key][lang];

// The sandbox's one-tap refinements are written in Chinese in the caller; a
// Vietnamese or English team sees (and sends) them in its own language.
const REFINE: Record<string, { en: string; vi: string }> = {
  '更口语自然': { en: 'More conversational', vi: 'Tự nhiên, gần gũi hơn' },
  '更简短': { en: 'Shorter', vi: 'Ngắn gọn hơn' },
  '加入联系方式与报价': { en: 'Add contact details and pricing', vi: 'Thêm thông tin liên hệ và báo giá' },
  '更突出竞争优势': { en: 'Stress what sets us apart', vi: 'Nhấn mạnh lợi thế cạnh tranh' },
  '更适配 AI 检索': { en: 'Easier for AI engines to pick up', vi: 'Dễ để AI truy xuất hơn' },
  '补充 FAQ schema': { en: 'Add FAQ schema', vi: 'Bổ sung FAQ schema' },
  '强化实体定义': { en: 'Sharpen the definition of who we are', vi: 'Làm rõ định nghĩa về thương hiệu' },
  '加入 NAP 信息': { en: 'Add name, address and phone', vi: 'Thêm tên, địa chỉ, điện thoại' },
  '更贴合该媒体调性': { en: 'Closer to each outlet\'s tone', vi: 'Sát giọng văn của từng kênh hơn' },
  '更突出差异化': { en: 'Stress the difference', vi: 'Nhấn mạnh điểm khác biệt' },
  '增加数据支撑': { en: 'Back it with figures', vi: 'Thêm số liệu dẫn chứng' },
  '更中立客观': { en: 'More neutral', vi: 'Trung lập, khách quan hơn' },
  '补充可靠引用': { en: 'Add reliable citations', vi: 'Bổ sung nguồn dẫn đáng tin cậy' },
  '精简篇幅': { en: 'Trim the length', vi: 'Rút gọn' },
  '强调显著性证据': { en: 'Stress the evidence of notability', vi: 'Nhấn mạnh bằng chứng về độ nổi bật' },
};
export const refineText = (lang: Lang, zh: string): string => (lang === 'zh' ? zh : REFINE[zh]?.[lang] ?? zh);

// ── Copy ─────────────────────────────────────────────────────────────────────
// Plain text always; with `el`, the typeset HTML too, so a paste into an email
// or a CMS editor keeps headings, bold and lists while a form field gets text.
async function copyOut(text: string, el?: HTMLElement | null): Promise<boolean> {
  try {
    if (el && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[class]').forEach((n) => n.removeAttribute('class'));
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([clone.innerHTML], { type: 'text/html' }),
      })]);
      return true;
    }
  } catch { /* fall through to plain text */ }
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function CopyButton({ lang, text, rich, label }: { lang: Lang; text: string; rich?: () => HTMLElement | null; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  const run = async (e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setState((await copyOut(text, rich?.())) ? 'done' : 'fail');
    setTimeout(() => setState('idle'), 1600);
  };
  return (
    <button type="button" onClick={run} className={`shrink-0 text-[10px] px-2 py-0.5 rounded mc-chip-inset transition ${state === 'done' ? 'text-sage' : state === 'fail' ? 'text-garnet' : 'text-dim hover:text-brand'}`}>
      {state === 'done' ? `✓ ${dl(lang, 'copied')}` : state === 'fail' ? dl(lang, 'copyFailed') : label ?? dl(lang, 'copy')}
    </button>
  );
}

// ── Typeset Markdown ─────────────────────────────────────────────────────────
function inlines(c: Inline[], path = ''): ReactNode[] {
  return c.map((n, i) => {
    const k = `${path}${i}`;
    if (n.t === 'text') return n.v;
    if (n.t === 'br') return <br key={k} />;
    if (n.t === 'code') return <code key={k} className="font-mono text-[0.92em] px-1 py-px rounded mc-chip-inset">{n.v}</code>;
    if (n.t === 'link') return <a key={k} href={n.href} target="_blank" rel="noreferrer noopener" className="text-brand underline underline-offset-2 break-words">{inlines(n.c, `${k}.`)}</a>;
    if (n.t === 'strong') return <strong key={k} className="font-semibold">{inlines(n.c, `${k}.`)}</strong>;
    return <em key={k}>{inlines(n.c, `${k}.`)}</em>;
  });
}

const HEADING_CLASS = ['text-[17px] leading-snug', 'text-[15px] leading-snug', 'text-[13.5px]', 'text-[13px]'];

function CodeBlock({ code, codeLang, lang }: { code: string; codeLang: string; lang: Lang }) {
  const jsonLd = /"@context"|schema\.org/.test(code);
  return (
    <details open={!jsonLd} className="group rounded-md mc-chip-inset">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-2 flex items-center gap-2 select-none">
        <span className="text-faint text-[9px] transition-transform group-open:rotate-90">▶</span>
        <span className="text-[11px] text-dim flex-1 min-w-0 truncate">{jsonLd ? dl(lang, 'schema') : `${dl(lang, 'code')}${codeLang ? ` · ${codeLang}` : ''}`}</span>
        <CopyButton lang={lang} text={code} />
      </summary>
      <pre className="text-[11px] text-dim font-mono leading-relaxed px-3 pb-3 overflow-x-auto max-h-80 overflow-y-auto">{code}</pre>
      {jsonLd && <p className="px-3 pb-3 -mt-1 text-[11px] text-faint leading-snug">{dl(lang, 'schemaNote')}</p>}
    </details>
  );
}

function Caution({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-md mc-chip-inset px-3 py-2 text-[11.5px] text-gold leading-snug space-y-1">
      {title && <div className="font-semibold">⚠ {title}</div>}
      {children}
    </div>
  );
}

function Blocks({ blocks, lang, path = '' }: { blocks: Block[]; lang: Lang; path?: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        const k = `${path}${i}`;
        if (b.t === 'para') return <p key={k}>{inlines(b.c)}</p>;
        if (b.t === 'heading') {
          const Tag = `h${Math.min(b.level, 6)}` as 'h1';
          return <Tag key={k} className={`font-semibold text-ink pt-1.5 first:pt-0 ${HEADING_CLASS[Math.min(b.level, 4) - 1]}`}>{inlines(b.c)}</Tag>;
        }
        if (b.t === 'rule') return <hr key={k} className="border-0 border-t border-edge" />;
        if (b.t === 'code') return <CodeBlock key={k} code={b.v} codeLang={b.lang} lang={lang} />;
        if (b.t === 'quote') {
          // The agents' own "⚠ REVIEW / COMPLIANCE" lines are cautions, not quotations.
          if (blocksText(b.blocks).trimStart().startsWith('⚠')) return <Caution key={k}><Blocks blocks={b.blocks} lang={lang} path={`${k}.`} /></Caution>;
          return <blockquote key={k} className="border-l-2 border-edge-strong pl-3 text-dim space-y-2"><Blocks blocks={b.blocks} lang={lang} path={`${k}.`} /></blockquote>;
        }
        if (b.t === 'table') {
          return (
            <div key={k} className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead><tr>{b.head.map((c, j) => <th key={j} className="font-semibold text-ink border-b border-edge-strong px-2 py-1 align-top">{inlines(c)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, m) => <td key={m} className="border-b border-edge px-2 py-1 align-top">{inlines(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        const task = b.items.some((it) => it.checked !== undefined);
        const items = b.items.map((it, j) => {
          const body = it.blocks.length === 1 && it.blocks[0].t === 'para' ? inlines(it.blocks[0].c) : <div className="space-y-1"><Blocks blocks={it.blocks} lang={lang} path={`${k}.${j}.`} /></div>;
          return task
            ? <li key={j} className="flex gap-2"><span className={`shrink-0 w-3.5 text-center ${it.checked ? 'text-sage' : 'text-faint'}`}>{it.checked ? '✓' : '○'}</span><div className="min-w-0">{body}</div></li>
            : <li key={j}>{body}</li>;
        });
        if (b.ordered) return <ol key={k} start={b.start} className="list-decimal pl-5 space-y-1 marker:text-faint">{items}</ol>;
        return <ul key={k} className={task ? 'space-y-1' : 'list-disc pl-5 space-y-1 marker:text-faint'}>{items}</ul>;
      })}
    </>
  );
}

/** Markdown from an agent (or a person's edit of it), typeset. */
export function Typeset({ source, lang, size = 'md' }: { source: string; lang: Lang; size?: 'md' | 'sm' }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`${size === 'sm' ? 'text-[12px] text-dim leading-snug space-y-1.5' : 'text-[13px] text-ink leading-relaxed space-y-2.5'} break-words`}>
      <Blocks blocks={blocks} lang={lang} />
    </div>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────
function Row({ label, hint, copy, lang, children }: { label: string; hint?: string; copy?: string; lang: Lang; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 items-start py-2 border-t border-edge first:border-t-0">
      <div className="col-span-2 sm:col-span-1 text-[11px] text-faint leading-snug sm:pt-0.5 break-words">
        {label}
        {hint && <div className="text-[10px] leading-snug mt-0.5">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
      {copy ? <CopyButton lang={lang} text={copy} /> : <span />}
    </div>
  );
}

const SectionHead = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] uppercase tracking-widest text-faint flex-1 min-w-0">{children}</span>
    {right}
  </div>
);

// ── Distribution kit ─────────────────────────────────────────────────────────
const TIER_COLOR: Record<number, string> = { 1: 'text-garnet', 2: 'text-gold', 3: 'text-sage' };

function PlacementCard({ p, actions, projectId, runId, lang, t, onLogged }: {
  p: KitPlacement; actions: InterventionRow[]; projectId?: string; runId?: string; lang: Lang; t: T; onLogged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const prose = useRef<HTMLDivElement>(null);
  const segs = useMemo(() => splitFields(p.draft), [p.draft]);
  const form = isFieldList(segs);
  const canLog = !!projectId && !!runId;
  const done = actions[0];
  const channel = p.channelType ? (LABELS[`ch_${p.channelType}` as LabelKey]?.[lang] ?? p.channelType.replace(/_/g, ' ')) : '';
  const effort = !p.brief && p.effort ? LABELS[`ef_${p.effort}` as LabelKey]?.[lang] ?? '' : '';
  return (
    <div className="mc-card mc-card-sm p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold text-ink break-all">{p.site}</span>
        {channel && <span className="text-[10px] px-1.5 py-0.5 rounded mc-chip-inset text-dim">{channel}</span>}
        {effort && <span className="text-[10px] text-faint">{effort}</span>}
        {canLog && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full mc-chip-inset ${done ? 'text-sage' : 'text-faint'}`}>
            {done ? `✓ ${dl(lang, p.brief ? 'logged' : 'published')} · ${done.published_at}${actions.length > 1 ? ` (+${actions.length - 1})` : ''}` : dl(lang, p.brief ? 'notLogged' : 'notPublished')}
          </span>
        )}
      </div>
      {p.brief && <p className="text-[11px] text-dim leading-snug">{dl(lang, 'briefNote')}</p>}

      <div>
        {p.title && <Row label={dl(lang, 'title')} copy={p.title} lang={lang}><div className="text-[13px] font-medium text-ink leading-snug break-words">{p.title}</div></Row>}
        {form ? segs.map((s, i) => (
          <Row key={i} label={s.label ?? ''} copy={toPlainText(s.value)} lang={lang}><Typeset source={s.value} lang={lang} /></Row>
        )) : p.draft && (
          <div className="border-t border-edge first:border-t-0 pt-2 space-y-1.5">
            <SectionHead right={<CopyButton lang={lang} text={toPlainText(p.draft)} rich={() => prose.current} label={dl(lang, 'copyText')} />}>{dl(lang, 'text')}</SectionHead>
            <div ref={prose}><Typeset source={p.draft} lang={lang} /></div>
          </div>
        )}
      </div>

      {p.flags.length > 0 && <Caution title={dl(lang, 'check')}>{p.flags.map((f, i) => <div key={i}>{f}</div>)}</Caution>}
      {p.why && <p className="text-[11px] text-faint leading-snug"><span className="text-dim">{dl(lang, 'why')}:</span> {p.why}</p>}

      {canLog && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-edge">
          {done?.url && <a href={done.url} target="_blank" rel="noreferrer noopener" className="text-[11px] text-brand break-all">{done.domain ?? done.url}</a>}
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className={`ml-auto text-[11px] px-2.5 py-1 rounded transition ${done ? 'mc-chip-inset text-dim hover:text-brand' : 'border border-brand/50 text-brand hover:brightness-110'}`}>
              {done ? dl(lang, 'logAnother') : dl(lang, p.brief ? 'logTakingPart' : 'markPublished')}
            </button>
          )}
          {open && (
            <div className="basis-full">
              <InterventionForm projectId={projectId!} lang={lang} t={t}
                preset={{ kind: p.channelType === 'directory' ? 'directory_profile' : 'third_party_placement', title: p.title || p.site, sourceRunId: runId, sourceAssetType: 'distribution_kit' }}
                onDone={() => { setOpen(false); onLogged(); }} onCancel={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KitView({ kit, projectId, runId, lang, t }: { kit: Kit; projectId?: string; runId?: string; lang: Lang; t: T }) {
  const { list, reload } = useInterventions(runId ? projectId : undefined, { sourceRunId: runId });
  const { matched, unmatched } = useMemo(() => matchPlacements(kit.placements, list), [kit, list]);
  const tiers = Array.from(new Set(kit.placements.map((p) => p.tier))).sort((a, b) => a - b);
  const doneCount = matched.filter((a) => a.length).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {kit.intro && <div className="flex-1 min-w-0 text-faint"><Typeset source={kit.intro} lang={lang} size="sm" /></div>}
        {projectId && runId && <span className="ml-auto text-[11px] text-dim tabular-nums">{doneCount} / {kit.placements.length} {dl(lang, 'publishedCount')}</span>}
      </div>
      {tiers.map((tier) => (
        <section key={tier} className="space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={`text-[11px] font-semibold tracking-wide ${TIER_COLOR[tier] ?? 'text-dim'}`}>{LABELS[`tier${tier}` as LabelKey]?.[lang] ?? `Tier ${tier}`}</span>
            <span className="text-[10px] text-faint">{LABELS[`tier${tier}Hint` as LabelKey]?.[lang] ?? ''}</span>
          </div>
          {kit.placements.filter((p) => p.tier === tier).map((p) => (
            <PlacementCard key={p.index} p={p} actions={matched[p.index]} projectId={projectId} runId={runId} lang={lang} t={t} onLogged={reload} />
          ))}
        </section>
      ))}
      {unmatched.length > 0 && (
        <div className="rounded-md mc-chip-inset px-3 py-2 text-[11px] text-dim space-y-0.5">
          <div>{dl(lang, 'unmatched')}</div>
          {unmatched.map((a) => <div key={a.id} className="text-faint">{a.published_at} · {a.title || a.domain || a.url || a.kind}</div>)}
        </div>
      )}
    </div>
  );
}

// ── Content draft ────────────────────────────────────────────────────────────
function ContentDocView({ source, output, lang }: { source: string; output: Record<string, any>; lang: Lang }) {
  const doc = useMemo(() => {
    const d = parseContentDoc(source);
    // A run stored without the assembled page (article only): its FAQ and schema
    // are still in the output. Never for an edited version — the text decides there.
    if (d && !output?.fullMarkdown && source === output?.articleMarkdown) {
      if (Array.isArray(output.faq)) d.faq = output.faq.map((f: any) => ({ question: String(f?.question ?? ''), answer: String(f?.answer ?? '') }));
      if (output.schemaJsonLd) d.schema = JSON.stringify(output.schemaJsonLd, null, 2);
    }
    return d;
  }, [source, output]);
  const article = useRef<HTMLDivElement>(null);
  const meta: string | undefined = output?.metaDescription;
  if (!doc) return <div className="mc-chip-inset rounded-md p-4"><Typeset source={source} lang={lang} /></div>;
  const faqText = doc.faq.map((f) => `${f.question}\n${toPlainText(f.answer)}`).join('\n\n');
  return (
    <div className="space-y-4">
      {doc.notes.length > 0 && <Caution title={dl(lang, 'checkPage')}>{doc.notes.map((n, i) => <div key={i}>{n}</div>)}</Caution>}
      <div className="mc-chip-inset rounded-md px-3.5">
        <Row label={dl(lang, 'pageTitle')} hint={dl(lang, 'pageTitleHint')} copy={doc.title} lang={lang}><div className="text-[14px] font-semibold text-ink leading-snug break-words">{doc.title}</div></Row>
        {meta && <Row label={dl(lang, 'metaDescription')} hint={dl(lang, 'metaHint')} copy={meta} lang={lang}><div className="text-[13px] text-ink leading-relaxed break-words">{meta}</div></Row>}
      </div>
      {doc.article && (
        <section className="space-y-2">
          <SectionHead right={<CopyButton lang={lang} text={toPlainText(doc.article)} rich={() => article.current} />}>{dl(lang, 'article')}</SectionHead>
          <div ref={article} className="mc-chip-inset rounded-md p-4"><Typeset source={doc.article} lang={lang} /></div>
        </section>
      )}
      {doc.faq.length > 0 && (
        <section className="space-y-2">
          <SectionHead right={<CopyButton lang={lang} text={faqText} />}>{dl(lang, 'faq')} · {doc.faq.length}</SectionHead>
          <dl className="mc-chip-inset rounded-md px-4 py-1">
            {doc.faq.map((f, i) => (
              <div key={i} className="py-2.5 border-t border-edge first:border-t-0 space-y-1">
                <dt className="text-[13px] font-semibold text-ink leading-snug">{f.question}</dt>
                <dd><Typeset source={f.answer} lang={lang} /></dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {doc.schema && <CodeBlock code={doc.schema} codeLang="json" lang={lang} />}
    </div>
  );
}

/** The default, readable view of one version of a deliverable. */
export function DeliverableBody({ artifactType, source, output, projectId, runId, lang, t }: {
  artifactType: string; source: string; output: Record<string, any>; projectId?: string; runId?: string; lang: Lang; t: T;
}) {
  const kit = useMemo(() => (artifactType === 'distribution_kit' ? parseKit(source, Array.isArray(output?.targets) ? output.targets : []) : null), [artifactType, source, output]);
  if (kit) return <KitView kit={kit} projectId={projectId} runId={runId} lang={lang} t={t} />;
  if (artifactType === 'content_draft') return <ContentDocView source={source} output={output} lang={lang} />;
  return (
    <div className="space-y-2">
      <div className="mc-chip-inset rounded-md p-4"><Typeset source={source} lang={lang} /></div>
      {/* A kit rewritten out of its per-site sections can still be logged as a whole. */}
      {artifactType === 'distribution_kit' && <div className="flex justify-end"><MarkPublished projectId={projectId} runId={runId} artifactType={artifactType} lang={lang} t={t} /></div>}
    </div>
  );
}
