// About Us — the entity page. Carries the canonical Organization + Person
// JSON-LD for the MemeCMO entity (per 23_MemeCMO主頁GEO_Schema署名內容清單 §2.3/§3).
// Only VERIFIED facts are published: legal name, HK CR/BR, registered address,
// founding, people, shareholding, official registry link. Unregistered social
// profiles / unbuilt mailboxes / undecided pricing are deliberately omitted —
// fake authority signals hurt GEO credibility.

import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';

export const metadata: Metadata = {
  title: 'About Us · MemeCMO Tech Limited — GEO SaaS for Southeast Asia',
  description:
    'MemeCMO is a Generative Engine Optimization (GEO) SaaS platform purpose-built for Southeast Asian markets, with 10 AI agents optimizing brand visibility across ChatGPT, Gemini, Claude, Perplexity and regional LLMs.',
  alternates: { canonical: 'https://app.memecmo.ai/about' },
};

const entityGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': ['Organization', 'SoftwareApplication'],
      '@id': 'https://memecmo.ai/#organization',
      name: 'MemeCMO Tech Limited',
      legalName: 'MemeCMO Tech Limited',
      alternateName: ['MemeCMO', 'MemeCMO.ai'],
      url: 'https://memecmo.ai',
      logo: {
        '@type': 'ImageObject',
        url: 'https://app.memecmo.ai/logo-square.svg',
        width: 512,
        height: 512,
      },
      description:
        'MemeCMO is a Generative Engine Optimization (GEO) SaaS platform purpose-built for Southeast Asian markets, with 10 AI agents optimizing brand visibility across ChatGPT, Gemini, Claude, Perplexity and regional LLMs.',
      foundingDate: '2026-04-17',
      foundingLocation: {
        '@type': 'Place',
        name: 'Hong Kong Special Administrative Region',
      },
      identifier: [
        { '@type': 'PropertyValue', name: 'Hong Kong CR No.', value: '80218619' },
        { '@type': 'PropertyValue', name: 'Hong Kong BR No.', value: '80218619-000-04-26-7' },
      ],
      taxID: '80218619-000-04-26-7',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Room C03, 9/F, Kato Factory Building, 2 Cheung Yue Street',
        addressLocality: 'Lai Chi Kok',
        addressRegion: 'Kowloon, Hong Kong',
        addressCountry: 'HK',
      },
      areaServed: [
        { '@type': 'Country', name: 'Vietnam' },
        { '@type': 'Country', name: 'Thailand' },
        { '@type': 'Country', name: 'Indonesia' },
        { '@type': 'Country', name: 'Malaysia' },
        { '@type': 'Country', name: 'Singapore' },
        { '@type': 'Country', name: 'Philippines' },
      ],
      knowsAbout: [
        'Generative Engine Optimization',
        'AI Mindset Positioning Theory',
        'Trout-Ries Positioning Theory',
        'Multi-tenant SaaS Architecture',
        'Southeast Asia AI Market Analysis',
        'Vietnamese Content Generation',
        'AI-Ready Schema Optimization',
      ],
      slogan: 'Get Your Brand Recognized by AI · 讓 AI 記住你的品牌',
      sameAs: ['https://www.icris.cr.gov.hk/csci/cps_criteria.do?corpNo=80218619'],
      founder: { '@id': 'https://memecmo.ai/#chen-songyin' },
      employee: [
        { '@id': 'https://memecmo.ai/#chen-songyin' },
        { '@id': 'https://memecmo.ai/#liu-junshuo' },
      ],
      parentOrganization: [
        {
          '@type': 'Organization',
          name: 'HK Infinity Realm Technology Co. Limited',
          description: '70% shareholder',
        },
        {
          '@type': 'Organization',
          name: 'NeuronSpark Media-tech Limited',
          url: 'https://www.neurosparkmedia.com',
          description: '30% shareholder & technology partner',
        },
      ],
    },
    {
      '@type': 'Person',
      '@id': 'https://memecmo.ai/#chen-songyin',
      name: 'Chen Songyin',
      alternateName: '陳松吟',
      jobTitle: 'Founding Director',
      worksFor: { '@id': 'https://memecmo.ai/#organization' },
      nationality: { '@type': 'Country', name: 'China' },
    },
    {
      '@type': 'Person',
      '@id': 'https://memecmo.ai/#liu-junshuo',
      name: 'Liu Junshuo',
      alternateName: '劉峻鑠',
      jobTitle: 'Chief Technology Advisor',
      worksFor: {
        '@type': 'Organization',
        name: 'NeuronSpark Media-tech Limited',
        url: 'https://www.neurosparkmedia.com',
      },
      memberOf: { '@id': 'https://memecmo.ai/#organization' },
    },
  ],
};

