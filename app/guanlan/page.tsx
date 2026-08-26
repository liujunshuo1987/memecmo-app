// 觀瀾智庫 GEO 平台 — white-label landing for the Traditional-Chinese line
// (Hong Kong · Taiwan). Served at geo.neuronsparkmedia.com via host rewrite.
//
// Invitation-only: 觀瀾智庫's own clients enter here; the platform interface
// they see is branded 觀瀾智庫 GEO 平台 (org metadata.branding.platformName).
// Same production engine underneath — a market is a market.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '觀瀾智庫 GEO 平台 · 香港/台灣 AI 能見度',
  description: '觀瀾智庫客戶專屬的生成式引擎優化平台 — 量測並建設品牌在 ChatGPT、Gemini、Perplexity、Claude 與 Google AI Overview(香港/台灣真實界面)中的能見度。',
  robots: { index: false, follow: false },
};

const PRINCIPLES = [
  { n: '01', title: '繁體中文世界的答案自成一體', body: '香港與台灣的買家用繁體中文問 AI,引擎給的答案、引用的媒體、點名的品牌,與簡體世界和英文世界都不同。量測必須在繁體語料的真實答案面上進行,否則看到的是別人的市場。' },
  { n: '02', title: '兩地是兩個市場,不是一個', body: '同一條問題,香港答案引 HK01、經濟日報,台灣答案引聯合報、數位時代;監管、支付、消費語境全然不同。平台以「品牌 × 市場」為單位,香港與台灣各自建檔、各自量分、各自對標本地競爭者。' },
  { n: '03', title: '量測之後,是動手建設', body: '十個智能體從量測(五維指數、競爭者聲量、缺口清單)走到執行(內容、官網 Schema、媒體投放、百科)——每一步產出的都是可直接使用的交付物,而非一份要客戶自己消化的報表。' },
];

const CAPABILITIES = [
  { name: '提示詞發現', body: '生成 110+ 條繁體中文買家問題(五個漏斗階段),標記 20 條重點監測。' },
  { name: 'AI 能見度指數', body: '五引擎同題實測 — ChatGPT、Gemini、Perplexity、Claude,以及 Google AI Overview 香港/台灣真實界面;五維加權綜合分 0–100。' },
  { name: '競爭者聲量基準', body: '競爭者從真實 AI 回答中提取,非人工預設;合作夥伴可標記排除,不污染聲量份額。' },
  { name: '標準答案庫', body: '20 條重點問題的「理想答案」,繁體中文 + 英文雙語,嚴格錨定品牌事實。' },
  { name: '內容與官網建設', body: '缺口變成可發布的繁體頁面 + FAQ Schema;官網 JSON-LD 貼上即用。' },
  { name: '媒體投放與百科', body: '按 AI 實際引用的媒體逐個生成投遞稿;維基百科走披露 + 編輯請求的合規路徑。' },
];

export default function GuanlanLandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-edge px-6 py-3 flex items-center justify-between">
        <span className="text-xs tracking-[0.2em] uppercase text-dim">觀瀾智庫 · GEO</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-gold/40 text-gold uppercase tracking-widest">客戶專屬</span>
          <a href="https://app.memecmo.ai/login?next=/dashboard" className="text-xs px-3 py-1.5 rounded-lg bg-brand text-on-brand font-medium hover:brightness-110 transition">登入平台 →</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14 space-y-16">
        <section className="space-y-5">
          <p className="text-xs tracking-[0.25em] uppercase text-faint">geo.neuronsparkmedia.com · 觀瀾智庫 GEO 平台</p>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight">
            讓品牌成為 AI 的答案。<br />
            <span className="text-brand">香港 · 台灣</span>
          </h1>
          <p className="text-base text-dim leading-relaxed max-w-2xl">
            當買家改用 ChatGPT、Gemini 與 Google AI Overview 尋找答案,品牌的能見度戰場已經轉移。
            觀瀾智庫 GEO 平台為繁體中文市場量測並建設品牌在 AI 引擎中的存在 —
            以五維指數計分、以真實答案面取證、以十個智能體交付。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-edge pb-2">第一性原理</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PRINCIPLES.map((pr) => (
              <div key={pr.n} className="rounded-xl border border-edge bg-surface p-5 space-y-2">
                <div className="text-[11px] font-semibold text-brand tabular-nums">{pr.n}</div>
                <div className="text-sm font-semibold text-ink leading-snug">{pr.title}</div>
                <p className="text-[13px] text-dim leading-relaxed">{pr.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-edge pb-2">平台能力</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAPABILITIES.map((c) => (
              <div key={c.name} className="rounded-lg border border-edge bg-surface p-4">
                <div className="text-sm font-medium text-ink mb-1">{c.name}</div>
                <p className="text-[12px] text-dim leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-brand/40 bg-brand-soft/40 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-ink">邀請制</h2>
          <p className="text-[13px] text-dim leading-relaxed">
            本平台僅向觀瀾智庫的合作客戶開放:由觀瀾團隊為您開通專屬工作區(品牌 × 市場),
            以邀請郵件登入。平台內所有交付物 — 指數報告、標準答案庫、內容與 Schema —
            均可直接下載 PDF 使用。尚未合作的品牌,請先與觀瀾智庫聯繫。
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a href="https://app.memecmo.ai/login?next=/dashboard" className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:brightness-110 transition">
              已有帳號,登入 →
            </a>
            <a href="https://www.neuronsparkmedia.com" className="text-sm text-dim underline underline-offset-2 hover:text-ink transition">
              聯繫觀瀾智庫
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge px-6 py-6 text-center">
        <p className="text-[11px] text-faint">
          © 2026 NeuronSpark Media-Tech Limited(觀瀾智庫)· 平台技術由 MemeCMO Tech Limited 提供 · 客戶專屬,不對外索引
        </p>
      </footer>
    </div>
  );
}
