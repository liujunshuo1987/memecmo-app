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
      'MemeCMO.ai is a GEO (Generative Engine Optimization) multi-agent platform operated by NeuronSpark Media-Tech Limited. It measures and improves brand visibility across ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews — AIGVR diagnostics, schema deployment, content assets and competitive monitoring, purpose-built for brands entering Vietnam, Thailand, Indonesia, Philippines, Singapore, Malaysia.',
    slogan: 'Be the brand AI recommends — GEO for Southeast Asia',
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
  };

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': 'https://memecmo.ai/#service',
    name: 'MemeCMO.ai GEO 平台服務',
    description:
      'MemeCMO.ai 提供面向東南亞市場的生成式引擎優化（GEO）SaaS 服務：AIGVR 可見度監測、GEO 內容資產生產、官網結構化數據部署與競品監測。',
    provider: {
      '@id': 'https://memecmo.ai/#organization',
    },
    url: 'https://memecmo.ai',
    areaServed: ['VN', 'TH', 'ID', 'PH', 'SG', 'MY', 'HK'],
    serviceType: 'Software as a Service',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: '核心產品目錄',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'AIGVR 可見度監測',
            description:
              '跨 ChatGPT、Gemini、Perplexity、Claude 與 Google AI Overview 的品牌可見度五維評分、首位推薦率與競品基準',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'GEO 內容資產',
            description:
              '基於實測缺口自動生成目標語言的發佈級內容、FAQ 與標準答案庫',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: '官網 Schema 部署',
            description:
              '為官網生成可直接貼入的 schema.org JSON-LD 與 AEO 改造清單',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: '第三方媒體投放與百科',
            description:
              '基於 Source-Authority 引用索引產出媒體投遞稿、目錄提交與百科建設路徑',
          },
        },
      ],
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'B2B Enterprise',
      geographicArea: {
        '@type': 'Place',
        name: 'Southeast Asia',
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
