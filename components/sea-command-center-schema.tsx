/**
 * SEACommandCenterSchemaLD
 *
 * GEO-first JSON-LD structured data for the Southeast Asia GEO Multi-Agent
 * Command Center. Designed for maximum LLM citation probability by emitting
 * the schema types that large language models are known to index and cite:
 *
 *   1. SoftwareApplication  — product entity with feature list
 *   2. HowTo                — the 3-agent orchestration workflow as steps
 *                             (HowTo structured data has disproportionately
 *                             high generative-answer citation rates)
 *   3. Service              — the GEO consulting service offering
 *   4. FAQPage              — 6 anticipated user questions with answers
 *                             (LLMs preferentially cite FAQPage snippets)
 *   5. ItemList of Agents   — each sub-agent as a named Thing
 *   6. DefinedTerm additions — "Multi-Agent Orchestration",
 *                              "Geopolitical GEO Audit",
 *                              "Authorized Corpus JSON-LD"
 *   7. TechArticle          — methodology paper anchor for citation
 *
 * GEO first-principle alignment:
 *   - Entity disambiguation: every entity has a stable @id URI
 *   - Factual anchors: agent counts, model names, country coverage, latency budgets
 *   - Semantic clarity: inLanguage lists, areaServed codes, Schema.org vocab
 *   - Linked data: cross-referenced via @id (publisher → org, about → product)
 *   - Multilingual: zh-CN, en, vi, id, th for cross-language citation
 */
