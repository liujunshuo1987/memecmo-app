'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Cookie, Database, Eye, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { useLanguage } from '@/contexts/language-context';

const sectionIcon: Record<string, React.ReactNode> = {
  collection: <Database className="w-5 h-5" />,
  cookies: <Cookie className="w-5 h-5" />,
  usage: <Eye className="w-5 h-5" />,
  sharing: <Lock className="w-5 h-5" />,
  retention: <Shield className="w-5 h-5" />,
  rights: <Mail className="w-5 h-5" />,
};

export default function PrivacyPolicyPage() {
  const { t, language } = useLanguage();

  const sections = [
    'collection',
    'cookies',
    'usage',
    'sharing',
    'retention',
    'rights',
  ] as const;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-canvas pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-dim hover:text-ink transition-colors duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('privacy.backToHome')}
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-brand border border-brand/50">
                <Shield className="w-6 h-6 text-brand" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
                {t('privacy.title')}
              </h1>
            </div>
            <p className="text-sm text-faint mb-2">
              {t('privacy.effectiveDate')}
            </p>
            <p className="text-dim leading-relaxed mb-12 max-w-3xl">
              {t('privacy.intro')}
            </p>
          </motion.div>

          <div className="space-y-8">
            {sections.map((section, idx) => (
              <motion.section
                key={section}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 + idx * 0.07 }}
                className="relative bg-canvas backdrop-blur-sm border border-edge rounded-2xl p-6 sm:p-8 hover:border-slate-600/50 transition-colors duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-raised border border-edge text-brand shrink-0 mt-0.5">
                    {sectionIcon[section]}
                  </div>
                  <div className="space-y-3 min-w-0">
                    <h2 className="text-lg font-semibold text-ink">
                      {t(`privacy.${section}.title`)}
                    </h2>
                    <p className="text-sm text-dim leading-relaxed">
                      {t(`privacy.${section}.body`)}
                    </p>
                    {language !== 'en' && (
                      <p className="text-xs text-faint leading-relaxed border-t border-edge pt-3 mt-3">
                        {t(`privacy.${section}.bodyEn`)}
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
            className="mt-12 p-6 sm:p-8 bg-canvas border border-edge rounded-2xl text-center"
          >
            <h3 className="text-base font-semibold text-ink mb-2">
              {t('privacy.contact.title')}
            </h3>
            <p className="text-sm text-dim mb-4">
              {t('privacy.contact.body')}
            </p>
            <a
              href="mailto:liujunshuo1987@gmail.com"
              className="inline-flex items-center gap-2 text-sm text-brand hover:text-brand transition-colors duration-200"
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
