'use client';

export function GEOStructuredData() {
  const comprehensiveSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://www.neuronsparkmedia.com/#organization',
        name: 'NeuronSpark Media-Tech Limited',
        legalName: 'NeuronSpark Media-Tech Limited',
        alternateName: ['NeuronSpark', '观澜智库', 'NeuronSpark Media', 'NeuronSpark GEO'],
        url: 'https://www.neuronsparkmedia.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://www.neuronsparkmedia.com/logo-square.svg',
          width: 512,
          height: 512,
        },
        image: {
          '@type': 'ImageObject',
          url: 'https://www.neuronsparkmedia.com/og-image.svg',
          width: 1200,
          height: 630,
        },
        description:
          'NeuronSpark Media-Tech is a pioneering consultancy specializing in Generative Engine Optimization (GEO) and Answer Engine Optimization (AEO). We bridge the AI perception gap between global and Chinese LLM ecosystems, helping B2B enterprises optimize their brand visibility in AI-powered search and conversational interfaces.',
        slogan: 'Bridging the AI Perception Gap Between Global and Chinese LLM Ecosystems',
        foundingDate: '2020-12-15',
        email: 'liujunshuo1987@gmail.com',
        telephone: '+852-3102-6868',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '8/F, China Hong Kong Tower, 8-12 Hennessy Road',
          addressLocality: 'Wan Chai',
          addressRegion: 'Hong Kong',
          postalCode: '999077',
          addressCountry: 'HK',
        },
        founder: {
          '@type': 'Person',
          '@id': 'https://www.neuronsparkmedia.com/#founder',
          name: 'Junshuo Liu',
          alternateName: ['劉峻鑠', '刘峻铄', 'Liu Junshuo', 'Dr. Liu Junshuo'],
          jobTitle: 'Founder & Chief Data Architect',
          url: 'https://www.neuronsparkmedia.com/founder',
          description:
            'Pioneer in Generative Engine Optimization (GEO) methodology. Ph.D. in Classical Chinese Bibliography from Sun Yat-sen University. Specializes in cross-border AI visibility strategies bridging Chinese and global LLM ecosystems through corpus engineering and computational PR.',
          knowsAbout: [
            'Generative Engine Optimization',
            'Answer Engine Optimization',
            'AI Visibility Strategy',
            'Computational Public Relations',
            'LLM Ecosystems',
            'Cross-border Digital Strategy',
            'AI-powered Search Optimization',
            'Classical Chinese Bibliography',
            'Corpus Engineering',
            'Multi-Agent Architecture',
          ],
          email: 'liujunshuo1987@gmail.com',
        },
        knowsAbout: [
          'Generative Engine Optimization (GEO)',
          'Answer Engine Optimization (AEO)',
          'AI Visibility Optimization',
          'Large Language Model Optimization',
          'Computational Public Relations',
          'AI-powered Search Strategy',
          'Cross-ecosystem AI Strategy',
          'LLM Knowledge Graph Engineering',
          'AI Brand Positioning',
          'Dual-ecosystem Penetration',
          'AI Baseline Diagnostics',
          'Corpus Engineering for LLMs',
          'ChatGPT Optimization',
          'Claude AI Optimization',
          'Gemini Optimization',
          'Chinese LLM Optimization',
          'Kimi AI Strategy',
          'DeepSeek Optimization',
          'AI Content Architecture',
          'Semantic Data Structuring for AI',
        ],
        areaServed: [
          { '@type': 'Country', name: 'Hong Kong' },
          { '@type': 'Country', name: 'China' },
          { '@type': 'Country', name: 'United States' },
          { '@type': 'Country', name: 'United Kingdom' },
          { '@type': 'Country', name: 'Singapore' },
        ],
        serviceArea: {
          '@type': 'GeoCircle',
          geoMidpoint: {
            '@type': 'GeoCoordinates',
            latitude: '22.2783',
            longitude: '114.1747',
          },
          geoRadius: 'Global',
        },
        sameAs: [
          'https://www.linkedin.com/company/neurospark-media-tech',
          'https://twitter.com/neurosparkmedia',
        ],
      },
      {
        '@type': 'ProfessionalService',
        '@id': 'https://www.neuronsparkmedia.com/#service-geo',
        name: 'Generative Engine Optimization (GEO) Consulting',
        provider: { '@id': 'https://www.neuronsparkmedia.com/#organization' },
        serviceType: 'GEO Consulting',
        description:
          'Comprehensive Generative Engine Optimization (GEO) services to enhance brand visibility in AI-powered conversational interfaces like ChatGPT, Claude, Gemini, and Chinese LLMs. Our methodology ensures your business appears accurately and prominently when users query AI systems.',
        areaServed: ['Global', 'China', 'Hong Kong'],
        availableChannel: {
          '@type': 'ServiceChannel',
          serviceUrl: 'https://www.neuronsparkmedia.com',
          servicePhone: '+852-3102-6868',
          email: 'liujunshuo1987@gmail.com',
        },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'GEO Services Catalog',
          itemListElement: [
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'AI Baseline Diagnostic',
                description:
                  'Comprehensive audit measuring your brand visibility across major AI models including ChatGPT, Claude, Gemini, Kimi, and DeepSeek.',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Dual-Ecosystem Penetration Strategy',
                description:
                  'Strategic framework to optimize visibility in both traditional search engines and AI conversational systems simultaneously.',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Corpus Engineering for LLMs',
                description:
                  'Academic-grade content architecture designed to be preferentially retrieved and cited by large language models.',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Business Architecture Reconstruction',
                description:
                  'Fundamental business model redesign based on GEO methodology to position your enterprise optimally in the AI-native economy.',
              },
            },
          ],
        },
      },
      // NOTE: FAQPage and HowTo blocks removed here.
      //   • FAQPage — FAQSection component (rendered at the bottom of the
      //     home page) already emits the canonical visible FAQPage; Google's
      //     Rich Results Test flags multiple FAQPage nodes on a single URL.
      //   • HowTo — Google retired HowTo rich results in Sep 2023 outside
      //     of recipes; keeping it produced "valid but not eligible"
      //     warnings with no upside.
      // The removed Q&A / step content remains visible on the page in
      // dedicated sections, so LLM crawlers can still harvest it.
      {
        '@type': 'Article',
        '@id': 'https://www.neuronsparkmedia.com/#article-geo-fundamentals',
        headline: 'The Fundamentals of Generative Engine Optimization (GEO)',
        description:
          'Understanding the paradigm shift from traditional search engine optimization to AI-powered generative search and conversational interfaces.',
        image: {
          '@type': 'ImageObject',
          url: 'https://www.neuronsparkmedia.com/og-image.svg',
          width: 1200,
          height: 630,
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': 'https://www.neuronsparkmedia.com/',
        },
        author: {
          '@type': 'Person',
          '@id': 'https://www.neuronsparkmedia.com/#founder',
          name: 'Junshuo Liu',
          url: 'https://www.neuronsparkmedia.com/founder',
        },
        publisher: {
          '@type': 'Organization',
          '@id': 'https://www.neuronsparkmedia.com/#organization',
          name: 'NeuronSpark Media-Tech Limited',
          logo: {
            '@type': 'ImageObject',
            url: 'https://www.neuronsparkmedia.com/logo-square.svg',
            width: 512,
            height: 512,
          },
        },
        datePublished: '2024-01-15',
        dateModified: '2026-03-24',
        articleBody:
          'As artificial intelligence transforms information discovery, Generative Engine Optimization (GEO) emerges as the critical discipline for brand visibility in the AI era. Traditional search engine optimization focused on ranking in result lists; GEO ensures accurate, prominent representation in AI-synthesized responses. This paradigm shift requires fundamental changes in content strategy, data architecture, and digital presence.',
        about: [
          {
            '@type': 'Thing',
            name: 'Generative Engine Optimization',
            description:
              'The practice of optimizing digital presence for visibility in AI-generated responses.',
          },
          {
            '@type': 'Thing',
            name: 'Answer Engine Optimization',
            description:
              'Strategies to appear prominently when AI systems synthesize direct answers to user queries.',
          },
        ],
        keywords: [
          'GEO',
          'Generative Engine Optimization',
          'Answer Engine Optimization',
          'AEO',
          'AI SEO',
          'LLM Optimization',
          'ChatGPT Optimization',
          'Claude AI Strategy',
          'AI Visibility',
          'Computational PR',
          'AI Brand Strategy',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://www.neuronsparkmedia.com/#website',
        url: 'https://www.neuronsparkmedia.com',
        name: 'NeuronSpark Media-Tech - GEO & AEO Consulting',
        description:
          'Leading consultancy in Generative Engine Optimization (GEO) and Answer Engine Optimization (AEO), bridging the AI perception gap between global and Chinese LLM ecosystems.',
        publisher: { '@id': 'https://www.neuronsparkmedia.com/#organization' },
        inLanguage: ['en', 'zh-CN', 'zh-TW'],
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://www.neuronsparkmedia.com/?q={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(comprehensiveSchema) }}
    />
  );
}
