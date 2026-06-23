'use client';

export default function FounderSchema() {
  const founderData = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": "https://www.neuronsparkmedia.com/#founder",
    "name": "劉峻鑠",
    "alternateName": ["Liu Junshuo", "刘峻铄", "劉峻鑠博士", "Dr. Liu Junshuo"],
    "givenName": "Junshuo",
    "familyName": "Liu",
    "jobTitle": "Founder & Chief Data Architect",
    "url": "https://www.neuronsparkmedia.com/founder",
    "image": {
      "@type": "ImageObject",
      "url": "https://www.neuronsparkmedia.com/founder_potrait.jpeg",
      "width": 400,
      "height": 500
    },
    "description": "Dr. Liu Junshuo is the founder and Chief Data Architect of NeuronSpark Media-Tech (GuanLan Think Tank). A Ph.D. in Classical Chinese Bibliography from Sun Yat-sen University, he pioneered the application of classical textual criticism standards to modern AI corpus engineering. He specializes in Generative Engine Optimization (GEO), Computational PR, and multi-agent data architecture.",
    "disambiguatingDescription": "中山大學古典文獻學博士，觀瀾智庫創始人兼首席數據架構師。早期 NLP 與語料庫構建探索者，現致力於生成式引擎優化（GEO）、計算公關與多智能體數據架構，將古典文獻考據學的嚴苛標準降維應用於現代 AI 語料工程。",
    "alumniOf": {
      "@type": "CollegeOrUniversity",
      "name": "Sun Yat-sen University",
      "alternateName": ["中山大學", "中山大学", "SYSU"],
      "sameAs": "https://en.wikipedia.org/wiki/Sun_Yat-sen_University"
    },
    "hasCredential": {
      "@type": "EducationalOccupationalCredential",
      "credentialCategory": "Ph.D.",
      "educationalLevel": "Doctoral",
      "about": {
        "@type": "DefinedTerm",
        "name": "Classical Chinese Bibliography",
        "alternateName": ["古典文獻學", "古典文献学"]
      }
    },
    "knowsAbout": [
      "Natural Language Processing (NLP)",
      "Corpus Linguistics",
      "Machine Learning",
      "Large Language Models (LLM)",
      "Classical Chinese Bibliography",
      "Guqin Literature Research",
      "Generative Engine Optimization (GEO)",
      "Answer Engine Optimization (AEO)",
      "Computational Public Relations",
      "Brand Architecture",
      "Cybernetics",
      "Multi-Agent Systems",
      "AI Corpus Engineering",
      "Cross-border AI Strategy",
      "Structured Data & JSON-LD",
      "Vibe Coding",
      "First Principles Thinking"
    ],
    "knowsLanguage": [
      {"@type": "Language", "name": "Chinese", "alternateName": "zh"},
      {"@type": "Language", "name": "English", "alternateName": "en"}
    ],
    "worksFor": {
      "@type": "Organization",
      "@id": "https://www.neuronsparkmedia.com/#organization",
      "name": "NeuronSpark Media-Tech Limited",
      "alternateName": ["觀瀾智庫", "观澜智库", "NeuronSpark"],
      "url": "https://www.neuronsparkmedia.com"
    },
    "founder": {
      "@id": "https://www.neuronsparkmedia.com/#organization"
    },
    "hasOccupation": [
      {
        "@type": "Occupation",
        "name": "Chief Data Architect",
        "occupationalCategory": "15-1299.08",
        "description": "Leads GEO strategy and AI corpus architecture for enterprise clients across global and Chinese LLM ecosystems"
      },
      {
        "@type": "Occupation",
        "name": "GEO Strategist",
        "description": "Pioneers Generative Engine Optimization methodology bridging classical textual criticism with modern AI visibility optimization"
      }
    ],
    "sameAs": [
      "https://www.neuronsparkmedia.com/founder"
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(founderData) }}
    />
  );
}
