// 觀瀾智庫 GEO 平台 — white-label landing for the Traditional-Chinese line
// (Hong Kong · Taiwan). Served at geo.neuronsparkmedia.com via host rewrite.
//
// Invitation-only: 觀瀾智庫's own clients enter here; the platform interface
// they see is branded 觀瀾智庫 GEO 平台 (org metadata.branding.platformName).
// Same production engine underneath — a market is a market.
//
// Two things this page used to get wrong, both about being an island:
//   · It rendered in MemeCMO's tokens, so a neuronsparkmedia.com subdomain
//     looked like a different company's product. It now uses the 觀瀾智庫
//     Atelier language (./atelier.css), same values as the homepage.
//   · The only way back to 觀瀾智庫 was one underlined line in the last
//     section, and the main site linked here zero times. There is now a
//     persistent header link out, and a navigation block at the foot.

import type { Metadata } from 'next';
import './atelier.css';

export const metadata: Metadata = {
  title: '觀瀾智庫 GEO 平台 · 香港/台灣 AI 能見度',
  description: '觀瀾智庫客戶專屬的生成式引擎優化平台 — 量測並建設品牌在 ChatGPT、Gemini、Perplexity、Claude 與 Google AI Overview(香港/台灣真實界面)中的能見度。',
  robots: { index: false, follow: false },
};

const HOME = 'https://www.neuronsparkmedia.com/zh-tw';
const LOGIN = 'https://app.memecmo.ai/login?next=/dashboard';

const PRINCIPLES = [
  {
    n: '01',
    title: '繁體中文世界的答案自成一體',
    body: '香港與台灣的買家用繁體中文問 AI，引擎給的答案、引用的媒體、點名的品牌，與簡體世界和英文世界都不同。量測必須在繁體語料的真實答案面上進行，否則看到的是別人的市場。',
  },
  {
    n: '02',
    title: '兩地是兩個市場，不是一個',
    body: '同一條問題，香港答案引 HK01、經濟日報，台灣答案引聯合報、數位時代；監管、支付、消費語境全然不同。平台以「品牌 × 市場」為單位，香港與台灣各自建檔、各自量分、各自對標本地競爭者。',
  },
  {
    n: '03',
    title: '量測之後，是動手建設',
    body: '十個智能體從量測（五維指數、競爭者聲量、缺口清單）走到執行（內容、官網 Schema、媒體投放、百科）——每一步產出的都是可直接使用的交付物，而非一份要客戶自己消化的報表。',
  },
];

const CAPABILITIES = [
  { fig: 'FIG.A', name: '提示詞發現', body: '生成 110+ 條繁體中文買家問題（五個漏斗階段），標記 20 條重點監測。' },
  { fig: 'FIG.B', name: 'AI 能見度指數', body: '五引擎同題實測 — ChatGPT、Gemini、Perplexity、Claude，以及 Google AI Overview 香港/台灣真實界面；五維加權綜合分 0–100。' },
  { fig: 'FIG.C', name: '競爭者聲量基準', body: '競爭者從真實 AI 回答中提取，非人工預設；合作夥伴可標記排除，不污染聲量份額。' },
  { fig: 'FIG.D', name: '標準答案庫', body: '20 條重點問題的「理想答案」，繁體中文 + 英文雙語，嚴格錨定品牌事實。' },
  { fig: 'FIG.E', name: '內容與官網建設', body: '缺口變成可發布的繁體頁面 + FAQ Schema；官網 JSON-LD 貼上即用。' },
  { fig: 'FIG.F', name: '媒體投放與百科', body: '按 AI 實際引用的媒體逐個生成投遞稿；維基百科走披露 + 編輯請求的合規路徑。' },
];

/** Where this page sits relative to the rest of 觀瀾智庫. */
const WAYPOINTS = [
  { href: HOME, label: '觀瀾智庫主頁', desc: '智能體庫 × 實踐工場 — 我們是誰、做過什麼' },
  { href: 'https://www.neuronsparkmedia.com/zh-tw/sea-intelligence', label: '東南亞市場情報', desc: '每月實測：中國品牌在越南、泰國的 AI 能見度' },
  { href: 'https://www.neuronsparkmedia.com/zh-tw/founder', label: '創辦團隊', desc: '產品、學術與工程的交界處' },
  { href: 'https://www.neuronsparkmedia.com/zh-tw/waitlist', label: '申請合作', desc: '尚未合作的品牌由此進入，我們會回一份基礎報告' },
];

function BackHome({ tone = 'cream' }: { tone?: 'cream' | 'night' }) {
  const color = tone === 'cream' ? 'var(--gl-blue)' : 'var(--gl-periwinkle)';
  return (
    <a
      href={HOME}
      style={{ color, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 7 }}
    >
      <span aria-hidden="true" style={{ fontFamily: 'var(--gl-mono)' }}>←</span>
      返回觀瀾智庫主頁
    </a>
  );
}

