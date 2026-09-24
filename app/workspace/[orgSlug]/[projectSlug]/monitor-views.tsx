'use client';

// Monitor dashboard views — same definitions as the measurement standard
// (v1.0 §1), presented the way a reader asks questions (layout adopted from
// the Javvo/Olivia spec 2026-09): which brands are visible → how the share
// splits → where each engine differs → which sources the engines lean on →
// which buyer questions the brand is missing from → and, for every cell, the
// actual answer behind the number.
//
// Everything here is derived client-side from the scan's own rawSamples, so
// each figure carries its fraction and each cell can be traced to an answer.
// Vocabulary is MemeCMO's (presence / share of voice / citation) — never the
// partner site's "citation rate = named".

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ScanPoint } from '@/lib/trend';

type Lang = 'en' | 'zh' | 'vi';
type T = (s: string) => string;

interface Sample {
  engine: string; stage: string; intent: string; prompt: string; key: boolean;
  brandPresent: boolean; prominence: number; sentiment: string; competitorsPresent: string[];
  citations: string[]; brandCited: boolean; snippet: string;
}
interface Bench { name: string; hits: number; sovPct: number; isBrand: boolean }

const TIP: Record<string, Record<Lang, string>> = {
  trend: {
    en: 'Presence rate of your brand and the four most-present competitors across comparable scans (same panel and engine set; diagnostic scans excluded). Each point = answers naming the brand ÷ all answers in that scan.',
    zh: '本品牌与出现率最高的四个竞品在各次可比扫描中的出现率(同一题库、同一引擎组合;诊断扫描不计)。每个点 = 该次扫描中提及品牌的回答数 ÷ 全部回答数。',
    vi: 'Tỷ lệ xuất hiện của thương hiệu bạn và bốn đối thủ xuất hiện nhiều nhất qua các lần quét so sánh được (cùng bộ câu hỏi và engine; không tính quét chẩn đoán). Mỗi điểm = số câu trả lời nhắc thương hiệu ÷ tổng câu trả lời của lần quét đó.',
  },
  profile: {
    en: 'Measured on the cited pages our fetcher has read: share with schema.org markup, with an FAQ block, updated within 6 months; median length; share that are the brand\'s own pages. "Cited 3+ times" vs "once or twice" shows what the engines keep coming back to. Needs at least 8 read pages per engine.',
    zh: '在抓取器已读取的被引页面上实测:带 schema.org 标记的比例、含 FAQ 区块的比例、6 个月内更新的比例;中位篇幅;品牌自有页面占比。「被引 3 次以上」对比「1–2 次」显示引擎反复回到什么样的页面。每个引擎至少需要 8 个已读页面。',
    vi: 'Đo trên các trang được trích dẫn mà bộ lấy trang đã đọc: tỷ lệ có schema.org, có mục FAQ, cập nhật trong 6 tháng; độ dài trung vị; tỷ lệ trang của chính thương hiệu. "Trích ≥3 lần" so với "1–2 lần" cho thấy engine hay quay lại kiểu trang nào. Cần ít nhất 8 trang đã đọc mỗi engine.',
  },
  visibility: {
    en: 'Presence rate = answers naming the brand ÷ all answers (one answer can name several brands, so rows are not additive). Share of voice = the brand\'s mentions ÷ all tracked-brand mentions (sums to 100%). Sentiment and top-of-mind are judged for your brand only.',
    zh: '出现率 = 提及该品牌的回答数 ÷ 全部回答数(一条回答可提及多个品牌,各行不可相加)。声量份额 = 该品牌被提及次数 ÷ 全部被追踪品牌提及次数(合计 100%)。情感与首位推荐仅对本品牌评判。',
    vi: 'Tỷ lệ xuất hiện = số câu trả lời nhắc thương hiệu ÷ tổng số câu trả lời (một câu có thể nhắc nhiều thương hiệu nên các dòng không cộng dồn). Thị phần tiếng nói = số lần nhắc thương hiệu ÷ tổng số lần nhắc mọi thương hiệu được theo dõi (tổng 100%). Cảm xúc và đề xuất đầu tiên chỉ chấm cho thương hiệu của bạn.',
  },
  sov: {
    en: 'Share of voice — each brand\'s mentions ÷ all tracked-brand mentions in this scan. Only tracked competitors enter the denominator; partners, directories and your own entities do not.',
    zh: '声量份额 —— 本次扫描中各品牌被提及次数 ÷ 全部被追踪品牌提及次数。只有追踪的竞争者进入分母;合作伙伴、目录与自有实体不进入。',
    vi: 'Thị phần tiếng nói — số lần nhắc mỗi thương hiệu ÷ tổng số lần nhắc mọi thương hiệu được theo dõi trong lần quét này. Chỉ đối thủ được theo dõi vào mẫu số.',
  },
  byEngine: {
    en: 'Presence rate on each engine for your brand and the four most-present competitors: answers naming the brand ÷ answers on that engine. The same brand often differs sharply between engines.',
    zh: '你的品牌与出现率最高的四个竞争者在各引擎上的出现率:提及该品牌的回答数 ÷ 该引擎的回答数。同一品牌在不同引擎上的差距往往很大。',
    vi: 'Tỷ lệ xuất hiện trên từng engine của thương hiệu bạn và bốn đối thủ xuất hiện nhiều nhất: số câu trả lời nhắc thương hiệu ÷ số câu trả lời trên engine đó. Cùng một thương hiệu thường chênh lệch lớn giữa các engine.',
  },
  sources: {
    en: 'Domains the engines cited as sources. This scan = answers citing the domain ÷ all answers (an answer citing three pages of one site counts once). All scans = answers citing it across every scan of this project. Pages = cited pages we have read ÷ cited pages; schema = share with schema.org markup; FAQ = pages with an FAQ block; the date is the newest published/updated date found. Where AI looks for answers decides where you need to appear.',
    zh: '引擎引用为信源的域名。本次扫描 = 引用该域名的回答数 ÷ 全部回答数(一条回答引用同一网站多个页面只计一次)。全部扫描 = 本项目所有扫描中引用该域名的回答数。页面 = 已读取的被引页面 ÷ 被引页面;schema = 带 schema.org 标记的比例;FAQ = 含常见问题区块的页面数;日期为最新的发布/更新日期。AI 依赖哪几个网站,决定了你该在哪里出现。',
    vi: 'Các tên miền engine trích dẫn làm nguồn. Lần quét này = số câu trả lời trích dẫn tên miền ÷ tổng câu trả lời (một câu trích ba trang của cùng một site chỉ tính một). Mọi lần quét = số câu trả lời trích dẫn nó qua mọi lần quét của dự án. Trang = trang được trích đã đọc ÷ trang được trích; schema = tỷ lệ có đánh dấu schema.org; FAQ = số trang có mục hỏi đáp; ngày là ngày xuất bản/cập nhật mới nhất. AI tìm câu trả lời ở đâu quyết định bạn cần xuất hiện ở đó.',
  },
  byPrompt: {
    en: 'For every buyer question, whether each engine named the brand (● featured · ◐ listed · ○ passing · — absent). Click a cell to read the answer behind it. Questions you are absent from are listed first.',
    zh: '每道买家问题上各引擎是否提到品牌(● 重点推荐 · ◐ 多个选项之一 · ○ 顺带提及 · — 未出现)。点击单元格查看背后的回答。你缺席的问题排在最前。',
    vi: 'Với mỗi câu hỏi của người mua, từng engine có nhắc thương hiệu hay không (● nổi bật · ◐ một trong nhiều · ○ thoáng qua · — vắng mặt). Nhấp vào ô để đọc câu trả lời. Các câu bạn vắng mặt xếp trước.',
  },
};

