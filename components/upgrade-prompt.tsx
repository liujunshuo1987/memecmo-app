'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/language-context';

interface UpgradePromptProps {
  quotaType: string;
  used: number;
  limit: number;
}

export default function UpgradePrompt({ quotaType, used, limit }: UpgradePromptProps) {
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/80 backdrop-blur-sm px-4"
    >
      <div className="w-full max-w-md bg-[#1E293B] border border-[#334155] rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-[#F8FAFC] mb-2">
          {t('upgrade.quotaExceeded')}
        </h2>
        <p className="text-sm text-[#94A3B8] mb-2">
          {t('upgrade.quotaMessage').replace('{type}', quotaType)}
        </p>
        <p className="text-xs text-[#64748B] mb-6">
          {used} / {limit} {t('upgrade.used')}
        </p>
        <Link href="/pricing">
          <Button className="w-full bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] text-[#F8FAFC] font-semibold rounded-xl py-3 hover:shadow-lg hover:shadow-[#1D4ED8]/30">
            <ArrowUpRight className="w-4 h-4 mr-2" />
            {t('upgrade.viewPlans')}
          </Button>
        </Link>
        <Link
          href="/dashboard"
          className="block mt-3 text-sm text-[#64748B] hover:text-[#94A3B8] transition-colors"
        >
          {t('upgrade.backToDashboard')}
        </Link>
      </div>
    </motion.div>
  );
}