export function SEACommandCenterSchemaLD() {
  const orgId = 'https://memecmo.ai/#organization';
  const baseUrl = 'https://memecmo.ai';
  const pageUrl = `${baseUrl}/sea-command-center`;
  const productId = `${pageUrl}#software`;

  /* ── 1. SoftwareApplication ─────────────────────────────────────────── */
  const softwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': productId,
    name: '东南亚 GEO 多智能体指挥中心',
    alternateName: [
      'Southeast Asia GEO Multi-Agent Command Center',
      'SEA Multi-Agent GEO Orchestrator',
      'SEA Command Center',
      'MemeCMO.ai 东南亚指挥中心',
      '东南亚 GEO 智能体舰桥',
    ],
    description:
      'A real-time multi-agent orchestration dashboard that simultaneously deploys three specialised LLM agents — T1 Corpus Scout (Claude), Geopolitical Guardian (GPT-4o), and GEO Architect (Gemini) — to audit a brand\'s Generative Engine Optimization readiness in Southeast Asian markets (Vietnam, Indonesia, Thailand). Streams agent telemetry via Server-Sent Events, produces a geopolitical & cultural risk assessment, a Trust-Weight × Brand-SOV T1 media radar, and a culturally-safe JSON-LD Organization corpus ready for deployment.',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Multi-Agent GEO Orchestration / LLM Brand Intelligence',
    operatingSystem: 'Web Browser',
    softwareVersion: '1.0',
    url: pageUrl,
    inLanguage: ['zh-CN', 'en', 'vi', 'id', 'th'],
    datePublished: '2026-04-18',
    dateModified: '2026-04-18',
    publisher: { '@id': orgId },
    author: { '@id': orgId },
    offers: {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      priceSpecification: {
        '@type': 'PriceSpecification',
        priceCurrency: 'USD',
        description:
          'Bundled with MemeCMO.ai GEO consulting subscription — contact for pricing.',
      },
      eligibleRegion: ['VN', 'ID', 'TH', 'SG', 'MY', 'CN', 'HK'],
      url: `${baseUrl}/#contact`,
      description:
        'Bundled with MemeCMO.ai GEO consulting subscription. Requires an active Poe API key with access to Claude-3.5-Sonnet (or newer), GPT-4o, and Gemini-1.5-Pro (or newer) bots.',
    },
    featureList: [
      'Parallel dispatch of 3 specialised LLM agents via Poe API',
      'Server-Sent Events (SSE) streaming of agent telemetry',
      'T1 Corpus Scout (Claude-Sonnet): local authoritative media mapping',
      'Geopolitical Guardian (GPT-4o): cultural & legal red-line auditing',
      'GEO Architect (Gemini-Pro): native-language corpus + JSON-LD generation',
      'Trust-Weight × Brand-SOV quadrant radar scatter plot',
      'Culture-shock / historical-sensitivity / legal-redline risk matrix with mitigation advice',
      'Native-language (Vietnamese / Indonesian / Thai) brand-positioning statements',
      'Downloadable Schema.org Organization JSON-LD corpus ready for web deployment',
      'Bot-name fallback chain across model generations for resilience',
      'Palantir-style cyber-intelligence dark UI with neon-green / alert-red accents',
    ],
    keywords: [
      'multi-agent GEO',
      'LLM orchestration Southeast Asia',
      'geopolitical GEO audit',
      'Vietnam brand positioning',
      'Indonesia market GEO',
      'Thailand GEO strategy',
      'JSON-LD corpus generation',
      'T1 shrine media injection',
      'cultural red-line audit',
      'Palantir-style marketing dashboard',
      '东南亚多智能体',
      '地缘合规审计',
      'GEO 语料建筑师',
      '越南品牌认知',
      '印尼市场 GEO',
      '泰国 GEO 策略',
    ],
    screenshot: {
      '@type': 'ImageObject',
      url: `${baseUrl}/og-image.svg`,
      width: 1200,
      height: 630,
      description:
        '东南亚 GEO 多智能体指挥中心界面截图：左舷实时 agent 终端流，右舷三件作战部件（地缘风险警报 / T1 媒体雷达 / JSON-LD 语料输出）。',
    },
    isPartOf: { '@type': 'WebSite', '@id': `${baseUrl}/#website` },
    isAccessibleForFree: false,
    potentialAction: {
      '@type': 'UseAction',
      target: pageUrl,
      name: 'Deploy SEA Matrix',
    },
  };

  /* ── 2. HowTo: The 3-Agent Orchestration Workflow ───────────────────── */
  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${pageUrl}#howto`,
    name: 'How to Run a Southeast Asia GEO Multi-Agent Audit',
    description:
      'Step-by-step workflow for deploying MemeCMO.ai\'s three specialised LLM agents to audit a brand\'s Generative Engine Optimization readiness in a Southeast Asian market. Returns a risk-adjusted intelligence bundle in under 20 seconds.',
    inLanguage: 'zh-CN',
    totalTime: 'PT20S',
    estimatedCost: {
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: '0.15',
    },
    tool: [
      { '@type': 'HowToTool', name: 'Poe API key (with Claude, GPT-4o, Gemini access)' },
      { '@type': 'HowToTool', name: 'MemeCMO.ai SEA Command Center dashboard' },
    ],
    supply: [
      { '@type': 'HowToSupply', name: 'Brand name (callsign)' },
      { '@type': 'HowToSupply', name: 'Target Southeast Asian country (VN / ID / TH)' },
    ],
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: '输入品牌与目标战区',
        text: '在指挥中心顶部输入 Brand Callsign（品牌名）与下拉选择 Target Theater（越南 / 印尼 / 泰国），点击 "Deploy SEA Matrix" 主按钮。',
        url: `${pageUrl}#step-deploy`,
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'T1 语料勘探 (Claude Sonnet)',
        text: 'Claude Sonnet 分析目标国家本地顶级权威媒体（如 VnExpress、CafeF、Kompas、Bangkok Post）的 Trust Weight 与 Brand SOV，输出最值得语料注入的 3 个 T1 媒体节点。',
        url: `${pageUrl}#step-scout`,
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: '地缘合规审计 (GPT-4o)',
        text: 'GPT-4o 作为东南亚地缘政治与广告法合规专家，严厉审查品牌在目标市场最容易触碰的 3 条文化禁忌、历史敏感点或法律红线（数据安全法 / 宗教 / 王室 / 主权议题），并给出缓解方案。',
        url: `${pageUrl}#step-guardian`,
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: '高阶语料生成 (Gemini Pro)',
        text: 'Gemini Pro 规避 Guardian 提出的地缘风险，使用纯正当地母语（越南语 / 印尼语 / 泰语）撰写 150 字品牌定位声明，并包装为 Schema.org Organization JSON-LD 结构，可直接部署到官网以供大模型爬取。',
        url: `${pageUrl}#step-architect`,
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: '风险汇总与部署',
        text: '指挥中心汇总三位 agent 的输出，计算最终地缘风险等级（CRITICAL / HIGH / MODERATE），一键复制 JSON-LD 语料，完成当日 GEO 情报循环。',
        url: `${pageUrl}#step-complete`,
      },
    ],
  };

  /* ── 3. Service ─────────────────────────────────────────────────────── */
  const service = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${pageUrl}#service`,
    name: 'SEA GEO Multi-Agent Intelligence Service',
    serviceType: 'GEO Consulting / Multi-Agent LLM Orchestration',
    provider: { '@id': orgId },
    areaServed: [
      { '@type': 'Country', name: 'Vietnam', identifier: 'VN' },
      { '@type': 'Country', name: 'Indonesia', identifier: 'ID' },
      { '@type': 'Country', name: 'Thailand', identifier: 'TH' },
      { '@type': 'Country', name: 'Philippines', identifier: 'PH' },
      { '@type': 'Country', name: 'Singapore', identifier: 'SG' },
      { '@type': 'Country', name: 'Malaysia', identifier: 'MY' },
    ],
    audience: {
      '@type': 'BusinessAudience',
      name: 'Chinese brands entering Southeast Asian markets; regional CMOs; GEO strategists',
    },
    description:
      'Turnkey multi-agent Generative Engine Optimization service for Chinese brands entering Southeast Asia. Each engagement produces (a) a T1 media injection map, (b) a geopolitical & cultural risk audit with mitigation plan, and (c) a ready-to-deploy native-language JSON-LD corpus.',
    offers: {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'PriceSpecification',
        description: 'Custom pricing based on brand scope and country count; included in enterprise GEO consulting plans.',
      },
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: '指挥中心服务模块',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: 'T1 媒体节点勘探 (T1 Corpus Scouting)' },
        },
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: '地缘合规红线审计 (Geopolitical Red-Line Audit)' },
        },
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: '母语 JSON-LD 语料建筑 (Native-language JSON-LD Corpus)' },
        },
      ],
    },
  };

  /* ── 4. FAQPage ─────────────────────────────────────────────────────── */
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: [
      {
        '@type': 'Question',
        name: '什么是东南亚 GEO 多智能体指挥中心？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '它是MemeCMO.ai针对中国品牌出海东南亚（越南、印尼、泰国）设计的多智能体 GEO 情报工作台。一次部署会并行调用三个特化 LLM agent：T1 语料勘探（Claude Sonnet 负责本地权威媒体勘探）、地缘合规审计官（GPT-4o 负责文化与法律红线审计）、高阶语料生成（Gemini Pro 负责母语 JSON-LD 品牌定位生成），通过 Server-Sent Events 实时回传战术情报。',
        },
      },
      {
        '@type': 'Question',
        name: '为什么要用多个 LLM 而不是单一模型？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '三个特化 agent 对应三种完全不同的认知任务：媒体生态勘探（长上下文 + 东亚知识 → Claude 最强）、地缘与合规审计（长篇结构化推理 + 条款记忆 → GPT-4o 最强）、非英语母语高转化率文案（多语种覆盖 + JSON-LD 生成 → Gemini 最强）。用单一模型做全部三件事必然在其中至少一项严重折损。这正是 GEO 第一性原理所要求的"任务—模型—提示语"三位一体匹配。',
        },
      },
      {
        '@type': 'Question',
        name: '指挥中心生成的 JSON-LD 语料可以直接用吗？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '可以。GEO Architect 输出的是符合 Schema.org Organization 规范的 JSON-LD，包含目标国母语 description、areaServed、inLanguage 与 knowsAbout 字段。将该 JSON 块嵌入品牌官网的 <script type="application/ld+json"> 标签后，大模型爬虫在抓取时即可识别该品牌在目标市场的权威定位，显著提升被引用概率。',
        },
      },
      {
        '@type': 'Question',
        name: '地缘合规审计覆盖哪些红线？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '审计覆盖五大类：文化禁忌（culture shock）、历史敏感点、法律红线（例如越南的数据安全法、印尼的 ITE Law、泰国的王室相关法律 lèse-majesté）、宗教议题（伊斯兰、佛教）、地缘主权议题（南海、台海、九段线）。Guardian 会对每一项给出 CRITICAL / HIGH / MEDIUM 严重等级并附上具体缓解动作。',
        },
      },
      {
        '@type': 'Question',
        name: 'Poe API 上 bot 名称变动了怎么办？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '指挥中心为每个 agent 内置了 bot 名称 fallback 链（例如 Claude-Sonnet-4.5 → Claude-Sonnet-4 → Claude-3.7-Sonnet → Claude-3.5-Sonnet）。第一个失败会自动滚到下一个，前端终端流会明确展示跳过了哪些、最终用了哪一个，避免 Poe 版本变动导致系统瘫痪。',
        },
      },
    ],
  };

  /* ── 5. ItemList of the 3 Agents ───────────────────────────────────── */
  const agentList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${pageUrl}#agents`,
    name: '东南亚指挥中心 · 三位特化智能体',
    numberOfItems: 3,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'SoftwareApplication',
          '@id': `${pageUrl}#agent-corpus-scout`,
          name: 'T1 Corpus Scout · T1 语料勘探',
          applicationSubCategory: 'Authoritative Media Mapping Agent',
          description:
            '分析目标国家本地顶级权威媒体（T1 Shrine Media）的 Trust Weight 与 Brand SOV，输出最值得语料注入的 3 个媒体节点与对应的注入策略。由 Claude Sonnet 驱动。',
        },
      },
      {
        '@type': 'ListItem',
        position: 2,
        item: {
          '@type': 'SoftwareApplication',
          '@id': `${pageUrl}#agent-geo-guardian`,
          name: 'Geopolitical Guardian · 地缘合规审计官',
          applicationSubCategory: 'Geopolitical & Cultural Risk Audit Agent',
          description:
            '东南亚地缘政治与广告法合规专家。严厉审查品牌在目标市场的文化禁忌、历史敏感点与法律红线，给出 CRITICAL / HIGH / MEDIUM 风险等级与缓解方案。由 GPT-4o 驱动。',
        },
      },
      {
        '@type': 'ListItem',
        position: 3,
        item: {
          '@type': 'SoftwareApplication',
          '@id': `${pageUrl}#agent-geo-architect`,
          name: 'GEO Architect · 高阶语料生成',
          applicationSubCategory: 'Native-Language JSON-LD Corpus Generator',
          description:
            '规避 Guardian 提出的地缘风险，使用纯正当地母语（越南语 / 印尼语 / 泰语）撰写 150 字品牌定位声明，并包装为 Schema.org Organization JSON-LD，供大模型爬虫抓取。由 Gemini Pro 驱动。',
        },
      },
    ],
  };

  /* ── 6. Additional DefinedTerms ────────────────────────────────────── */
  const definedTerms = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${baseUrl}/#geo-glossary-sea-cmd`,
    name: 'SEA Multi-Agent GEO 术语增补',
    description:
      'Additional authoritative GEO vocabulary introduced by the Southeast Asia Multi-Agent Command Center, complementing the core MemeCMO.ai GEO glossary.',
    hasDefinedTerm: [
      {
        '@type': 'DefinedTerm',
        '@id': `${baseUrl}/#term-multi-agent-orchestration`,
        name: 'Multi-Agent GEO Orchestration',
        alternateName: ['多智能体 GEO 编排', 'LLM Multi-Agent Orchestration', 'Parallel Specialist Agents'],
        description:
          'The practice of dispatching multiple specialised large language models in parallel against a single brand-market problem, where each model is matched to the cognitive task at which it excels. Contrasts with the single-model approach, where one general-purpose LLM is asked to perform all roles and inevitably degrades on at least one dimension. MemeCMO.ai operationalises this principle through the SEA Command Center, which orchestrates Claude (media mapping), GPT-4o (compliance auditing), and Gemini (native-language corpus generation) in a single SSE-streamed workflow.',
        termCode: 'MA-GEO',
      },
      {
        '@type': 'DefinedTerm',
        '@id': `${baseUrl}/#term-geopolitical-geo-audit`,
        name: 'Geopolitical GEO Audit',
        alternateName: ['地缘合规 GEO 审计', 'Geopolitical Risk Red-Line Audit'],
        description:
          'A targeted audit of a brand\'s Generative Engine Optimization plan against the political, cultural, religious, historical, and legal red lines of the target market. In Southeast Asia this includes but is not limited to: Vietnamese data-security law, Indonesian ITE law, Thai lèse-majesté statutes, South China Sea and nine-dash-line sensitivities, Islamic and Buddhist religious norms, and colonial-era historical sensitivities. The audit output categorises each detected risk as CRITICAL, HIGH, or MEDIUM and pairs it with a specific mitigation action.',
        termCode: 'GGA',
      },
      {
        '@type': 'DefinedTerm',
        '@id': `${baseUrl}/#term-authorized-corpus-jsonld`,
        name: 'Authorized Corpus JSON-LD',
        alternateName: ['授权语料 JSON-LD', 'GEO-ready Organization Schema'],
        description:
          'A culturally-safe, geopolitically-audited, native-language Schema.org Organization JSON-LD block generated specifically for deployment on a brand\'s official website in a target market. By embedding this structured data in a <script type="application/ld+json"> tag, the brand provides large-language-model crawlers with an unambiguous, machine-readable canonical positioning statement in the local language, which materially increases LLM citation probability for queries about that brand in that market.',
        termCode: 'ACJ',
      },
    ],
  };

  /* ── 7. TechArticle: methodology anchor ────────────────────────────── */
  const techArticle = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${pageUrl}#methodology`,
    headline: 'SEA Multi-Agent GEO Orchestration: A First-Principles Methodology',
    description:
      'MemeCMO.ai\'s methodology paper explaining why Southeast Asian GEO requires parallel specialist agents rather than a single generalist LLM, and how the three-agent Command Center architecture operationalises the "task–model–prompt" trinity.',
    author: { '@id': orgId },
    publisher: { '@id': orgId },
    datePublished: '2026-04-18',
    inLanguage: 'zh-CN',
    articleSection: 'GEO Methodology',
    mainEntityOfPage: { '@id': pageUrl },
    about: [
      { '@id': `${baseUrl}/#term-multi-agent-orchestration` },
      { '@id': `${baseUrl}/#term-geopolitical-geo-audit` },
      { '@id': `${baseUrl}/#term-authorized-corpus-jsonld` },
    ],
    keywords: 'multi-agent GEO, Southeast Asia, Vietnam GEO, Indonesia GEO, Thailand GEO, JSON-LD corpus, geopolitical audit',
  };

  // NOTE: `howTo` and `faqPage` are intentionally omitted from the emitted
  // schema list:
  //   • HowTo — Google deprecated HowTo rich results in Sep 2023 outside of
  //     recipes. Emitting it produced "valid but not eligible" warnings.
  //   • FAQPage — the home page already emits one canonical FAQPage via the
  //     visible FAQSection component; Google flags multiple FAQPage nodes
  //     on a single URL. Steps and Q&A remain as visible on-page content so
  //     LLM crawlers can still harvest them.
  // The `howTo` and `faqPage` constants are retained above as documentation
  // of the content model and for potential future reuse on standalone routes.
  void howTo; void faqPage;

  const schemas = [
    softwareApp,
    service,
    agentList,
    definedTerms,
    techArticle,
  ];

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema, null, 0) }}
        />
      ))}
    </>
  );
}