export default function GuanlanLandingPage() {
  return (
    <div className="gl-scope">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header
        className="gl-cream sticky top-0 z-50"
        style={{ borderBottom: '1px solid rgba(0,29,204,.18)', backdropFilter: 'blur(10px)' }}
      >
        <div
          className="mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3 sm:px-10"
          style={{ maxWidth: 'var(--gl-max)' }}
        >
          <div className="flex items-baseline gap-3">
            <span style={{ fontFamily: 'var(--gl-serif)', fontWeight: 900, fontSize: 16 }}>
              觀瀾智庫
            </span>
            <span className="gl-mono" style={{ fontSize: 10, color: 'var(--gl-blue)' }}>
              GEO 平台
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <BackHome />
            <span
              className="gl-label"
              style={{ padding: '3px 8px', border: '1px solid var(--gl-vermilion)', color: 'var(--gl-vermilion)' }}
            >
              客戶專屬
            </span>
            <a
              href={LOGIN}
              style={{
                fontSize: 12.5, fontWeight: 500, padding: '8px 16px',
                background: 'var(--gl-blue)', color: 'var(--gl-cream)',
              }}
            >
              登入平台 →
            </a>
          </div>
        </div>
      </header>

      {/* ── Cream half ───────────────────────────────────────────────── */}
      <main className="gl-cream relative overflow-hidden">
        <div className="gl-halftone absolute inset-0" aria-hidden="true" />

        <div
          className="relative mx-auto px-6 pb-24 pt-20 sm:px-10"
          style={{ maxWidth: 'var(--gl-max)' }}
        >
          {/* Hero */}
          <section className="max-w-[840px]">
            <p className="gl-mono" style={{ fontSize: 10.5, color: 'var(--gl-vermilion)', margin: 0 }}>
              geo.neuronsparkmedia.com · 觀瀾智庫 GEO 平台
            </p>
            <h1
              className="gl-display"
              style={{ margin: '18px 0 0', fontSize: 'clamp(32px,4.2vw,58px)' }}
            >
              讓品牌成為 AI 的答案。
              <br />
              <span style={{ color: 'var(--gl-blue)' }}>香港 · 台灣</span>
            </h1>
            <p style={{ margin: '22px 0 0', fontSize: 17, lineHeight: 1.95, maxWidth: 720, color: 'rgba(16,20,24,.72)' }}>
              當買家改用 ChatGPT、Gemini 與 Google AI Overview 尋找答案，品牌的能見度戰場已經轉移。
              觀瀾智庫 GEO 平台為繁體中文市場量測並建設品牌在 AI 引擎中的存在 —
              以五維指數計分、以真實答案面取證、以十個智能體交付。
            </p>
          </section>

          {/* What this is — the orientation the page never gave */}
          <section
            className="gl-ticks gl-card-light relative mt-16 p-7 sm:p-9"
            style={{ maxWidth: 900 }}
          >
            <span className="gl-ticks-b" aria-hidden="true" />
            <div className="gl-mono" style={{ fontSize: 10, color: 'var(--gl-blue)' }}>
              WHAT THIS IS
            </div>
            <h2 className="gl-display" style={{ margin: '12px 0 0', fontSize: 22 }}>
              這個網址是什麼
            </h2>
            <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-3" style={{ margin: '24px 0 0' }}>
              {[
                ['它是什麼', '觀瀾智庫的 GEO 作業平台，不是介紹頁。客戶在這裡看自己品牌在 AI 引擎中的實際讀數，並領取可直接使用的交付物。'],
                ['和觀瀾智庫的關係', '觀瀾智庫是母體 — 一家跨界智能體庫與實踐工場。GEO 是其中一條產線，專做繁體中文市場的 AI 能見度。'],
                ['誰能進來', '僅限已合作的客戶，由觀瀾團隊開通「品牌 × 市場」工作區後以邀請郵件登入。尚未合作請走申請合作。'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt style={{ fontSize: 13, fontWeight: 700, color: 'var(--gl-blue)', marginBottom: 8 }}>{k}</dt>
                  <dd style={{ margin: 0, fontSize: 13.5, lineHeight: 1.95, color: 'rgba(16,20,24,.7)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* First principles */}
          <section className="mt-20">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="gl-display" style={{ margin: 0, fontSize: 26 }}>第一性原理</h2>
              <span className="gl-mono" style={{ fontSize: 10, color: 'rgba(16,20,24,.4)' }}>
                FIRST PRINCIPLES
              </span>
            </div>
            <hr className="gl-rule" style={{ margin: '16px 0 28px' }} />

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {PRINCIPLES.map((pr) => (
                <div key={pr.n} className="gl-ticks gl-card-light relative p-6">
                  <span className="gl-ticks-b" aria-hidden="true" />
                  <div
                    style={{ fontFamily: 'var(--gl-mono)', fontSize: 22, fontWeight: 500, color: 'var(--gl-vermilion)' }}
                  >
                    {pr.n}
                  </div>
                  <h3
                    className="gl-display"
                    style={{ margin: '14px 0 10px', fontSize: 16, fontWeight: 900 }}
                  >
                    {pr.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.95, color: 'rgba(16,20,24,.68)' }}>
                    {pr.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="gl-bridge" aria-hidden="true" />
      </main>

      {/* ── Night half ───────────────────────────────────────────────── */}
      <section className="gl-night relative overflow-hidden">
        <div className="gl-grid-night absolute inset-0" aria-hidden="true" />

        <div
          className="relative mx-auto px-6 pb-24 pt-20 sm:px-10"
          style={{ maxWidth: 'var(--gl-max)' }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="gl-display" style={{ margin: 0, fontSize: 26, color: '#fff' }}>平台能力</h2>
            <span className="gl-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.38)' }}>
              CAPABILITIES · 10 AGENTS
            </span>
          </div>
          <hr className="gl-rule" style={{ margin: '16px 0 28px' }} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.name} className="gl-ticks gl-card-night relative p-6">
                <span className="gl-ticks-b" aria-hidden="true" />
                <div className="gl-mono" style={{ fontSize: 9.5, color: 'rgba(255,255,255,.35)' }}>{c.fig}</div>
                <h3 style={{ margin: '14px 0 10px', fontSize: 15, fontWeight: 600, color: '#fff' }}>{c.name}</h3>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.95, color: 'rgba(255,255,255,.62)' }}>{c.body}</p>
              </div>
            ))}
          </div>

          {/* Invitation */}
          <div
            className="gl-ticks relative mt-16 p-7 sm:p-9"
            style={{ border: '1px solid var(--gl-orange)', background: 'rgba(255,106,61,.06)' }}
          >
            <span className="gl-ticks-b" aria-hidden="true" />
            <div className="gl-mono" style={{ fontSize: 10, color: 'var(--gl-orange)' }}>INVITATION ONLY</div>
            <h2 className="gl-display" style={{ margin: '12px 0 0', fontSize: 22, color: '#fff' }}>邀請制</h2>
            <p style={{ margin: '16px 0 0', fontSize: 14, lineHeight: 1.95, color: 'rgba(255,255,255,.68)', maxWidth: 760 }}>
              本平台僅向觀瀾智庫的合作客戶開放：由觀瀾團隊為您開通專屬工作區（品牌 × 市場），以邀請郵件登入。
              平台內所有交付物 — 指數報告、標準答案庫、內容與 Schema — 均可直接下載 PDF 使用。
              尚未合作的品牌，請先與觀瀾智庫聯繫。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a
                href={LOGIN}
                style={{ fontSize: 13.5, fontWeight: 500, padding: '11px 22px', background: 'var(--gl-orange)', color: 'var(--gl-night)' }}
              >
                已有帳號，登入 →
              </a>
              <a
                href="https://www.neuronsparkmedia.com/zh-tw/waitlist"
                style={{ fontSize: 13.5, padding: '11px 22px', border: '1px solid rgba(124,155,255,.32)', color: '#fff' }}
              >
                尚未合作，申請合作
              </a>
            </div>
          </div>

          {/* Navigation back into the main site */}
          <nav className="mt-20" aria-label="觀瀾智庫網站導航">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="gl-display" style={{ margin: 0, fontSize: 20, color: '#fff' }}>回到觀瀾智庫</h2>
              <span className="gl-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.38)' }}>NAVIGATION</span>
            </div>
            <hr className="gl-rule" style={{ margin: '14px 0 22px' }} />

            <ul className="m-0 grid list-none grid-cols-1 gap-px p-0 sm:grid-cols-2 lg:grid-cols-4"
                style={{ background: 'rgba(124,155,255,.16)' }}>
              {WAYPOINTS.map((w) => (
                <li key={w.href} style={{ background: 'var(--gl-night)' }}>
                  <a href={w.href} className="block p-5 transition-colors hover:bg-white/[.04]">
                    <span className="flex items-baseline gap-2" style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                      {w.label}
                      <span aria-hidden="true" style={{ color: 'var(--gl-periwinkle)', fontFamily: 'var(--gl-mono)', fontSize: 11 }}>↗</span>
                    </span>
                    <span className="mt-2 block" style={{ fontSize: 12.5, lineHeight: 1.85, color: 'rgba(255,255,255,.55)' }}>
                      {w.desc}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="gl-night" style={{ borderTop: '1px solid rgba(124,155,255,.16)' }}>
        <div
          className="mx-auto flex flex-wrap items-center justify-between gap-4 px-6 py-8 sm:px-10"
          style={{ maxWidth: 'var(--gl-max)' }}
        >
          <BackHome tone="night" />
          <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255,255,255,.38)' }}>
            © 2026 NeuronSpark Media-Tech Limited（觀瀾智庫）· 平台技術由 MemeCMO Tech Limited 提供 · 客戶專屬，不對外索引
          </p>
        </div>
      </footer>
    </div>
  );
}
