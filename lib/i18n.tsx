'use client';

import { createContext, useContext, useState, useCallback } from 'react';

type Locale = 'zh' | 'en';

const dict: Record<Locale, Record<string, string>> = {
  zh: {
    'header.title': 'AEO / GEO 矩陣引擎',
    'header.subtitle': 'MemeCMO.ai 多智能體 AI 可見性監測平台',
    'header.switchLang': 'EN',
    'kpi.sov': 'AI 聲量佔比 (SOV)',
    'kpi.mentions': '品牌提及次數',
    'kpi.sentiment': '正面情感佔比',
    'kpi.alerts': '高危預警數',
    'radar.title': '多模型 AI 可見性雷達圖',
    'sov.title': 'SOV 趨勢走勢 (近 7 輪)',
    'feed.title': 'Intelligence Feed',
    'feed.empty': '等待矩陣引擎啟動...',
    'engine.title': '矩陣引擎控制台',
    'engine.brandLabel': '目標品牌',
    'engine.brandPlaceholder': '輸入品牌名稱，例如：MemeCMO',
    'engine.questionsLabel': '測試問題集 (每行一個)',
    'engine.questionsPlaceholder': '粘貼 20 個測試問題，每行一個...',
    'engine.start': '啟動矩陣引擎',
    'engine.running': '矩陣引擎運行中...',
    'engine.progress': '進度',
    'engine.done': '測試完畢，共寫入 {count} 條記錄',
  },
  en: {
    'header.title': 'AEO / GEO Matrix Engine',
    'header.subtitle': 'MemeCMO.ai Multi-Agent AI Visibility Platform',
    'header.switchLang': '中文',
    'kpi.sov': 'AI Share of Voice',
    'kpi.mentions': 'Brand Mentions',
    'kpi.sentiment': 'Positive Sentiment',
    'kpi.alerts': 'Critical Alerts',
    'radar.title': 'Multi-Model AI Visibility Radar',
    'sov.title': 'SOV Trend (Last 7 Rounds)',
    'feed.title': 'Intelligence Feed',
    'feed.empty': 'Waiting for Matrix Engine...',
    'engine.title': 'Matrix Engine Console',
    'engine.brandLabel': 'Target Brand',
    'engine.brandPlaceholder': 'Enter brand name, e.g. MemeCMO',
    'engine.questionsLabel': 'Test Questions (one per line)',
    'engine.questionsPlaceholder': 'Paste 20 test questions, one per line...',
    'engine.start': 'Launch Matrix Engine',
    'engine.running': 'Matrix Engine Running...',
    'engine.progress': 'Progress',
    'engine.done': 'Complete. {count} records inserted.',
  },
};

interface I18nCtx {
  locale: Locale;
  toggle: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('zh');

  const toggle = useCallback(() => {
    setLocale((l) => (l === 'zh' ? 'en' : 'zh'));
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let val = dict[locale][key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          val = val.replace(`{${k}}`, String(v));
        });
      }
      return val;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, toggle, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be inside I18nProvider');
  return ctx;
}