// Competitor series colours: distinct hues inside the VI (globals.css --cat-*); the brand's own series is always gold.
const CAT = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];
const catOf = (i: number) => CAT[i % CAT.length];

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

function Tip({ text, children }: { text: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}<span title={text} className="cursor-help text-[10px] text-faint mc-chip-inset rounded-full w-3.5 h-3.5 inline-flex items-center justify-center">?</span></span>;
}
function Title({ children, tip }: { children: ReactNode; tip?: string }) {
  return <div className="text-[10px] uppercase tracking-widest text-faint mb-1.5">{tip ? <Tip text={tip}>{children}</Tip> : children}</div>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl mc-chip-inset shadow-xl max-w-4xl w-full max-h-[85vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><div className="text-sm font-semibold text-ink">{title}</div><button onClick={onClose} className="text-[11px] px-2 py-0.5 rounded mc-chip-inset text-dim">✕</button></div>
        {children}
      </div>
    </div>
  );
}
function useSort<Row>(rows: Row[], initial: { key: string; dir: 'asc' | 'desc' }, get: (r: Row, k: string) => number | string) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => [...rows].sort((a, b) => { const x = get(a, sort.key), y = get(b, sort.key); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return sort.dir === 'asc' ? c : -c; }), [rows, sort, get]);
  const th = (key: string, label: ReactNode, cls = '') => (
    <th className={`px-2 py-1.5 text-[10px] uppercase tracking-wider text-faint font-medium cursor-pointer select-none whitespace-nowrap ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
      {label} <span className={sort.key === key ? 'text-brand' : 'text-faint/50'}>{sort.key === key && sort.dir === 'asc' ? '▲' : '▼'}</span>
    </th>
  );
  return { sorted, th };
}

// ── 1. Brand visibility table + share-of-voice donut ─────────────────────────
function BrandVisibility({ bench, nAnswers, totalMentions, brandRow, partners, lang, t }: { bench: Bench[]; nAnswers: number; totalMentions: number; brandRow: { sentiment?: number; topOfMind?: number; citation?: number }; partners: { name: string; relationship: string }[]; lang: Lang; t: T }) {
  const rows = bench.map((b) => ({ ...b, share: pct(b.hits, totalMentions) }));
  const get = (r: any, k: string) => (k === 'name' ? r.name : k === 'hits' ? r.hits : k === 'presence' ? r.sovPct : r.share);
  const { sorted, th } = useSort(rows, { key: 'presence', dir: 'desc' }, get);
  const [all, setAll] = useState(false);
  const table = (list: any[]) => (
    <table className="w-full text-[11px]">
      <thead><tr className="border-b border-edge">
        <th className="px-2 py-1.5 text-[10px] text-faint font-medium text-left">#</th>
        {th('name', t('Brand'), 'text-left')}{th('hits', t('Mentions'), 'text-right')}{th('presence', t('Presence rate'), 'text-right')}{th('share', t('Share of Voice'), 'text-right')}
        <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-faint font-medium text-right">{t('Sentiment')}</th>
        <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-faint font-medium text-right">{t('Top-of-mind')}</th>
      </tr></thead>
      <tbody>
        {list.map((r, i) => (
          <tr key={r.name} className={`border-b border-edge/60 ${r.isBrand ? 'bg-gold/10' : ''}`}>
            <td className="px-2 py-1.5 text-faint tabular-nums">{i + 1}</td>
            <td className={`px-2 py-1.5 ${r.isBrand ? 'text-gold font-semibold' : 'text-ink'}`}>{r.isBrand && '★ '}{r.name}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-dim">{r.hits}<span className="text-faint">/{nAnswers}</span></td>
            <td className="px-2 py-1.5 text-right tabular-nums text-ink font-medium">{r.sovPct}%</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-ink">{r.share}%</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-dim">{r.isBrand && brandRow.sentiment != null ? Math.round(brandRow.sentiment) : '—'}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-dim">{r.isBrand && brandRow.topOfMind != null ? `${brandRow.topOfMind}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div>
      <Title tip={TIP.visibility[lang]}>{t('Brand visibility')}</Title>
      <div className="overflow-x-auto mc-card mc-card-sm">{table(sorted.slice(0, 6))}</div>
      {sorted.length > 6 && <button onClick={() => setAll(true)} className="mt-1 text-[10px] text-faint hover:text-brand underline decoration-dotted">{t('Show all')} · {sorted.length}</button>}
      {all && <Modal title={`${t('Brand visibility')} · ${sorted.length}`} onClose={() => setAll(false)}>{table(sorted)}</Modal>}
      <div className="text-[10px] text-faint mt-1">{t('Presence rates are per answer and do not add up; share of voice does.')} · {nAnswers} {t('answers')} · {totalMentions} {t('brand mentions')}</div>
      {partners.length > 0 && <div className="text-[10px] text-faint mt-0.5">{t('Not counted in SoV')}: {partners.map((p) => `${p.name} (${t(p.relationship)})`).join(' · ')}</div>}
    </div>
  );
}

