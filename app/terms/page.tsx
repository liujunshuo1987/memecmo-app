'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Briefcase,
  UserCheck,
  Brain,
  CreditCard,
  ShieldAlert,
  Power,
  Scale,
  RefreshCw,
  Mail,
} from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { useLanguage } from '@/contexts/language-context';

const sectionIcon: Record<string, React.ReactNode> = {
  scope: <Briefcase className="w-5 h-5" />,
  eligibility: <UserCheck className="w-5 h-5" />,
  intellectual: <Brain className="w-5 h-5" />,
  fees: <CreditCard className="w-5 h-5" />,
  liability: <ShieldAlert className="w-5 h-5" />,
  termination: <Power className="w-5 h-5" />,
  governing: <Scale className="w-5 h-5" />,
  changes: <RefreshCw className="w-5 h-5" />,
};

const sections = [
  'scope',
  'eligibility',
  'intellectual',
  'fees',
  'liability',
  'termination',
  'governing',
  'changes',
] as const;

export default function TermsOfServicePage() {
  const { t, language } = useLanguage();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-b from-[#0a1628] via-slate-950 to-[#0a1628] pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('terms.backToHome')}
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                <FileText className="w-6 h-6 text-sky-400" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {t('terms.title')}
              </h1>
            </div>
            <p className="text-sm text-gray-500 mb-2">
              {t('terms.effectiveDate')}
            </p>
            <p className="text-gray-400 leading-relaxed mb-12 max-w-3xl">
              {t('terms.intro')}
            </p>
          </motion.div>

          <div className="space-y-8">
            {sections.map((section, idx) => (
              <motion.section
                key={section}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 + idx * 0.07 }}
                className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/40 rounded-2xl p-6 sm:p-8 hover:border-slate-600/50 transition-colors duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 text-sky-400 shrink-0 mt-0.5">
                    {sectionIcon[section]}
                  </div>
                  <div className="space-y-3 min-w-0">
                    <h2 className="text-lg font-semibold text-white">
                      {t(`terms.${section}.title`)}
                    </h2>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {t(`terms.${section}.body`)}
                    </p>
                    {language !== 'en' && (
                      <p className="text-xs text-gray-600 leading-relaxed border-t border-slate-700/30 pt-3 mt-3">
                        {t(`terms.${section}.bodyEn`)}
                      </p>
                    )}
                  </div>
                </div>
              </motion.section>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-12 p-6 sm:p-8 bg-slate-900/30 border border-slate-700/30 rounded-2xl text-center"
          >
            <h3 className="text-base font-semibold text-white mb-2">
              {t('terms.contact.title')}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {t('terms.contact.body')}
            </p>
            <a
              href="mailto:liujunshuo1987@gmail.com"
              className="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 transition-colors duration-200"
            >
              <Mail className="w-4 h-4" />
              liujunshuo1987@gmail.com
            </a>
          </motion.div>
        </div>
      </main>
      <Footer />
    </>
  );
}
