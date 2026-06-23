'use client';

import { motion } from 'framer-motion';
import { Globe, MapPin, ArrowRightLeft, FileJson, Database, Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

export default function DualEcosystem() {
  const { t } = useLanguage();

  return (
    <section id="ecosystem" className="py-24 bg-gradient-to-b from-[#0F172A] to-[#0A0F1E]">
      <article className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-gradient-orange">{t('dualEcosystem.title')}</span>
          </h2>
          <p className="text-lg text-[#94A3B8] leading-relaxed max-w-3xl mx-auto">
            {t('dualEcosystem.subtitle')}
          </p>
        </motion.header>

        <article className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <motion.article
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="group relative bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A] border border-[#1E293B] rounded-2xl p-8 hover:border-[#1D4ED8]/50 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#1D4ED8]/10 rounded-full blur-3xl" />

            <header className="relative z-10 flex items-start gap-4 mb-6">
              <div className="p-3 bg-[#1D4ED8]/10 rounded-xl border border-[#1D4ED8]/20">
                <Globe className="w-8 h-8 text-[#1D4ED8]" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-[#F8FAFC] mb-2">{t('dualEcosystem.outboundTitle')}</h3>
                <p className="text-sm text-[#1D4ED8] font-semibold">{t('dualEcosystem.outboundSubtitle')}</p>
              </div>
            </header>

            <section className="relative z-10 space-y-4">
              <div className="flex items-start gap-3">
                <FileJson className="w-5 h-5 text-[#60A5FA] flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-base font-semibold text-[#F8FAFC] mb-1">
                    {t('dualEcosystem.outboundFeature1Title')}
                  </h4>
                  <p className="text-sm text-[#94A3B8] leading-relaxed">
                    {t('dualEcosystem.outboundFeature1Desc')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-[#60A5FA] flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-base font-semibold text-[#F8FAFC] mb-1">
                    {t('dualEcosystem.outboundFeature2Title')}
                  </h4>
                  <p className="text-sm text-[#94A3B8] leading-relaxed">
                    {t('dualEcosystem.outboundFeature2Desc')}
                  </p>
                </div>
              </div>
            </section>

            <aside className="relative z-10 mt-6 pt-6 border-t border-[#1E293B]">
              <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span>{t('dualEcosystem.outboundCoverage')}</span>
              </div>
            </aside>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="group relative bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A] border border-[#1E293B] rounded-2xl p-8 hover:border-[#F97316]/50 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F97316]/10 rounded-full blur-3xl" />

            <header className="relative z-10 flex items-start gap-4 mb-6">
              <div className="p-3 bg-[#F97316]/10 rounded-xl border border-[#F97316]/20">
                <MapPin className="w-8 h-8 text-[#F97316]" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-[#F8FAFC] mb-2">{t('dualEcosystem.inboundTitle')}</h3>
                <p className="text-sm text-[#F97316] font-semibold">{t('dualEcosystem.inboundSubtitle')}</p>
              </div>
            </header>

            <section className="relative z-10 space-y-4">
              <div className="flex items-start gap-3">
                <FileJson className="w-5 h-5 text-[#FB923C] flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-base font-semibold text-[#F8FAFC] mb-1">
                    {t('dualEcosystem.inboundFeature1Title')}
                  </h4>
                  <p className="text-sm text-[#94A3B8] leading-relaxed">
                    {t('dualEcosystem.inboundFeature1Desc')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-[#FB923C] flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-base font-semibold text-[#F8FAFC] mb-1">
                    {t('dualEcosystem.inboundFeature2Title')}
                  </h4>
                  <p className="text-sm text-[#94A3B8] leading-relaxed">
                    {t('dualEcosystem.inboundFeature2Desc')}
                  </p>
                </div>
              </div>
            </section>

            <aside className="relative z-10 mt-6 pt-6 border-t border-[#1E293B]">
              <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span>{t('dualEcosystem.inboundCoverage')}</span>
              </div>
            </aside>
          </motion.article>
        </article>

        <motion.aside
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-r from-[#1E293B]/50 to-transparent border border-[#1E293B] rounded-xl p-6"
        >
          <div className="flex items-start gap-4">
            <Shield className="w-6 h-6 text-[#10B981] flex-shrink-0 mt-1" />
            <div>
              <h4 className="text-base font-semibold text-[#F8FAFC] mb-2 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                {t('dualEcosystem.complianceTitle')}
              </h4>
              <p className="text-sm text-[#94A3B8] leading-relaxed">
                {t('dualEcosystem.complianceDescription')}
              </p>
            </div>
          </div>
        </motion.aside>
      </article>
    </section>
  );
}