function SovBar({ bench, totalMentions, lang, t }: { bench: Bench[]; totalMentions: number; lang: Lang; t: T }) {
  // One 100%-stacked bar, not a ring: the AIGVR gauge above is already a ring
  // and two rings with a big number inside read as the same thing.
  const top = [...bench].sort((a, b) => b.hits - a.hits);
  const shown = top.slice(0, 6); const rest = top.slice(6).reduce((a, b) => a + b.hits, 0);
  const segs = [...shown.map((b) => ({ name: b.name, v: b.hits, brand: b.isBrand })), ...(rest ? [{ name: t('Others'), v: rest, brand: false }] : [])];
  const shade = (i: number) => 1 - Math.min(i, 6) * 0.14;
  return (
    <div>
      <Title tip={TIP.sov[lang]}>{t('Share of Voice')}</Title>
      <div className="mc-card mc-card-sm p-3">
        <div className="flex h-4 w-full mc-track">
          {segs.map((s, i) => <div key={i} title={`${s.name} · ${pct(s.v, totalMentions)}% · ${s.v}/${totalMentions}`} style={{ width: `${totalMentions ? (100 * s.v) / totalMentions : 0}%`, background: s.brand ? 'var(--gold)' : s.name === t('Others') ? 'var(--faint)' : catOf(segs.slice(0, i).filter((x) => !x.brand).length) }} />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {segs.map((s, i) => <span key={i} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.brand ? 'var(--gold)' : s.name === t('Others') ? 'var(--faint)' : catOf(segs.slice(0, i).filter((x) => !x.brand).length) }} /><span className={s.brand ? 'text-gold font-semibold' : 'text-dim'}>{s.brand && '★ '}{s.name}</span><span className="tabular-nums text-ink">{pct(s.v, totalMentions)}%</span><span className="tabular-nums text-faint">{s.v}/{totalMentions}</span></span>)}
        </div>
        <div className="text-[10px] text-faint mt-1.5">{t('Share of voice, this scan')} · {totalMentions} {t('brand mentions')}</div>
      </div>
    </div>
  );
}

