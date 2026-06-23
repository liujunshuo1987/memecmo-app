'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useI18n } from '@/lib/i18n';

const radarData = [
  { model: 'GPT-4o', brand: 78, competitor: 55 },
  { model: 'Claude', brand: 85, competitor: 60 },
  { model: 'Gemini', brand: 62, competitor: 70 },
  { model: 'Perplexity', brand: 70, competitor: 45 },
  { model: 'DeepSeek', brand: 58, competitor: 50 },
  { model: 'Kimi', brand: 45, competitor: 35 },
];

export function RadarChartSection() {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">
        {t('radar.title')}
      </h2>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="hsl(217 33% 17%)" />
            <PolarAngleAxis
              dataKey="model"
              tick={{ fill: 'hsl(215 20% 65%)', fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: 'hsl(215 20% 50%)', fontSize: 10 }}
            />
            <Radar
              name="Brand"
              dataKey="brand"
              stroke="hsl(199 89% 48%)"
              fill="hsl(199 89% 48%)"
              fillOpacity={0.25}
            />
            <Radar
              name="Competitor"
              dataKey="competitor"
              stroke="hsl(160 60% 45%)"
              fill="hsl(160 60% 45%)"
              fillOpacity={0.15}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: 'hsl(215 20% 65%)' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
