'use client';

import { TrendingUp, MessageSquare, ThumbsUp, TriangleAlert as AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface KpiItem {
  labelKey: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
  gradient: string;
}

const kpis: KpiItem[] = [
  {
    labelKey: 'kpi.sov',
    value: '34.2%',
    change: '+5.1%',
    positive: true,
    icon: <TrendingUp className="w-5 h-5" />,
    gradient: 'from-sky-500/20 to-sky-500/5',
  },
  {
    labelKey: 'kpi.mentions',
    value: '128',
    change: '+23',
    positive: true,
    icon: <MessageSquare className="w-5 h-5" />,
    gradient: 'from-emerald-500/20 to-emerald-500/5',
  },
  {
    labelKey: 'kpi.sentiment',
    value: '72%',
    change: '+8%',
    positive: true,
    icon: <ThumbsUp className="w-5 h-5" />,
    gradient: 'from-amber-500/20 to-amber-500/5',
  },
  {
    labelKey: 'kpi.alerts',
    value: '3',
    change: '-2',
    positive: false,
    icon: <AlertTriangle className="w-5 h-5" />,
    gradient: 'from-rose-500/20 to-rose-500/5',
  },
];

const accentColor: Record<string, string> = {
  'kpi.sov': 'text-sky-400',
  'kpi.mentions': 'text-emerald-400',
  'kpi.sentiment': 'text-amber-400',
  'kpi.alerts': 'text-rose-400',
};

export function KPICards() {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((k) => (
        <div
          key={k.labelKey}
          className={`relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br ${k.gradient} p-5`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className={`${accentColor[k.labelKey]}`}>{k.icon}</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                k.positive
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {k.change}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">{k.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{t(k.labelKey)}</p>
        </div>
      ))}
    </div>
  );
}