// ── 1b. Presence over time — brand bold, top-4 competitors thin ─────────────
function PresenceTrend({ history, brandName, bench, engineView, lang, t }: { history: ScanPoint[]; brandName: string; bench: Bench[]; engineView: string | null; lang: Lang; t: T }) {
  const pts = history.filter((p) => p.presence != null);
  if (!pts.length) return null;
  const comps = engineView ? [] : bench.filter((b) => !b.isBrand).sort((a, b) => b.hits - a.hits).slice(0, 4).map((b) => b.name);
  const brandSeries = pts.map((p) => (engineView ? p.perEngine?.find((e) => e.engine === engineView)?.presence ?? null : p.presence));
  const brandFrac = pts.map((p) => (engineView ? (() => { const e = p.perEngine?.find((x) => x.engine === engineView); return e ? `${e.brandHits}/${e.queries}` : ''; })() : p.queries ? `${Math.round(((p.presence ?? 0) * p.queries) / 100)}/${p.queries}` : ''));
  const compSeries = comps.map((name) => pts.map((p) => p.bench?.find((b) => b.name === name)?.presence ?? null));
  const W = 640, H = 170, L = 30, R = 10, T = 10, B = 22;
  const x = (i: number) => (pts.length === 1 ? W / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const y = (v: number) => T + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - T - B);
  const path = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? '' : `${i && vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(' ');
  const date = (ts: string) => ts.slice(5, 10);
  const labelEvery = Math.max(1, Math.ceil(pts.length / 8));
  const last = pts[pts.length - 1], prev = pts.length >= 2 ? pts[pts.length - 2] : null;
  const dBrand = prev ? (brandSeries[pts.length - 1] ?? 0) - (brandSeries[pts.length - 2] ?? 0) : null;
  const movers = comps.map((name, i) => ({ name, d: prev ? (compSeries[i][pts.length - 1] ?? 0) - (compSeries[i][pts.length - 2] ?? 0) : 0 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const mover = movers[0] && movers[0].d !== 0 ? movers[0] : null;
  const arrow = (d: number) => (d > 0 ? '▲' : d < 0 ? '▼' : '–');
  const tone = (d: number, goodUp = true) => (d === 0 ? 'text-faint' : (d > 0) === goodUp ? 'text-sage' : 'text-garnet');
  return (
    <div>
      <Title tip={TIP.trend[lang]}>{t('Presence over time')}{engineView ? ` · ${engineView}` : ''} · {pts.length} {t('scans')}</Title>
      <div className="mc-card mc-card-sm p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: 'auto' }}>
          {[0, 25, 50, 75, 100].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--edge)" strokeWidth={1} /><text x={L - 4} y={y(g) + 3} textAnchor="end" fill="var(--faint)" style={{ fontSize: 9 }}>{g}%</text></g>)}
          {compSeries.map((vals, i) => <path key={i} d={path(vals)} fill="none" stroke={catOf(i)} strokeOpacity={0.9} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />)}
          {pts.length > 1 && <path d={path(brandSeries)} fill="none" stroke="var(--gold)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
          {compSeries.map((vals, ci) => vals.map((v, i) => v == null ? null : <circle key={`${ci}-${i}`} cx={x(i)} cy={y(v)} r={2.5} fill={catOf(ci)}><title>{`${date(pts[i].ts)} · ${comps[ci]} · ${v}%`}</title></circle>))}
          {brandSeries.map((v, i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === pts.length - 1 ? 3.5 : 2.5} fill="var(--gold)"><title>{`${date(pts[i].ts)} · ${brandName} · ${v}%${brandFrac[i] ? ` (${brandFrac[i]})` : ''}`}</title></circle>)}
          {pts.map((p, i) => (i % labelEvery === 0 || i === pts.length - 1) ? <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fill="var(--faint)" style={{ fontSize: 9 }}>{date(p.ts)}</text> : null)}
        </svg>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 bg-gold inline-block" />★ {brandName}</span>
          {comps.map((c, i) => <span key={c} className="inline-flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: catOf(i) }} />{c}</span>)}
          {engineView && <span>{t('Engine view shows your brand only; competitor lines are whole-scan.')}</span>}
          <span className="ml-auto">
            {prev && dBrand != null ? <><span className={tone(dBrand)}>{arrow(dBrand)} {Math.abs(Math.round(dBrand))}%</span> {t('vs previous scan')}{mover ? <> · {t('biggest mover')}: {mover.name} <span className={tone(mover.d, false)}>{arrow(mover.d)} {Math.abs(Math.round(mover.d))}%</span></> : null}</> : t('Run another scan to track change.')}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 2. Presence by engine — brand + top-4 competitors ────────────────────────
function PresenceByEngine({ samples, engines, brandName, bench, lang, t }: { samples: Sample[]; engines: string[]; brandName: string; bench: Bench[]; lang: Lang; t: T }) {
  const comps = bench.filter((b) => !b.isBrand).sort((a, b) => b.hits - a.hits).slice(0, 4).map((b) => b.name);
  const names = [brandName, ...comps];
  const cell = (engine: string, name: string) => {
    const es = samples.filter((s) => s.engine === engine);
    const n = name === brandName ? es.filter((s) => s.brandPresent).length : es.filter((s) => (s.competitorsPresent ?? []).includes(name)).length;
    return { n, d: es.length };
  };
  return (
    <div>
      <Title tip={TIP.byEngine[lang]}>{t('Presence by engine')}</Title>
      <div className="mc-card mc-card-sm p-3 overflow-x-auto">
        <div className="flex gap-4 min-w-[560px]">
          {engines.map((eng) => (
            <div key={eng} className="flex-1 min-w-0">
              <div className="flex items-end gap-1 h-28">
                {names.map((name, i) => { const c = cell(eng, name); const p = pct(c.n, c.d); return (
                  <div key={name} className="flex-1 flex flex-col items-center justify-end min-w-0" title={`${name} · ${eng}: ${c.n}/${c.d}`}>
                    <div className="text-[9px] tabular-nums text-dim">{p}%</div>
                    <div className={`w-full rounded-t ${i === 0 ? 'bg-gold' : ''}`} style={{ height: `${Math.max(2, p)}px`, background: i === 0 ? undefined : catOf(i - 1) }} />
                  </div>); })}
              </div>
              <div className="text-[10px] text-faint text-center mt-1 truncate">{eng}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-faint mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
          {names.map((n, i) => <span key={n} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${i === 0 ? 'bg-gold' : ''}`} style={{ background: i === 0 ? undefined : catOf(i - 1) }} />{i === 0 ? `★ ${n}` : n}</span>)}
          <span className="ml-auto">{t('vs top 4 brands')}</span>
        </div>
      </div>
    </div>
  );
}

