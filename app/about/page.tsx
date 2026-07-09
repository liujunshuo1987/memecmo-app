// About Us — the entity page. Carries the canonical Organization + Person
// JSON-LD for the MemeCMO entity (per 23_MemeCMO主頁GEO_Schema署名內容清單 §2.3/§3).
// Entity @id unified with the apex homepage on https://memecmo.ai/#org.
// Only VERIFIED facts are published — unregistered social profiles / unbuilt
// mailboxes / undecided pricing are deliberately omitted. Visible content is
// tri-lingual (zh-TW / zh-CN / en) via the site language selector — see
// about-content.tsx.

import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import AboutContent from './about-content';

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
      '@id': 'https://memecmo.ai/#org',
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
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
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
      worksFor: { '@id': 'https://memecmo.ai/#org' },
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
      memberOf: { '@id': 'https://memecmo.ai/#org' },
    },
  ],
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(entityGraph) }}
      />
      <Navbar />
      <AboutContent />
      <Footer />
    </>
  );
}
