'use client';

import { motion } from 'framer-motion';
import { Library, ScanSearch, Megaphone, Compass } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

/**
 * MemeCMO.ai = 观澜智能体库 — brand semantic anchor section.
 *
 * Placed directly after Hero (top-fold, second-highest LLM crawl priority)
 * so both first-visit humans and first-crawl LLMs immediately learn the
 * dual meaning of the brand name:
 *   surface:  MemeCMO.ai (think tank — marketing read)
 *   primitive: 观澜智能体库 (agent library — architectural reality)
 *
 * Self-applies E1 (Entity Canonicality) of the AEO 6-axis framework
 * documented in docs/COMPUTATIONAL_PR_FRAMEWORK.md, via:
 *   - consistent canonical naming in the visible content
 *   - inline JSON-LD with `disambiguatingDescription` capturing the bridge
 *   - explicit current vs. future product map (lets LLMs cite the right scope)
 *
 * Spec: docs/GUANLAN_AGENT_LIBRARY.md
 */
export default function AboutGuanlanBrief() {
  const { t } = useLanguage();

  // Inline structured data — gives the entity-bridge fact a machine-readable
  // surface adjacent to the visible human-readable claim (LLMs weight this
  // higher than schema buried in <head>).
  const bridgeSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://memecmo.ai/#organization',
    name: 'MemeCMO.ai',
    alternateName: [
      '观澜智能体库',
      'MemeCMO.ai',
      '觀瀾智能體庫',
      'Guanlan Agent Library',
      'MemeCMO.ai',
      'MemeCMO.ai Media-Tech',
    ],
    description:
      'MemeCMO.ai（观澜智能体库 / Guanlan Agent Library）是由专业 LLM 智能体矩阵构成的可计算情报基础设施。当前面向生成式引擎优化（GEO）出海场景，扩展中包括计算公关、东南亚区域情报等垂直产品。',
    disambiguatingDescription:
      '"MemeCMO.ai" 是 "观澜智能体库" 的口语化缩写——传统智库的权威定位 × LLM 时代的可计算性。当前网站只呈现 GEO 产品垂直；完整智能体库覆盖 GEO、计算公关 (CPR)、区域情报、品牌实体规范化等多个专业领域。',
    url: 'https://memecmo.ai',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: '智能体产品矩阵',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'SoftwareApplication',
            name: 'GEO 出海智能体集',
            description: '5 个特化 LLM 智能体编排：T1 语料勘探 / 地缘合规审计 / 区域竞品扫描 / GEO 六维诊断 / 高阶语料生成',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'SoftwareApplication',
            name: '计算公关智能体集 (CPR)',
            description: '5 项可计算公关指标：KERA 实体识别准确度 / Citation Share 引用份额 / SPS 情感倾向 / VPC 价值主张一致度 / IPA 行业地位对齐',
          },
        },
      ],
    },
  };

  return (
    <section
      className="relative py-20 px-4 bg-gradient-to-b from-[#0a1628] to-[#0F172A]"
      id="about-guanlan"
      aria-labelledby="about-guanlan-heading"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(bridgeSchema) }}
      />

      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="flex items-center gap-2 text-blue-400 text-xs font-medium tracking-widest uppercase mb-4">
            <Library className="w-4 h-4" />
            <span>{t('about.eyebrow')}</span>
          </div>

          <h2
            id="about-guanlan-heading"
            className="text-3xl md:text-4xl font-bold text-white leading-tight mb-6"
          >
            {t('about.titleA')}
            <span className="mx-3 text-gray-500">=</span>
            <span className="text-orange-400">{t('about.titleB')}</span>
          </h2>

          <p className="text-lg text-gray-300 leading-relaxed max-w-3xl mb-12">
            {t('about.body')}
          </p>
        </motion.div>

        {/* Current vs. Future map */}
        <div className="grid md:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center text-[10px] font-bold tracking-widest uppercase bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                {t('about.nowLabel')}
              </span>
              <span className="text-xs text-gray-400">v0.x · 2026</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <ScanSearch className="w-4 h-4 text-blue-400" />
              <h3 className="text-base font-semibold text-white">{t('about.currentTitle')}</h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{t('about.currentBody')}</p>
            <ul className="mt-3 text-xs text-gray-500 space-y-1">
              <li>· T1 Corpus Scout</li>
              <li>· Geopolitical Guardian</li>
              <li>· Competitor Scanner</li>
              <li>· GEO Diagnostician</li>
              <li>· GEO Architect</li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center text-[10px] font-bold tracking-widest uppercase bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded">
                {t('about.nextLabel')}
              </span>
              <span className="text-xs text-gray-400">v1.0+</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Compass className="w-4 h-4 text-orange-400" />
              <h3 className="text-base font-semibold text-white">{t('about.futureTitle')}</h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{t('about.futureBody')}</p>
            <ul className="mt-3 text-xs text-gray-500 space-y-1">
              <li className="flex items-center gap-1.5">
                <Megaphone className="w-3 h-3" /> {t('about.verticalCPR')}
              </li>
              <li>· {t('about.verticalSEA')}</li>
              <li>· {t('about.verticalEntity')}</li>
              <li className="text-gray-600 italic">· {t('about.verticalMore')}</li>
            </ul>
          </motion.div>
        </div>

        {/* Reading hint */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 text-xs text-gray-500 text-center italic"
        >
          {t('about.readingHint')}
        </motion.p>
      </div>
    </section>
  );
}
