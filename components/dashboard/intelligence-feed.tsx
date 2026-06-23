'use client';

import { useRef, useEffect } from 'react';
import { Radio, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Info, CircleAlert as AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export interface FeedEntry {
  id: string;
  timestamp: string;
  model: string;
  question: string;
  mentioned: boolean;
  sentiment: string;
  alertLevel: string;
  summary: string;
}

const alertIcon: Record<string, React.ReactNode> = {
  low: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
  medium: <Info className="w-3.5 h-3.5 text-sky-400" />,
  high: <AlertCircle className="w-3.5 h-3.5 text-amber-400" />,
  critical: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
};

const alertBorder: Record<string, string> = {
  low: 'border-l-emerald-500/40',
  medium: 'border-l-sky-500/40',
  high: 'border-l-amber-500/40',
  critical: 'border-l-rose-500/40',
};

const sentimentBadge: Record<string, string> = {
  positive: 'bg-emerald-500/10 text-emerald-400',
  neutral: 'bg-slate-500/10 text-slate-400',
  negative: 'bg-rose-500/10 text-rose-400',
};

interface Props {
  entries?: FeedEntry[];
}

export function IntelligenceFeed({ entries = [] }: Props) {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="w-4 h-4 text-sky-400" />
        <h2 className="text-sm font-semibold text-foreground">
          {t('feed.title')}
        </h2>
        {entries.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {entries.length} records
          </span>
        )}
      </div>

      <div className="h-[340px] overflow-y-auto space-y-2 pr-1">
        {entries.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-muted-foreground animate-pulse">
              {t('feed.empty')}
            </p>
          </div>
        )}

        {entries.map((e) => (
          <div
            key={e.id}
            className={`border-l-2 ${alertBorder[e.alertLevel]} bg-secondary/30 rounded-lg px-3 py-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div className="flex items-center gap-2 mb-1">
              {alertIcon[e.alertLevel]}
              <span className="text-[10px] font-mono text-muted-foreground">
                {e.timestamp}
              </span>
              <span className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                {e.model}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${sentimentBadge[e.sentiment]}`}
              >
                {e.sentiment}
              </span>
              {e.mentioned && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                  Mentioned
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{e.question}</p>
            <p className="text-xs text-foreground/70 mt-1">{e.summary}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