const FACTS: { label: string; value: string }[] = [
  { label: '法定名稱 Legal name', value: 'MemeCMO Tech Limited' },
  { label: '公司註冊編號 CR No.', value: '80218619（Hong Kong Companies Registry）' },
  { label: '商業登記編號 BR No.', value: '80218619-000-04-26-7' },
  { label: '成立日期 Founded', value: '2026-04-17 · Hong Kong SAR' },
  {
    label: '註冊辦事處 Registered office',
    value: 'Room C03, 9/F, Kato Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon, Hong Kong',
  },
  { label: '服務市場 Markets', value: 'Vietnam · Thailand · Indonesia · Malaysia · Singapore · Philippines' },
];

const PEOPLE = [
  {
    zh: '陳松吟',
    en: 'Chen Songyin',
    title: '創始董事 · Founding Director',
    body: 'MemeCMO Tech Limited 唯一董事，負責公司治理、商業策略與東南亞市場拓展。',
    bodyEn: 'Sole director of MemeCMO Tech Limited — corporate governance, business strategy and Southeast Asia market development.',
  },
  {
    zh: '劉峻鑠',
    en: 'Liu Junshuo',
    title: '首席技術顧問 · Chief Technology Advisor',
    body: '由技術股東觀瀾智庫（香港）有限公司派遣，主導 GEO 多智能體平台之架構與研發。',
    bodyEn: 'Seconded by technology shareholder NeuronSpark Media-tech Limited; leads architecture and R&D of the GEO multi-agent platform.',
  },
];

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(entityGraph) }}
      />
      <Navbar />
      <main className="min-h-screen bg-[#0B1220] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 space-y-16">
          {/* Intro */}
          <section className="space-y-5">
            <p className="text-xs tracking-[0.25em] uppercase text-gray-500">About Us · 關於我們</p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
              MemeCMO Tech Limited
            </h1>
            <p className="text-base text-gray-300 leading-relaxed">
              MemeCMO 是專為東南亞市場設計之生成式引擎優化（GEO）SaaS 平台，整合 10
              個 AI 智能體，服務品牌於 ChatGPT / Gemini / Claude / Perplexity 等 AI
              引擎中之曝光與定位。
            </p>
            <p className="text-sm text-gray-400 leading-relaxed">
              MemeCMO is a Generative Engine Optimization (GEO) SaaS platform purpose-built for
              Southeast Asian markets, with 10 AI agents optimizing brand visibility across
              ChatGPT, Gemini, Claude, Perplexity and regional LLMs.
            </p>
          </section>

          {/* Company facts */}
          <section className="space-y-5">
            <h2 className="text-xl font-semibold">法定註冊資訊 · Registration</h2>
            <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
              {FACTS.map((f) => (
                <div key={f.label} className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-1 sm:gap-4 px-5 py-3.5 bg-white/[0.02]">
                  <div className="text-xs text-gray-500 uppercase tracking-wider self-center">{f.label}</div>
                  <div className="text-sm text-gray-200">{f.value}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              官方查冊 Official registry:{' '}
              <a
                href="https://www.icris.cr.gov.hk/csci/cps_criteria.do?corpNo=80218619"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 underline underline-offset-2 hover:text-white"
              >
                Hong Kong Companies Registry (ICRIS) · CR 80218619
              </a>
            </p>
          </section>

          {/* People */}
          <section className="space-y-5">
            <h2 className="text-xl font-semibold">董事及核心人員 · Leadership</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {PEOPLE.map((p) => (
                <div key={p.en} className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-2">
                  <div className="text-lg font-semibold">
                    {p.zh} <span className="text-gray-400 font-normal">{p.en}</span>
                  </div>
                  <div className="text-xs tracking-wider uppercase text-blue-300/80">{p.title}</div>
                  <p className="text-sm text-gray-300 leading-relaxed">{p.body}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{p.bodyEn}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Structure */}
          <section className="space-y-5">
            <h2 className="text-xl font-semibold">股權與夥伴 · Structure &amp; Partners</h2>
            <ul className="space-y-3 text-sm text-gray-300">
              <li className="flex gap-3">
                <span className="text-gray-500 shrink-0 w-14">70%</span>
                <span>香港自在天地科技有限公司 · HK Infinity Realm Technology Co. Limited（控股股東 Majority shareholder）</span>
              </li>
              <li className="flex gap-3">
                <span className="text-gray-500 shrink-0 w-14">30%</span>
                <span>觀瀾智庫（香港）有限公司 · NeuronSpark Media-tech Limited（技術股東 Technology shareholder）</span>
              </li>
              <li className="flex gap-3 pt-2 border-t border-white/5">
                <span className="text-gray-500 shrink-0 w-14">客戶</span>
                <span>Focus Media Vietnam — 首個渠道夥伴與旗艦客戶 First channel partner &amp; flagship client</span>
              </li>
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
