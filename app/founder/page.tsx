'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import FounderSchema from '@/components/founder-schema';
import { useLanguage } from '@/contexts/language-context';

export default function FounderPage() {
  const { t } = useLanguage();

  return (
    <>
      <FounderSchema />
      <Navbar />
      <main className="min-h-screen bg-gradient-to-b from-[#0a1628] via-slate-950 to-[#0a1628] pt-24 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-12"
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('founder.backToHome')}
            </Link>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="lg:col-span-2 flex justify-center lg:justify-start lg:sticky lg:top-28"
            >
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/30 to-cyan-600/30 rounded-2xl blur opacity-40" />
                <div className="relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-2">
                  <Image
                    src="/founder_potrait.jpeg"
                    alt={`${t('founder.name')} (${t('founder.nameEn')})`}
                    width={400}
                    height={500}
                    className="rounded-xl object-cover"
                    priority
                  />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-3 space-y-8"
            >
              <div className="space-y-3">
                <p className="text-sm font-medium text-cyan-400 tracking-wider uppercase">
                  {t('founder.role')}
                </p>
                <h1 className="text-4xl sm:text-5xl font-bold text-white">
                  {t('founder.name')}{' '}
                  <span className="text-slate-400 text-2xl font-normal ml-2">
                    ({t('founder.nameEn')})
                  </span>
                </h1>
              </div>

              <div className="space-y-6 text-slate-300 leading-relaxed">
                <p className="text-base">{t('founder.bio1')}</p>
                <p className="text-base">{t('founder.bio2')}</p>
                <p className="text-base">{t('founder.bio3')}</p>
                <p className="text-base">{t('founder.bio4')}</p>
              </div>

              <div className="pt-6 border-t border-slate-700/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('founder.education')}
                    </p>
                    <p className="text-sm text-slate-300">{t('founder.educationText')}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('founder.expertise')}
                    </p>
                    <p className="text-sm text-slate-300">{t('founder.expertiseText')}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