// ── 3. Sources the engines cite ─────────────────────────────────────────────
type DomainPages = { domain: string; pages: number; fetched: number; schemaPages: number; faqPages: number; datedPages: number; lastModified: string | null; avgWords: number | null; blocked: number };

function PagesCell({ p, t }: { p?: DomainPages; t: T }) {
  if (!p || !p.pages) return <span className="text-faint">—</span>;
  if (!p.fetched) return <span className="text-faint" title={p.blocked ? 'robots.txt' : t('not read yet')}>{p.blocked ? `robots ${p.blocked}/${p.pages}` : `0/${p.pages}`}</span>;
  const bits: string[] = [];
  bits.push(`schema ${pct(p.schemaPages, p.fetched)}%`);
  if (p.faqPages) bits.push(`FAQ ${p.faqPages}`);
  if (p.lastModified) bits.push(`${t('updated')} ${String(p.lastModified).slice(0, 7)}`);
  const tip = `${p.fetched}/${p.pages} ${t('read')} · schema ${p.schemaPages} · FAQ ${p.faqPages} · ${t('dated')} ${p.datedPages}${p.avgWords ? ` · ~${p.avgWords} ${t('words')}` : ''}${p.blocked ? ` · robots ${p.blocked}` : ''}`;
  return <span title={tip}><span className="text-ink tabular-nums">{p.fetched}/{p.pages}</span><span className="text-faint"> · {bits.join(' · ')}</span></span>;
}

function CitationSources({ samples, ranking, pages, lang, t }: { samples: Sample[]; ranking: { domain: string; citations: number; answers?: number; engines: number; isBrand: boolean }[]; pages: Map<string, DomainPages>; lang: Lang; t: T }) {
  // Unit = answers citing the domain (the standard's citation unit), never raw
  // URL counts: one answer citing three pages of a site is one answer.
  const cum = new Map(ranking.map((r) => [r.domain, r]));
  const hasCumAnswers = ranking.some((r) => typeof r.answers === 'number');
  const thisScan = new Map<string, { n: number; engines: Set<string> }>();
  for (const s of samples) {
    const doms = new Set((s.citations ?? []).map(domainOf).filter(Boolean));
    for (const d of doms) { const e = thisScan.get(d) ?? { n: 0, engines: new Set() }; e.n++; e.engines.add(s.engine); thisScan.set(d, e); }
  }
  const N = samples.length;
  const rows = [...thisScan.entries()].map(([domain, e]) => { const c = cum.get(domain); return { domain, n: e.n, engines: e.engines.size, cum: c ? (typeof c.answers === 'number' ? Math.max(c.answers, e.n) : c.citations) : e.n, isBrand: !!c?.isBrand }; });
  const get = (r: any, k: string) => (k === 'domain' ? r.domain : k === 'n' ? r.n : k === 'engines' ? r.engines : r.cum);
  const { sorted, th } = useSort(rows, { key: 'n', dir: 'desc' }, get);
  const [all, setAll] = useState(false);
  const table = (list: any[]) => (
    <table className="w-full text-[11px]">
      <thead><tr className="border-b border-edge"><th className="px-2 py-1.5 text-[10px] text-faint font-medium text-left">#</th>{th('domain', t('Domain'), 'text-left')}<th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-faint font-medium text-left">{t('Type')}</th>{th('n', t('This scan'), 'text-right')}{th('engines', t('Engines'), 'text-right')}{th('cum', hasCumAnswers ? t('All scans') : `${t('All scans')} · URL`, 'text-right')}<th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-faint font-medium text-left whitespace-nowrap">{t('Pages')}</th></tr></thead>
      <tbody>{list.map((r, i) => (
        <tr key={r.domain} className={`border-b border-edge/60 ${r.isBrand ? 'bg-gold/10' : ''}`}>
          <td className="px-2 py-1.5 text-faint tabular-nums">{i + 1}</td>
          <td className={`px-2 py-1.5 ${r.isBrand ? 'text-gold font-semibold' : 'text-ink'}`}>{r.isBrand && '★ '}{r.domain}</td>
          <td className="px-2 py-1.5 text-dim">{r.isBrand ? t('Brand-owned') : t('Third-party')}</td>
          <td className="px-2 py-1.5 text-right tabular-nums text-ink font-medium">{r.n}<span className="text-faint">/{N}</span></td>
          <td className="px-2 py-1.5 text-right tabular-nums text-dim">{r.engines}</td>
          <td className="px-2 py-1.5 text-right tabular-nums text-dim">{r.cum}</td>
          <td className="px-2 py-1.5 text-[10px] whitespace-nowrap"><PagesCell p={pages.get(r.domain)} t={t} /></td>
        </tr>))}</tbody>
    </table>
  );
  return (
    <div>
      <Title tip={TIP.sources[lang]}>{t('Sources AI cites')}</Title>
      <div className="overflow-x-auto mc-card mc-card-sm">{table(sorted.slice(0, 8))}</div>
      {sorted.length > 8 && <button onClick={() => setAll(true)} className="mt-1 text-[10px] text-faint hover:text-brand underline decoration-dotted">{t('Show all')} · {sorted.length} {t('domains')}</button>}
      {all && <Modal title={`${t('Sources AI cites')} · ${sorted.length}`} onClose={() => setAll(false)}>{table(sorted)}</Modal>}
    </div>
  );
}

