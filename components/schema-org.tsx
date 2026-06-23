'use client';

export default function SchemaOrg() {
  const professionalServiceSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': 'https://memecmo.ai/#professional-service',
    parentOrganization: { '@id': 'https://memecmo.ai/#organization' },
    name: 'MemeCMO.ai',
    alternateName: [
      'MemeCMO',
      'MemeCMO.ai — GEO multi-agent platform',
      '觀瀾智能體庫',
      '观澜智能体库',
      'Guanlan Agent Library',
    ],
    legalName: 'NeuronSpark Media-Tech Limited',
    taxID: '79792171',
    telephone: '+852 3102-6868',
    email: 'liujunshuo1987@gmail.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '8th Floor, China Hong Kong Tower, 8-12 Hennessy Road',
      addressLocality: 'Wan Chai',
      addressRegion: 'Hong Kong',
      addressCountry: 'HK',
    },
    description:
      'MemeCMO.ai is the consumer-facing GEO (Generative Engine Optimization) multi-agent platform operated by NeuronSpark Media-Tech Limited (research arm: Guanlan Agent Library / 觀瀾智能體庫). MemeCMO.ai delivers AIGVR diagnostics, schema deployment, content seeding and competitive monitoring across ChatGPT, Perplexity, Gemini, Claude — purpose-built for brands entering Vietnam, Thailand, Indonesia, Philippines, Singapore, Malaysia.',
    disambiguatingDescription:
      'MemeCMO.ai is the product brand; Guanlan Agent Library (觀瀾智能體庫) is the R&D / research entity that develops the underlying multi-agent models. Both operate under NeuronSpark Media-Tech Limited (Hong Kong).',
    slogan: 'Bridging the AI Perception Gap Between Global and Chinese LLM Ecosystems',
    url: 'https://memecmo.ai',
    logo: {
      '@type': 'ImageObject',
      url: 'https://memecmo.ai/logo-square.svg',
      width: 512,
      height: 512,
    },
    image: {
      '@type': 'ImageObject',
      url: 'https://memecmo.ai/og-image.svg',
      width: 1200,
      height: 630,
    },
    knowsAbout: [
      'Generative Engine Optimization',
      'Computational PR',
      'Data Architecture',
      'LLM Visibility',
      'GEO',
      '生成式引擎優化',
      'AI Strategy',
      'Large Language Models',
      'Brand Recognition in AI Era',
      '計算公關',
      '大模型認知優化',
      'AI Visibility Optimization',
      'Cross-border AI Strategy',
    ],
    sameAs: [
      'https://www.linkedin.com/company/neurospark-media-tech',
      'https://twitter.com/neurosparkmedia',
    ],
  };

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': 'https://memecmo.ai/#service',
    name: 'MemeCMO.ai GEO 諮詢服務',
    description:
      'MemeCMO.ai Media-Tech 提供跨越中美大模型的生成式引擎優化（GEO）與計算公關服務，包括業務架構重構、雙生態穿透、AI基線體檢與文獻級語料工程',
    provider: {
      '@id': 'https://memecmo.ai/#organization',
    },
    url: 'https://memecmo.ai',
    areaServed: ['CN', 'US', 'HK'],
    serviceType: 'Business Consulting',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: '核心服務目錄',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: '業務架構重構',
            description:
              '基於GEO方法論，重新定義企業在AI生態中的戰略定位與業務模型',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: '雙生態穿透',
            description:
              '打通傳統搜索引擎與AI對話引擎雙生態，實現品牌認知的全域覆蓋與深度滲透',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'AI基線體檢',
            description:
              '量化評估企業在主流AI模型（OpenAI、Claude、文心一言、通義千問等）中的認知基線',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: '文獻級語料工程',
            description:
              '構建高質量、結構化的企業知識語料庫，提升AI模型對品牌的認知準確度',
          },
        },
      ],
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'B2B Enterprise',
      geographicArea: {
        '@type': 'Place',
        name: '全球',
      },
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://memecmo.ai',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'MemeCMO.ai Media-Tech',
        item: 'https://memecmo.ai/#organization',
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(professionalServiceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
