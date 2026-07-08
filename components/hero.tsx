'use client';

import { motion } from 'framer-motion';
import { Scan, ArrowRight } from 'lucide-react';
import MemeCMOLogo from './memecmo-logo';
import { useLanguage } from '@/contexts/language-context';

export default function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1628] via-[#0d1f3c] to-[#0a1628]" />
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <MemeCMOLogo height={48} className="opacity-95" showWordmark />
          <div className="h-10 w-px bg-white/15 hidden sm:block" />
          <span className="text-xs sm:text-sm tracking-[0.15em] text-gray-500 font-light uppercase">
            Generative Engine Optimization
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight tracking-tight">
            {t('hero.title1')}
            <br />
            <span className="text-orange-400">{t('hero.title2')}</span>
            <br />
            {t('hero.title3')}
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          className="mt-8 text-lg sm:text-xl text-gray-300 max-w-3xl leading-relaxed"
        >
          {t('hero.description1')}<strong className="text-white">{t('hero.company')}</strong>
          {' ('}
          <em className="text-blue-400">{t('hero.companyEn')}</em>
          {') '}
          {t('hero.description2')}
          <span className="text-orange-400 font-medium">{t('hero.geoTerm')}</span>
          {' & '}
          <span className="text-orange-400 font-medium">{t('hero.corpusTerm')}</span>
          {t('hero.description3')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45, ease: 'easeOut' }}
          className="mt-10 flex flex-col sm:flex-row gap-4"
        >
          <a
            href="#ai-baseline"
            className="group inline-flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white font-medium px-8 py-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-blue-600/20"
          >
            <Scan className="w-5 h-5" />
            <span>{t('hero.ctaButton')}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="#services"
            className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-white font-medium px-8 py-4 rounded-xl transition-all duration-300 hover:bg-white/5"
          >
            {t('hero.learnButton')}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
