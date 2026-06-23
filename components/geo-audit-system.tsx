'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileCode2, Copy, CircleCheck as CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

interface AuditResult {
  audit_results: {
    AIGVR_score: number;
    SoA_comparison: {
      brand_share: number;
      competitor_share: number;
    };
    sentiment_analysis: 'Positive' | 'Neutral' | 'Negative' | 'Hallucination';
    fatal_corpus_gaps: string[];
  };
}

function maskKeywords(text: string, keyword: string): string {
  const words = keyword.split(/\s+/);
  let result = text;
  words.forEach((word) => {
    if (word.length > 0) {
      const regex = new RegExp(word, 'gi');
      result = result.replace(regex, '[***]');
    }
  });
  return result;
}

function generateAuditResult(brand: string, competitor: string, keyword: string, t: (key: string) => string): AuditResult {
  const aigvrScore = Math.floor(Math.random() * 26) + 10;
  const brandShare = Math.floor(Math.random() * 20) + 5;
  const competitorShare = Math.max(100 - brandShare - Math.floor(Math.random() * 20), brandShare + 30);

  const sentiments: Array<'Positive' | 'Neutral' | 'Negative' | 'Hallucination'> =
    ['Positive', 'Neutral', 'Negative', 'Hallucination'];
  const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];

  const gapTemplates = [
    `品牌在主流大模型訓練語料中缺乏高質量[***]相關內容`,
    `競品${competitor}已建立完整的[***]語義索引，而品牌${brand}存在認知幻覺風險`,
    `未發現品牌Schema.org結構化數據標記，導致[***]實體關聯缺失`,
    `品牌在[***]領域的文獻級引用密度低於行業基準87%`,
    `檢測到品牌與[***]之間的語義鏈路斷層，AI無法建立正確關聯`,
  ];

  const gaps = gapTemplates
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(template => maskKeywords(template, keyword));

  return {
    audit_results: {
      AIGVR_score: aigvrScore,
      SoA_comparison: {
        brand_share: brandShare,
        competitor_share: competitorShare,
      },
      sentiment_analysis: sentiment,
      fatal_corpus_gaps: gaps,
    },
  };
}

