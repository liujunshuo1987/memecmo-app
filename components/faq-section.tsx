'use client';

import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { CircleHelp as HelpCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

export function FAQSchema() {
  const { t } = useLanguage();

  const faqData = [
    {
      question: t('faqSection.q1'),
      answer: t('faqSection.a1'),
    },
    {
      question: t('faqSection.q2'),
      answer: t('faqSection.a2'),
    },
    {
      question: t('faqSection.q3'),
      answer: t('faqSection.a3'),
    },
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer.replace(/<br\/>/g, ' ').replace(/<\/?strong>/g, ''),
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
    />
  );
}

export default function FAQSection() {
  const { t } = useLanguage();

  const faqData = [
    {
      question: t('faqSection.q1'),
      answer: t('faqSection.a1'),
    },
    {
      question: t('faqSection.q2'),
      answer: t('faqSection.a2'),
    },
    {
      question: t('faqSection.q3'),
      answer: t('faqSection.a3'),
    },
  ];

  return (
    <>
      <FAQSchema />
      <section className="py-24 bg-gradient-to-b from-[#0A0F1E] to-[#0F172A]">
        <article className="max-w-4xl mx-auto px-6 lg:px-8">
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-3 mb-6">
              <HelpCircle className="w-8 h-8 text-[#1D4ED8]" />
              <h2 className="text-4xl md:text-5xl font-bold">
                <span className="text-gradient-blue">{t('faqSection.title')}</span>
              </h2>
            </div>
            <p className="text-lg text-[#94A3B8] leading-relaxed max-w-2xl mx-auto">
              {t('faqSection.subtitle')}
            </p>
          </motion.header>

          <motion.article
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-[#1E293B]/50 to-transparent border border-[#1E293B] rounded-2xl p-8"
          >
            <Accordion type="single" collapsible className="space-y-4">
              {faqData.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border border-[#1E293B] rounded-xl bg-[#0F172A]/50 px-6 data-[state=open]:border-[#1D4ED8]/50 transition-all duration-300"
                >
                  <AccordionTrigger className="text-left text-base md:text-lg font-semibold text-[#F8FAFC] hover:text-[#1D4ED8] transition-colors py-6 hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-[#94A3B8] leading-relaxed pb-6 pt-2">
                    <div dangerouslySetInnerHTML={{ __html: faq.answer }} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.article>

          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-12 text-center"
          >
            <p className="text-sm text-[#94A3B8] mb-6">
              {t('faqSection.moreQuestions')}
            </p>
            <a
              href="mailto:liujunshuo1987@gmail.com"
              className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] text-[#F8FAFC] font-semibold rounded-lg hover:shadow-2xl hover:shadow-[#1D4ED8]/50 transition-all duration-300"
            >
              {t('faqSection.consultButton')}
            </a>
          </motion.aside>
        </article>
      </section>
    </>
  );
}
