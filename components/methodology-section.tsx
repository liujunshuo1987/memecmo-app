'use client';

import { motion } from 'framer-motion';
import { BookOpen, Network, GitBranch } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

export default function MethodologySection() {
  const { t } = useLanguage();

  const methodologies = [
    {
      icon: Network,
      title: t('methodology.crossEcosystem.title'),
      subtitle: t('methodology.crossEcosystem.subtitle'),
      content: t('methodology.crossEcosystem.content'),
      keywords: t('methodology.crossEcosystem.keywords'),
    },
    {
      icon: BookOpen,
      title: t('methodology.classicalBibliography.title'),
      subtitle: t('methodology.classicalBibliography.subtitle'),
      content: t('methodology.classicalBibliography.content'),
      keywords: t('methodology.classicalBibliography.keywords'),
    },
    {
      icon: GitBranch,
      title: t('methodology.multiAgent.title'),
      subtitle: t('methodology.multiAgent.subtitle'),
      content: t('methodology.multiAgent.content'),
      keywords: t('methodology.multiAgent.keywords'),
    },
  ];

  return (
    <section className="py-32 bg-gradient-to-b from-[#0F172A] via-[#0A0F1E] to-[#020617]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="text-gradient-blue">{t('methodology.mainTitle')}</span>
          </h2>
          <p className="text-xl text-[#94A3B8] max-w-4xl mx-auto leading-relaxed">
            {t('methodology.mainSubtitle')}
          </p>
        </motion.header>

        <div className="space-y-16">
          {methodologies.map((method, index) => (
            <motion.article
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
              className="group"
            >
              <div className="bg-gradient-to-br from-[#1E293B]/60 via-[#1E293B]/40 to-transparent border border-[#334155]/50 rounded-2xl p-10 md:p-12 hover:border-[#1D4ED8]/30 transition-all duration-500">
                <header className="flex items-start gap-6 mb-8">
                  <div className="p-4 bg-gradient-to-br from-[#1D4ED8]/20 to-[#3B82F6]/10 rounded-xl border border-[#1D4ED8]/30 group-hover:border-[#1D4ED8]/60 transition-all duration-500">
                    <method.icon className="w-8 h-8 text-[#60A5FA]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight">
                      {method.title}
                    </h3>
                    <p className="text-lg text-[#60A5FA] font-medium">
                      {method.subtitle}
                    </p>
                  </div>
                </header>

                <blockquote className="border-l-4 border-[#1D4ED8]/40 pl-8 mb-8">
                  <div
                    className="text-[#CBD5E1] text-lg leading-relaxed space-y-4 methodology-content"
                    dangerouslySetInnerHTML={{ __html: method.content }}
                  />
                </blockquote>

                <footer className="flex flex-wrap gap-2 pt-6 border-t border-[#334155]/30">
                  {method.keywords.split('·').map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 text-sm font-mono text-[#60A5FA] bg-[#1D4ED8]/10 border border-[#1D4ED8]/20 rounded-md"
                    >
                      {keyword.trim()}
                    </span>
                  ))}
                </footer>
              </div>
            </motion.article>
          ))}
        </div>

        <motion.aside
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-20 p-8 bg-gradient-to-br from-[#0F172A]/80 to-[#1E293B]/40 border border-[#334155]/50 rounded-xl"
        >
          <p className="text-[#94A3B8] leading-relaxed text-center text-lg">
            {t('methodology.footer')}
          </p>
        </motion.aside>
      </div>
    </section>
  );
}
