'use client';

// About Us content — follows the site language selector (navbar), same
// tri-language set as the rest of the marketing pages: zh-TW / zh-CN / en.

import { useLanguage } from '@/contexts/language-context';

type Lang = 'zh-TW' | 'zh-CN' | 'en';

const COPY: Record<Lang, {
  eyebrow: string;
  intro: string;
  introSecondary: string;
  regTitle: string;
  registryLabel: string;
  peopleTitle: string;
  structureTitle: string;
  facts: { label: string; value: string }[];
  people: { name: string; nameEn: string; title: string; body: string }[];
  holders: { share: string; text: string }[];
  clientLabel: string;
  clientText: string;
}> = {
  'zh-TW': {
    eyebrow: 'About Us · 關於我們',
    intro:
      'MemeCMO 是專為東南亞市場設計之生成式引擎優化（GEO）SaaS 平台，整合 10 個 AI 智能體，服務品牌於 ChatGPT / Gemini / Claude / Perplexity 等 AI 引擎中之曝光與定位。',
    introSecondary:
      'MemeCMO is a Generative Engine Optimization (GEO) SaaS platform purpose-built for Southeast Asian markets.',
    regTitle: '法定註冊資訊',
    registryLabel: '官方查冊',
    peopleTitle: '董事及核心人員',
    structureTitle: '股權與夥伴',
    facts: [
      { label: '法定名稱', value: 'MemeCMO Tech Limited' },
      { label: '公司註冊編號 CR', value: '80218619（Hong Kong Companies Registry）' },
      { label: '商業登記編號 BR', value: '80218619-000-04-26-7' },
      { label: '成立日期', value: '2026-04-17 · 香港特別行政區' },
      { label: '註冊辦事處', value: 'Room C03, 9/F, Kato Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon, Hong Kong' },
      { label: '服務市場', value: '越南 · 泰國 · 印尼 · 馬來西亞 · 新加坡 · 菲律賓' },
    ],
    people: [
      { name: '陳松吟', nameEn: 'Chen Songyin', title: '創始董事 · Founding Director', body: 'MemeCMO Tech Limited 唯一董事，負責公司治理、商業策略與東南亞市場拓展。' },
      { name: '劉峻鑠', nameEn: 'Liu Junshuo', title: '首席技術顧問 · Chief Technology Advisor', body: '由技術股東觀瀾智庫（香港）有限公司派遣，主導 GEO 多智能體平台之架構與研發。' },
    ],
    holders: [
      { share: '70%', text: '香港自在天地科技有限公司 · HK Infinity Realm Technology Co. Limited（控股股東）' },
      { share: '30%', text: '觀瀾智庫（香港）有限公司 · NeuronSpark Media-tech Limited（技術股東）' },
    ],
    clientLabel: '客戶',
    clientText: 'Focus Media Vietnam — 首個渠道夥伴與旗艦客戶',
  },
  'zh-CN': {
    eyebrow: 'About Us · 关于我们',
    intro:
      'MemeCMO 是专为东南亚市场设计的生成式引擎优化（GEO）SaaS 平台，整合 10 个 AI 智能体，服务品牌在 ChatGPT / Gemini / Claude / Perplexity 等 AI 引擎中的曝光与定位。',
    introSecondary:
      'MemeCMO is a Generative Engine Optimization (GEO) SaaS platform purpose-built for Southeast Asian markets.',
    regTitle: '法定注册信息',
    registryLabel: '官方查册',
    peopleTitle: '董事及核心人员',
    structureTitle: '股权与伙伴',
    facts: [
      { label: '法定名称', value: 'MemeCMO Tech Limited' },
      { label: '公司注册编号 CR', value: '80218619（香港公司注册处）' },
      { label: '商业登记编号 BR', value: '80218619-000-04-26-7' },
      { label: '成立日期', value: '2026-04-17 · 香港特别行政区' },
      { label: '注册办事处', value: 'Room C03, 9/F, Kato Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon, Hong Kong' },
      { label: '服务市场', value: '越南 · 泰国 · 印尼 · 马来西亚 · 新加坡 · 菲律宾' },
    ],
    people: [
      { name: '陈松吟', nameEn: 'Chen Songyin', title: '创始董事 · Founding Director', body: 'MemeCMO Tech Limited 唯一董事，负责公司治理、商业策略与东南亚市场拓展。' },
      { name: '刘峻鑠', nameEn: 'Liu Junshuo', title: '首席技术顾问 · Chief Technology Advisor', body: '由技术股东观澜智库（香港）有限公司派遣，主导 GEO 多智能体平台的架构与研发。' },
    ],
    holders: [
      { share: '70%', text: '香港自在天地科技有限公司 · HK Infinity Realm Technology Co. Limited（控股股东）' },
      { share: '30%', text: '观澜智库（香港）有限公司 · NeuronSpark Media-tech Limited（技术股东）' },
    ],
    clientLabel: '客户',
    clientText: 'Focus Media Vietnam — 首个渠道伙伴与旗舰客户',
  },
  en: {
    eyebrow: 'About Us',
    intro:
      'MemeCMO is a Generative Engine Optimization (GEO) SaaS platform purpose-built for Southeast Asian markets, with 10 AI agents optimizing brand visibility across ChatGPT, Gemini, Claude, Perplexity and regional LLMs.',
    introSecondary:
      'MemeCMO 是專為東南亞市場設計之生成式引擎優化（GEO）SaaS 平台。',
    regTitle: 'Registration',
    registryLabel: 'Official registry',
    peopleTitle: 'Leadership',
    structureTitle: 'Structure & Partners',
    facts: [
      { label: 'Legal name', value: 'MemeCMO Tech Limited' },
      { label: 'CR No.', value: '80218619 (Hong Kong Companies Registry)' },
      { label: 'BR No.', value: '80218619-000-04-26-7' },
      { label: 'Founded', value: '2026-04-17 · Hong Kong SAR' },
      { label: 'Registered office', value: 'Room C03, 9/F, Kato Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon, Hong Kong' },
      { label: 'Markets', value: 'Vietnam · Thailand · Indonesia · Malaysia · Singapore · Philippines' },
    ],
    people: [
      { name: 'Chen Songyin', nameEn: '陳松吟', title: 'Founding Director', body: 'Sole director of MemeCMO Tech Limited — corporate governance, business strategy and Southeast Asia market development.' },
      { name: 'Liu Junshuo', nameEn: '劉峻鑠', title: 'Chief Technology Advisor', body: 'Seconded by technology shareholder NeuronSpark Media-tech Limited; leads architecture and R&D of the GEO multi-agent platform.' },
    ],
    holders: [
      { share: '70%', text: 'HK Infinity Realm Technology Co. Limited (majority shareholder)' },
      { share: '30%', text: 'NeuronSpark Media-tech Limited (technology shareholder)' },
    ],
    clientLabel: 'Client',
    clientText: 'Focus Media Vietnam — first channel partner & flagship client',
  },
};

