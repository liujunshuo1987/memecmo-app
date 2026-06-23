'use client';

import { useState, useCallback } from 'react';
import { Rocket, Loader as Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';
import type { FeedEntry } from './intelligence-feed';

const AI_MODELS = ['GPT-4o', 'Claude-3.5', 'Gemini-Pro', 'Perplexity', 'DeepSeek-V3', 'Kimi'];

const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
const ALERT_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mockSummary(brand: string, model: string, mentioned: boolean): string {
  if (mentioned) {
    const templates = [
      `${model} directly referenced ${brand} as a leading provider in this domain.`,
      `${brand} was cited with positive authority signals by ${model}.`,
      `${model} included ${brand} in its top-3 recommendations for this query.`,
      `Strong brand recall detected — ${model} associated ${brand} with domain expertise.`,
    ];
    return randomFrom(templates);
  }
  const templates = [
    `${model} did not mention ${brand}. Competitors were featured instead.`,
    `No brand signal detected in ${model}'s response. Content gap identified.`,
    `${model} answered generically — potential opportunity for structured data injection.`,
    `${brand} was absent from ${model}'s knowledge graph for this query.`,
  ];
  return randomFrom(templates);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface Props {
  onEntry: (entry: FeedEntry) => void;
  onComplete: (count: number) => void;
}

export function MatrixEngine({ onEntry, onComplete }: Props) {
  const { t } = useI18n();
  const [brand, setBrand] = useState('');
  const [questions, setQuestions] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const run = useCallback(async () => {
    const lines = questions
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length || !brand.trim()) return;

    setRunning(true);
    const total = lines.length * AI_MODELS.length;
    setProgress({ current: 0, total });

    const supabase = createClient();
    let count = 0;

    for (let qi = 0; qi < lines.length; qi++) {
      const q = lines[qi];
      for (let mi = 0; mi < AI_MODELS.length; mi++) {
        const model = AI_MODELS[mi];
        const mentioned = Math.random() > 0.4;
        const sentiment = mentioned
          ? (Math.random() > 0.3 ? 'positive' : 'neutral')
          : randomFrom(SENTIMENTS);
        const mentionRate = mentioned
          ? Math.round(50 + Math.random() * 50)
          : Math.round(Math.random() * 30);
        const alertLevel =
          mentionRate >= 70 ? 'low' : mentionRate >= 40 ? 'medium' : mentionRate >= 15 ? 'high' : 'critical';
        const summary = mockSummary(brand, model, mentioned);

        const row = {
          brand_name: brand.trim(),
          ai_model: model,
          question_asked: q,
          mention_rate: mentionRate,
          sentiment,
          intelligence_summary: summary,
          alert_level: alertLevel,
        };

        await supabase.from('geo_sov_data').insert(row);

        count++;
        setProgress({ current: count, total });

        const entry: FeedEntry = {
          id: `${qi}-${mi}-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          model,
          question: q,
          mentioned,
          sentiment,
          alertLevel,
          summary,
        };
        onEntry(entry);

        await sleep(120 + Math.random() * 180);
      }
    }

    onComplete(count);
    setRunning(false);
  }, [brand, questions, onEntry, onComplete]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">
        {t('engine.title')}
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            {t('engine.brandLabel')}
          </label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            disabled={running}
            placeholder={t('engine.brandPlaceholder')}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sky-500/50 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            {t('engine.questionsLabel')}
          </label>
          <textarea
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            disabled={running}
            rows={8}
            placeholder={t('engine.questionsPlaceholder')}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sky-500/50 resize-none font-mono leading-relaxed disabled:opacity-50"
          />
        </div>

        {running && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('engine.progress')}</span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-300"
                style={{
                  width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        <button
          onClick={run}
          disabled={running || !brand.trim() || !questions.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 text-sm font-semibold text-white hover:from-sky-500 hover:to-cyan-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('engine.running')}
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              {t('engine.start')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
