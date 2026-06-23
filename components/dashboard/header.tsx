'use client';

import { Activity, Globe } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function Header() {
  const { t, toggle, locale } = useI18n();

  return (
    <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-background" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {t('header.title')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('header.subtitle')}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="w-3.5 h-3.5" />
          {t('header.switchLang')}
        </button>
      </div>
    </header>
  );
}