export default function AboutContent() {
  const { language } = useLanguage();
  const c = COPY[(language as Lang) in COPY ? (language as Lang) : 'en'];

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 space-y-16">
        <section className="space-y-5">
          <p className="text-xs tracking-[0.25em] uppercase text-faint">{c.eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">MemeCMO Tech Limited</h1>
          <p className="text-base text-dim leading-relaxed">{c.intro}</p>
          <p className="text-sm text-faint leading-relaxed">{c.introSecondary}</p>
        </section>

        <section className="space-y-5">
          <h2 className="text-xl font-semibold">{c.regTitle}</h2>
          <div className="rounded-xl border border-edge divide-y divide-edge overflow-hidden">
            {c.facts.map((f) => (
              <div key={f.label} className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 sm:gap-4 px-5 py-3.5 bg-surface">
                <div className="text-xs text-faint uppercase tracking-wider self-center">{f.label}</div>
                <div className="text-sm text-ink">{f.value}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-faint">
            {c.registryLabel}:{' '}
            <a
              href="https://www.icris.cr.gov.hk/csci/cps_criteria.do?corpNo=80218619"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dim underline underline-offset-2 hover:text-ink"
            >
              Hong Kong Companies Registry (ICRIS) · CR 80218619
            </a>
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="text-xl font-semibold">{c.peopleTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {c.people.map((p) => (
              <div key={p.nameEn} className="rounded-xl border border-edge bg-surface p-6 space-y-2">
                <div className="text-lg font-semibold">
                  {p.name} <span className="text-dim font-normal">{p.nameEn}</span>
                </div>
                <div className="text-xs tracking-wider uppercase text-brand">{p.title}</div>
                <p className="text-sm text-dim leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-xl font-semibold">{c.structureTitle}</h2>
          <ul className="space-y-3 text-sm text-dim">
            {c.holders.map((h) => (
              <li key={h.share} className="flex gap-3">
                <span className="text-faint shrink-0 w-14">{h.share}</span>
                <span>{h.text}</span>
              </li>
            ))}
            <li className="flex gap-3 pt-2 border-t border-edge">
              <span className="text-faint shrink-0 w-14">{c.clientLabel}</span>
              <span>{c.clientText}</span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