export default function GEOAuditSystem() {
  const { t } = useLanguage();
  const [brandName, setBrandName] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [coreKeyword, setCoreKeyword] = useState('');
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleAudit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsProcessing(true);
    setAuditResult(null);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandName,
          competitorName,
          keyword: coreKeyword,
        }),
      });

      if (!response.ok) {
        throw new Error('審計請求失敗');
      }

      const result = await response.json();
      setAuditResult(result);
    } catch (error) {
      console.error('審計錯誤:', error);
      const fallbackResult = generateAuditResult(brandName, competitorName, coreKeyword, t);
      setAuditResult(fallbackResult);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    if (auditResult) {
      navigator.clipboard.writeText(JSON.stringify(auditResult, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'Positive':
        return 'text-[#10B981]';
      case 'Neutral':
        return 'text-[#FBBF24]';
      case 'Negative':
        return 'text-[#EF4444]';
      case 'Hallucination':
        return 'text-[#F97316]';
      default:
        return 'text-[#94A3B8]';
    }
  };

  const getScoreColor = (score: number) => {
    if (score < 15) return 'text-[#EF4444]';
    if (score < 25) return 'text-[#FBBF24]';
    return 'text-[#10B981]';
  };

  const getSentimentText = (sentiment: string) => {
    switch (sentiment) {
      case 'Hallucination':
        return t('geoAuditSystem.sentimentHallucination');
      case 'Negative':
        return t('geoAuditSystem.sentimentNegative');
      case 'Neutral':
        return t('geoAuditSystem.sentimentNeutral');
      case 'Positive':
        return t('geoAuditSystem.sentimentPositive');
      default:
        return '';
    }
  };

  const getScoreText = (score: number) => {
    if (score < 15) return t('geoAuditSystem.aigvrCritical');
    if (score < 25) return t('geoAuditSystem.aigvrWarning');
    return t('geoAuditSystem.aigvrHealthy');
  };

  return (
    <section className="py-24 bg-gradient-to-b from-[#0F172A] to-[#0A0F1E]">
      <article className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-gradient-orange">{t('geoAuditSystem.title')}</span>
          </h2>
          <p className="text-lg text-[#94A3B8] leading-relaxed max-w-3xl mx-auto">
            {t('geoAuditSystem.subtitle')}
          </p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.section
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A] border border-[#1E293B] rounded-2xl p-8"
          >
            <h3 className="text-2xl font-bold text-[#F8FAFC] mb-6 flex items-center gap-3">
              <FileCode2 className="w-6 h-6 text-[#F97316]" />
              {t('geoAuditSystem.configTitle')}
            </h3>

            <form onSubmit={handleAudit} className="space-y-6">
              <div>
                <label htmlFor="audit-brand" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                  {t('geoAuditSystem.brandLabel')} <span className="text-[#F97316]">{t('geoAuditSystem.required')}</span>
                </label>
                <input
                  type="text"
                  id="audit-brand"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  required
                  disabled={isProcessing}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 outline-none transition-all disabled:opacity-50"
                  placeholder={t('geoAuditSystem.brandPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="audit-competitor" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                  {t('geoAuditSystem.competitorLabel')} <span className="text-[#F97316]">{t('geoAuditSystem.required')}</span>
                </label>
                <input
                  type="text"
                  id="audit-competitor"
                  value={competitorName}
                  onChange={(e) => setCompetitorName(e.target.value)}
                  required
                  disabled={isProcessing}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 outline-none transition-all disabled:opacity-50"
                  placeholder={t('geoAuditSystem.competitorPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="audit-keyword" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                  {t('geoAuditSystem.keywordLabel')} <span className="text-[#F97316]">{t('geoAuditSystem.required')}</span>
                </label>
                <input
                  type="text"
                  id="audit-keyword"
                  value={coreKeyword}
                  onChange={(e) => setCoreKeyword(e.target.value)}
                  required
                  disabled={isProcessing}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 outline-none transition-all disabled:opacity-50"
                  placeholder={t('geoAuditSystem.keywordPlaceholder')}
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full px-8 py-4 bg-gradient-to-r from-[#F97316] to-[#EA580C] text-[#F8FAFC] font-bold rounded-lg hover:shadow-2xl hover:shadow-[#F97316]/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? t('geoAuditSystem.auditingButton') : t('geoAuditSystem.launchButton')}
              </button>
            </form>

            <aside className="mt-6 pt-6 border-t border-[#1E293B]/50">
              <p className="text-xs text-[#94A3B8]">
                {t('geoAuditSystem.disclaimer')}
              </p>
            </aside>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-[#000000] border border-[#1E293B] rounded-2xl p-8 font-mono text-sm relative overflow-hidden"
          >
            <header className="flex items-center justify-between mb-6 pb-4 border-b border-[#1E293B]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#F97316]" />
                <div className="w-3 h-3 rounded-full bg-[#FBBF24]" />
                <div className="w-3 h-3 rounded-full bg-[#10B981]" />
                <span className="ml-3 text-[#94A3B8] text-xs">{t('geoAuditSystem.outputTitle')}</span>
              </div>
              {auditResult && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] rounded text-xs transition-all"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                      <span>{t('geoAuditSystem.copiedButton')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>{t('geoAuditSystem.copyButton')}</span>
                    </>
                  )}
                </button>
              )}
            </header>

            <article className="min-h-[400px] overflow-auto">
              {!auditResult && !isProcessing && (
                <p className="text-[#94A3B8] animate-pulse">
                  {t('geoAuditSystem.waitingMessage')}
                </p>
              )}

              {isProcessing && (
                <div className="space-y-3">
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[#1D4ED8]"
                  >
                    {t('geoAuditSystem.log1System')}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-[#1D4ED8]"
                  >
                    {t('geoAuditSystem.log2Compute')}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="text-[#1D4ED8]"
                  >
                    {t('geoAuditSystem.log3Analysis')}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                    className="text-[#10B981]"
                  >
                    {t('geoAuditSystem.log4Render')}
                  </motion.p>
                </div>
              )}

              {auditResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <pre className="text-[#F8FAFC] leading-relaxed text-xs">
{`{
  "audit_results": {
    "AIGVR_score": `}<span className={getScoreColor(auditResult.audit_results.AIGVR_score)}>{auditResult.audit_results.AIGVR_score}</span>{`,
    "SoA_comparison": {
      "brand_share": `}<span className="text-[#EF4444]">{auditResult.audit_results.SoA_comparison.brand_share}</span>{`,
      "competitor_share": `}<span className="text-[#10B981]">{auditResult.audit_results.SoA_comparison.competitor_share}</span>{`
    },
    "sentiment_analysis": "`}<span className={getSentimentColor(auditResult.audit_results.sentiment_analysis)}>{auditResult.audit_results.sentiment_analysis}</span>{`",
    "fatal_corpus_gaps": [`}
{auditResult.audit_results.fatal_corpus_gaps.map((gap, i) =>
`      "${gap}\"${i < auditResult.audit_results.fatal_corpus_gaps.length - 1 ? ',' : ''}`
).join('\n')}
{`    ]
  }
}`}
                  </pre>
                </motion.div>
              )}
            </article>
          </motion.section>
        </div>

        {auditResult && (
          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A] border border-[#F97316] rounded-2xl p-8"
          >
            <h3 className="text-xl font-bold text-[#F8FAFC] mb-6">{t('geoAuditSystem.resultsTitle')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <p className="text-sm text-[#94A3B8]">{t('geoAuditSystem.aigvrLabel')}</p>
                <p className={`text-3xl font-bold ${getScoreColor(auditResult.audit_results.AIGVR_score)}`}>
                  {auditResult.audit_results.AIGVR_score}/35
                </p>
                <p className="text-xs text-[#64748B]">
                  {getScoreText(auditResult.audit_results.AIGVR_score)}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-[#94A3B8]">{t('geoAuditSystem.shareLabel')}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#EF4444]">
                    {auditResult.audit_results.SoA_comparison.brand_share}%
                  </span>
                  <span className="text-[#64748B]">vs</span>
                  <span className="text-2xl font-bold text-[#10B981]">
                    {auditResult.audit_results.SoA_comparison.competitor_share}%
                  </span>
                </div>
                <p className="text-xs text-[#64748B]">{t('geoAuditSystem.brandVsCompetitor')}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-[#94A3B8]">{t('geoAuditSystem.sentimentLabel')}</p>
                <p className={`text-2xl font-bold ${getSentimentColor(auditResult.audit_results.sentiment_analysis)}`}>
                  {auditResult.audit_results.sentiment_analysis}
                </p>
                <p className="text-xs text-[#64748B]">
                  {getSentimentText(auditResult.audit_results.sentiment_analysis)}
                </p>
              </div>
            </div>
          </motion.aside>
        )}
      </article>
    </section>
  );
}