// ── 3b. What the engines cite here (phase 2) ─────────────────────────────────
type ProfileRow = { engine: string; bucket: 'all' | 'heavy' | 'light'; pages: number; schemaShare: number; faqShare: number; datedShare: number; recentShare: number; brandShare: number; medianWords: number | null; medianAgeDays: number | null; topSchemaTypes: string[] };
const MIN_PROFILE_PAGES = 8;
function CitationProfile({ rows, engineView, lang, t }: { rows: ProfileRow[]; engineView: string | null; lang: Lang; t: T }) {
  const engines = rows.filter((r) => r.bucket === 'all' && r.pages >= MIN_PROFILE_PAGES && (!engineView || r.engine === engineView)).sort((a, b) => b.pages - a.pages);
  if (!engines.length) return null;
  const P = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div>
      <Title tip={TIP.profile[lang]}>{t('What the engines cite here')}</Title>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {engines.map((r) => {
          const heavy = rows.find((x) => x.engine === r.engine && x.bucket === 'heavy');
          const light = rows.find((x) => x.engine === r.engine && x.bucket === 'light');
          const contrast = heavy && light && heavy.pages >= 5 && light.pages >= 5;
          const Row = ({ label, all, h, l }: { label: string; all: string; h?: string; l?: string }) => (
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[11px] items-baseline">
              <span className="text-dim">{label}</span><span className="text-ink tabular-nums text-right">{all}</span>
              <span className="text-gold tabular-nums text-right">{contrast ? h : ''}</span><span className="text-faint tabular-nums text-right">{contrast ? l : ''}</span>
            </div>
          );
          return (
            <div key={r.engine} className="mc-card mc-card-sm p-3 space-y-1">
              <div className="flex items-baseline justify-between"><span className="text-[12px] font-semibold text-ink">{r.engine}</span><span className="text-[10px] text-faint">{r.pages} {t('pages read')}</span></div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[9px] uppercase tracking-wider text-faint"><span /><span className="text-right">{t('all')}</span><span className="text-right">{contrast ? t('3+ cites') : ''}</span><span className="text-right">{contrast ? t('1–2') : ''}</span></div>
              <Row label="schema.org" all={P(r.schemaShare)} h={heavy && P(heavy.schemaShare)} l={light && P(light.schemaShare)} />
              <Row label="FAQ" all={P(r.faqShare)} h={heavy && P(heavy.faqShare)} l={light && P(light.faqShare)} />
              <Row label={t('updated < 6 mo')} all={P(r.recentShare)} h={heavy && P(heavy.recentShare)} l={light && P(light.recentShare)} />
              <Row label={t('median words')} all={r.medianWords == null ? '—' : String(r.medianWords)} h={heavy?.medianWords == null ? '—' : String(heavy.medianWords)} l={light?.medianWords == null ? '—' : String(light.medianWords)} />
              <Row label={t('brand-owned')} all={P(r.brandShare)} h={heavy && P(heavy.brandShare)} l={light && P(light.brandShare)} />
              {r.topSchemaTypes.length > 0 && <div className="text-[10px] text-faint truncate" title={r.topSchemaTypes.join(', ')}>{r.topSchemaTypes.slice(0, 4).join(' · ')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 4. Presence by question — traceable to the answer ────────────────────────
const MARK = (s: Sample | undefined) => (!s ? '·' : !s.brandPresent ? '—' : s.prominence >= 3 ? '●' : s.prominence === 2 ? '◐' : '○');
function PresenceByPrompt({ samples, engines, brandName, bench, engineView, lang, t }: { samples: Sample[]; engines: string[]; brandName: string; bench: Bench[]; engineView: string | null; lang: Lang; t: T }) {
  const comps = bench.filter((b) => !b.isBrand).sort((a, b) => b.hits - a.hits).slice(0, 4).map((b) => b.name);
  const byPrompt = new Map<string, Sample[]>();
  for (const s of samples) (byPrompt.get(s.prompt) ?? byPrompt.set(s.prompt, []).get(s.prompt)!).push(s);
  // Columns: engines (all-engine view) or brand + top-4 competitors on the chosen engine.
  const cols: string[] = engineView ? [brandName, ...comps] : engines;
  const rows = [...byPrompt.entries()].map(([prompt, ss]) => {
    const first = ss[0];
    const cells = cols.map((c) => {
      const s = engineView ? ss.find((x) => x.engine === engineView) : ss.find((x) => x.engine === c);
      if (!s) return { mark: '·', present: false, s: undefined as Sample | undefined };
      if (engineView && c !== brandName) return { mark: (s.competitorsPresent ?? []).includes(c) ? '●' : '—', present: (s.competitorsPresent ?? []).includes(c), s };
      return { mark: MARK(s), present: s.brandPresent, s };
    });
    return { prompt, stage: first.stage, intent: first.intent, key: first.key, cells, present: cells.filter((c) => c.present).length, n: cells.filter((c) => c.s).length };
  });
  const get = (r: any, k: string) => (k === 'prompt' ? r.prompt : k === 'stage' ? r.stage : r.present);
  const { sorted, th } = useSort(rows, { key: 'present', dir: 'asc' }, get);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<{ prompt: string; col: string; s: Sample } | null>(null);
  const table = (list: any[]) => (
    <table className="w-full text-[11px]">
      <thead><tr className="border-b border-edge">
        {th('prompt', t('Question'), 'text-left')}{th('stage', t('Stage'), 'text-left')}
        {cols.map((c) => <th key={c} className="px-1 py-1.5 text-[10px] uppercase tracking-wider text-faint font-medium text-center whitespace-nowrap">{c === brandName ? `★ ${c}` : c}</th>)}
        {th('present', t('Present on'), 'text-right')}
      </tr></thead>
      <tbody>{list.map((r) => (
        <tr key={r.prompt} className="border-b border-edge/60">
          <td className="px-2 py-1.5 text-ink max-w-[320px]"><span className="line-clamp-2">{r.key && <span className="text-[9px] text-gold mr-1 uppercase">{t('key')}</span>}{r.prompt}</span></td>
          <td className="px-2 py-1.5 text-faint whitespace-nowrap">{r.stage}{r.intent === 'high_intent' ? ' · ★' : ''}</td>
          {r.cells.map((c: any, i: number) => (
            <td key={i} className="px-1 py-1.5 text-center">
              {c.s ? <button onClick={() => setOpen({ prompt: r.prompt, col: cols[i], s: c.s })} className={`w-6 h-6 rounded text-[13px] leading-none ${c.present ? 'text-gold hover:bg-gold/15' : 'text-faint hover:brightness-95'}`} title={t('Read the answer')}>{c.mark}</button> : <span className="text-faint/40">·</span>}
            </td>))}
          <td className="px-2 py-1.5 text-right tabular-nums text-dim">{r.present}/{r.n}</td>
        </tr>))}</tbody>
    </table>
  );
  return (
    <div>
      <Title tip={TIP.byPrompt[lang]}>{t('Presence by question')}{engineView ? ` · ${engineView}` : ''}</Title>
      <div className="overflow-x-auto mc-card mc-card-sm">{table(sorted.slice(0, 10))}</div>
      <div className="flex items-center gap-3 mt-1 text-[10px] text-faint">
        <span>● {t('featured')} · ◐ {t('listed')} · ○ {t('passing')} · — {t('absent')} · ★ {t('high intent')}</span>
        {sorted.length > 10 && <button onClick={() => setAll(true)} className="ml-auto hover:text-brand underline decoration-dotted">{t('Show all')} · {sorted.length}</button>}
      </div>
      {all && <Modal title={`${t('Presence by question')} · ${sorted.length}`} onClose={() => setAll(false)}>{table(sorted)}</Modal>}
      {open && (
        <Modal title={`${open.col} · ${open.prompt.slice(0, 80)}`} onClose={() => setOpen(null)}>
          <div className="space-y-2 text-[12px]">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
              <span>{t('Brand named')}: <b className="text-ink">{open.s.brandPresent ? t('yes') : t('no')}</b></span>
              <span>{t('Prominence')}: <b className="text-ink">{open.s.prominence}</b></span>
              <span>{t('Sentiment')}: <b className="text-ink">{open.s.sentiment}</b></span>
              {(open.s.competitorsPresent ?? []).length > 0 && <span>{t('Competitors named')}: <b className="text-ink">{open.s.competitorsPresent.join(', ')}</b></span>}
            </div>
            <div className="rounded-md mc-chip-inset mc-chip-inset p-3 whitespace-pre-wrap leading-relaxed text-ink">{open.s.snippet}{open.s.snippet?.length >= 400 ? ' …' : ''}</div>
            <div className="text-[10px] text-faint">{t('First 400 characters of the answer as recorded at scan time.')}</div>
            {(open.s.citations ?? []).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-faint mb-1">{t('Sources cited')}</div>
                <ul className="space-y-0.5">{open.s.citations.slice(0, 12).map((u, i) => <li key={i} className="truncate"><a href={u} target="_blank" rel="noreferrer" className="text-brand hover:underline text-[11px]">{u}</a></li>)}</ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Composition, in the reader's order ───────────────────────────────────────
type Ranking = { domain: string; citations: number; answers?: number; engines: number; isBrand: boolean };

export function MonitorViews({ o, engineView, lang, t, projectId, history }: { o: Record<string, any>; engineView: string | null; lang: Lang; t: T; projectId?: string; history?: ScanPoint[] }) {
  // Rankings stored before 2026-09-23 came from a capped select (see
  // /api/workspace/source-ranking); when the stored one lacks the per-answer
  // unit, show the live SQL aggregate instead of a wrong "all scans" column.
  const stored: Ranking[] = Array.isArray(o.sourceAuthority?.ranking) ? o.sourceAuthority.ranking : [];
  const storedIsCurrent = stored.some((r) => typeof r.answers === 'number');
  const [live, setLive] = useState<Ranking[] | null>(null);
  useEffect(() => {
    if (!projectId || storedIsCurrent) return;
    let on = true;
    fetch(`/api/workspace/source-ranking?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (on && Array.isArray(j?.ranking) && j.ranking.length) setLive(j.ranking); })
      .catch(() => {});
    return () => { on = false; };
  }, [projectId, storedIsCurrent]);
  const ranking: Ranking[] = storedIsCurrent ? stored : (live ?? stored);
  // Cited-page features per domain (lib/pages) — what is ON the pages the
  // engines cite, aggregated in SQL by /api/workspace/source-pages.
  const [pages, setPages] = useState<Map<string, DomainPages>>(new Map());
  const [profile, setProfile] = useState<ProfileRow[]>([]);
  useEffect(() => {
    if (!projectId) return;
    let on = true;
    fetch(`/api/workspace/citation-profile?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (on && Array.isArray(j?.rows)) setProfile(j.rows); })
      .catch(() => {});
    return () => { on = false; };
  }, [projectId]);
  // Ask only for the domains this scan cites (bounded by inputs, never by the
  // size of the index — the unbounded form hit the 1000-row cap on day one).
  const scanDomains = useMemo(() => {
    // Most-cited domains first, then cut at 200 — a first-appearance cut dropped
    // the brand's own domain on FMVN (a scan cites >200 distinct domains).
    const rs: Sample[] = Array.isArray(o.rawSamples) ? o.rawSamples : [];
    const count = new Map<string, number>();
    for (const s of rs) for (const d of new Set((s.citations ?? []).map(domainOf).filter(Boolean))) count.set(d, (count.get(d) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([d]) => d);
  }, [o.rawSamples]);
  useEffect(() => {
    if (!projectId || !scanDomains.length) return;
    let on = true;
    fetch(`/api/workspace/source-pages?projectId=${encodeURIComponent(projectId)}&domains=${encodeURIComponent(scanDomains.join(','))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (on && Array.isArray(j?.domains)) setPages(new Map(j.domains.map((d: DomainPages) => [d.domain, d]))); })
      .catch(() => {});
    return () => { on = false; };
  }, [projectId, scanDomains]);
  const all: Sample[] = Array.isArray(o.rawSamples) ? o.rawSamples : [];
  const samples = engineView ? all.filter((s) => s.engine === engineView) : all;
  const engines: string[] = o.engines ?? Array.from(new Set(all.map((s) => s.engine)));
  const bench: Bench[] = o.competitorBenchmark ?? [];
  const brandName: string = bench.find((b) => b.isBrand)?.name ?? o.brand ?? '';
  // In the single-engine view the table/donut are recomputed for that engine.
  const benchView: Bench[] = engineView
    ? bench.map((b) => ({ ...b, hits: b.isBrand ? samples.filter((s) => s.brandPresent).length : samples.filter((s) => (s.competitorsPresent ?? []).includes(b.name)).length })).map((b) => ({ ...b, sovPct: pct(b.hits, samples.length) }))
    : bench;
  const totalMentions = benchView.reduce((a, b) => a + b.hits, 0);
  const nAnswers = samples.length || (o.metrics?.overall?.queries ?? 0);
  const brandRow = engineView
    ? { sentiment: (o.metrics?.perEngine ?? []).find((e: any) => e.engine === engineView)?.sentiment, topOfMind: (o.metrics?.perEngine ?? []).find((e: any) => e.engine === engineView)?.topOfMindRate }
    : { sentiment: o.dimensions?.sentiment, topOfMind: o.topOfMind?.overallRate ?? o.dimensions?.topOfMindRate };
  if (!all.length) return null;
  return (
    <div className="space-y-5">
      <div className="mc-enter" style={{ ['--i' as any]: 0 }}><PresenceTrend history={history ?? []} brandName={brandName} bench={bench} engineView={engineView} lang={lang} t={t} /></div>
      <div className="mc-enter" style={{ ['--i' as any]: 1 }}><BrandVisibility bench={benchView} nAnswers={nAnswers} totalMentions={totalMentions} brandRow={brandRow} partners={Array.isArray(o.partners) ? o.partners : []} lang={lang} t={t} /></div>
      <div className="mc-enter" style={{ ['--i' as any]: 2 }}><SovBar bench={benchView} totalMentions={totalMentions} lang={lang} t={t} /></div>
      <div className="mc-enter" style={{ ['--i' as any]: 3 }}>{!engineView && <PresenceByEngine samples={all} engines={engines} brandName={brandName} bench={bench} lang={lang} t={t} />}</div>
      <div className="mc-enter" style={{ ['--i' as any]: 4 }}><CitationSources samples={samples} ranking={ranking} pages={pages} lang={lang} t={t} /></div>
      <div className="mc-enter" style={{ ['--i' as any]: 5 }}><CitationProfile rows={profile} engineView={engineView} lang={lang} t={t} /></div>
      <div className="mc-enter" style={{ ['--i' as any]: 6 }}><PresenceByPrompt samples={all} engines={engines} brandName={brandName} bench={bench} engineView={engineView} lang={lang} t={t} /></div>
    </div>
  );
}
