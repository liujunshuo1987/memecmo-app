'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TriangleAlert as AlertTriangle, Mail, User, X } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

interface ScanLog {
  type: 'System' | 'API' | 'Compute' | 'Render';
  message: string;
}

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
  scan_id?: string;
}

export default function AIVisibilityScanner() {
  const { t } = useLanguage();
  const [brandName, setBrandName] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [currentLogIndex, setCurrentLogIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [auditData, setAuditData] = useState<AuditResult | null>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const clearAllTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const scanLogs: ScanLog[] = [
    { type: 'System', message: t('visibilityScanner.log1') },
    { type: 'API', message: t('visibilityScanner.log2') },
    { type: 'API', message: t('visibilityScanner.log3') },
    { type: 'Compute', message: t('visibilityScanner.log4') },
    { type: 'Render', message: t('visibilityScanner.log5') },
  ];

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName || !competitor || !keywords) return;

    clearAllTimers();

    setIsScanning(true);
    setCurrentLogIndex(0);
    setProgress(0);
    setShowResult(false);
    setAuditData(null);

    const logInterval = 1500;
    const totalDuration = 10000;

    scanLogs.forEach((_, index) => {
      const id = setTimeout(() => {
        setCurrentLogIndex(index + 1);
      }, logInterval * (index + 1));
      timersRef.current.push(id);
    });

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return prev + 1;
      });
    }, totalDuration / 100);
    timersRef.current.push(progressTimer);

    const apiPromise = fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brandName,
        competitorName: competitor,
        keyword: keywords,
      }),
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error('API Error:', error);
        return null;
      });

    const [apiResult] = await Promise.all([
      apiPromise,
      new Promise((resolve) => {
        const id = setTimeout(resolve, totalDuration);
        timersRef.current.push(id);
      }),
    ]);

    if (apiResult && !apiResult.error) {
      setAuditData(apiResult);
    }

    setIsScanning(false);
    setShowResult(true);
  };

  const handleShowLeadForm = () => {
    setShowLeadForm(true);
  };

  const handleSubmitLeadForm = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scanId: auditData?.scan_id || null,
          name,
          email,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`${t('visibilityScanner.successMessage').replace('{email}', email)}`);
        clearAllTimers();
        setShowLeadForm(false);
        setBrandName('');
        setCompetitor('');
        setKeywords('');
        setEmail('');
        setName('');
        setShowResult(false);
        setCurrentLogIndex(0);
        setProgress(0);
        setAuditData(null);
      } else {
        alert(result.error || t('visibilityScanner.errorMessage'));
      }
    } catch (error) {
      console.error('Error submitting lead form:', error);
      alert(t('visibilityScanner.networkError'));
    }
  };

  return (
    <section id="visibility-scanner" className="py-24 bg-gradient-to-b from-[#0A0F1E]/50 to-[#0F172A]">
      <article className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-gradient-blue">{t('visibilityScanner.mainTitle')}</span>
          </h2>
          <p className="text-lg text-[#94A3B8] leading-relaxed max-w-3xl mx-auto">
            {t('visibilityScanner.mainSubtitle')}
          </p>
        </motion.header>

        <article className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.section
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A] border border-[#1E293B] rounded-2xl p-8"
          >
            <h3 className="text-2xl font-bold text-[#F8FAFC] mb-6 flex items-center gap-3">
              <Zap className="w-6 h-6 text-[#1D4ED8]" />
              {t('visibilityScanner.launchTitle')}
            </h3>

            <form onSubmit={handleStartScan} className="space-y-6">
              <div>
                <label htmlFor="brand-name" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                  {t('visibilityScanner.brandLabel')} <span className="text-[#F97316]">{t('visibilityScanner.required')}</span>
                </label>
                <input
                  type="text"
                  id="brand-name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  required
                  disabled={isScanning}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none transition-all disabled:opacity-50"
                  placeholder={t('visibilityScanner.brandPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="competitor" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                  {t('visibilityScanner.competitorLabel')} <span className="text-[#F97316]">{t('visibilityScanner.required')}</span>
                </label>
                <input
                  type="text"
                  id="competitor"
                  value={competitor}
                  onChange={(e) => setCompetitor(e.target.value)}
                  required
                  disabled={isScanning}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none transition-all disabled:opacity-50"
                  placeholder={t('visibilityScanner.competitorPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="keywords" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                  {t('visibilityScanner.keywordLabel')} <span className="text-[#F97316]">{t('visibilityScanner.required')}</span>
                </label>
                <input
                  type="text"
                  id="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  required
                  disabled={isScanning}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none transition-all disabled:opacity-50"
                  placeholder={t('visibilityScanner.keywordPlaceholder')}
                />
              </div>

              <button
                type="submit"
                disabled={isScanning}
                className="w-full px-8 py-4 bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] text-[#F8FAFC] font-bold rounded-lg hover:shadow-2xl hover:shadow-[#1D4ED8]/50 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-5 h-5" />
                {isScanning ? t('visibilityScanner.scanningButton') : t('visibilityScanner.launchButton')}
              </button>
            </form>

            <aside className="mt-6 pt-6 border-t border-[#1E293B]/50">
              <p className="text-xs text-[#94A3B8]">
                {t('visibilityScanner.disclaimer')}
              </p>
            </aside>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="bg-[#000000] border border-[#1E293B] rounded-2xl p-8 font-mono text-sm relative overflow-hidden"
          >
            <header className="flex items-center gap-2 mb-6 pb-4 border-b border-[#1E293B]">
              <div className="w-3 h-3 rounded-full bg-[#F97316]" />
              <div className="w-3 h-3 rounded-full bg-[#FBBF24]" />
              <div className="w-3 h-3 rounded-full bg-[#10B981]" />
              <span className="ml-3 text-[#94A3B8] text-xs">{t('visibilityScanner.terminalTitle')}</span>
            </header>

            <article className="min-h-[400px] space-y-3">
              {!isScanning && !showResult && (
                <p className="text-[#94A3B8] animate-pulse">
                  {t('visibilityScanner.waitingMessage')}
                </p>
              )}

              <AnimatePresence>
                {isScanning &&
                  scanLogs.slice(0, currentLogIndex).map((log, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5 }}
                      className="flex items-start gap-3"
                    >
                      <span className="text-[#1D4ED8] flex-shrink-0">[{log.type}]</span>
                      <span className="text-[#F8FAFC]">{log.message}</span>
                    </motion.div>
                  ))}
              </AnimatePresence>

              {isScanning && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-6 pt-4 border-t border-[#1E293B]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#94A3B8] text-xs">{t('visibilityScanner.scanProgress')}</span>
                    <span className="text-[#1D4ED8] text-xs font-bold">{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#1E293B] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#1D4ED8] to-[#60A5FA]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </motion.div>
              )}

              {showResult && !auditData && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[#EF4444] mt-6 p-4 border border-[#EF4444]/30 rounded-lg bg-[#EF4444]/5"
                >
                  <p className="text-sm">{t('visibilityScanner.scanFailed') || '扫描请求失败，请重试'}</p>
                </motion.div>
              )}

              {showResult && auditData && (
                <motion.article
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="bg-gradient-to-br from-[#F97316]/10 to-transparent border-2 border-[#F97316] rounded-xl p-6 mt-6"
                >
                  <header className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-[#F97316] flex-shrink-0 mt-1" />
                    <div>
                      <h4 className="text-lg font-bold text-[#F97316] mb-2">
                        {t('visibilityScanner.alertTitle')}
                      </h4>
                      <p className="text-[#F8FAFC] leading-relaxed">
                        {t('visibilityScanner.systemDetected')} <strong className="text-[#F97316]">{auditData.audit_results.fatal_corpus_gaps.length} {t('visibilityScanner.alertMessage')}</strong>
                      </p>
                    </div>
                  </header>

                  <div className="bg-[#0F172A]/50 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[#94A3B8]">{t('visibilityScanner.baselineScore')}</span>
                      <span className="text-2xl font-bold text-[#F97316]">{auditData.audit_results.AIGVR_score}%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[#94A3B8] mb-1">{t('visibilityScanner.brandShare')}</p>
                        <p className="text-[#F97316] font-bold">{auditData.audit_results.SoA_comparison.brand_share}%</p>
                      </div>
                      <div>
                        <p className="text-[#94A3B8] mb-1">{t('visibilityScanner.competitorShare')}</p>
                        <p className="text-[#10B981] font-bold">{auditData.audit_results.SoA_comparison.competitor_share}%</p>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-2 mb-6 text-[#94A3B8] text-xs">
                    {auditData.audit_results.fatal_corpus_gaps.map((gap, index) => (
                      <li key={index}>• {gap}</li>
                    ))}
                  </ul>

                  <button
                    onClick={handleShowLeadForm}
                    className="w-full px-6 py-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] text-[#F8FAFC] font-bold rounded-lg hover:shadow-xl hover:shadow-[#F97316]/50 transition-all duration-300"
                  >
                    {t('visibilityScanner.getReportButton')}
                  </button>
                </motion.article>
              )}
            </article>
          </motion.section>
        </article>
      </article>

      <AnimatePresence>
        {showLeadForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setShowLeadForm(false)}
          >
            <motion.article
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] border-2 border-[#F97316] rounded-2xl p-8 max-w-md w-full relative"
            >
              <button
                onClick={() => setShowLeadForm(false)}
                className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <header className="mb-6">
                <h3 className="text-2xl font-bold text-[#F8FAFC] mb-2">{t('visibilityScanner.formTitle')}</h3>
                <p className="text-sm text-[#94A3B8]">
                  {t('visibilityScanner.formSubtitle')}
                </p>
              </header>

              <form onSubmit={handleSubmitLeadForm} className="space-y-4">
                <div>
                  <label htmlFor="lead-name" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                    {t('visibilityScanner.nameLabel')} <span className="text-[#F97316]">{t('visibilityScanner.required')}</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                    <input
                      type="text"
                      id="lead-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 outline-none transition-all"
                      placeholder={t('visibilityScanner.namePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="lead-email" className="block text-sm font-semibold text-[#F8FAFC] mb-2">
                    {t('visibilityScanner.emailLabel')} <span className="text-[#F97316]">{t('visibilityScanner.required')}</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                    <input
                      type="email"
                      id="lead-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-lg text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 outline-none transition-all"
                      placeholder={t('visibilityScanner.emailPlaceholder')}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full px-8 py-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] text-[#F8FAFC] font-bold rounded-lg hover:shadow-2xl hover:shadow-[#F97316]/50 transition-all duration-300"
                >
                  {t('visibilityScanner.submitButton')}
                </button>
              </form>

              <aside className="mt-4 pt-4 border-t border-[#1E293B]/50">
                <p className="text-xs text-[#94A3B8] text-center">
                  {t('visibilityScanner.privacyNote')}
                </p>
              </aside>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
