'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useI18n } from '@/lib/i18n';

const trendData = [
  { round: 'R1', sov: 22 },
  { round: 'R2', sov: 26 },
  { round: 'R3', sov: 24 },
  { round: 'R4', sov: 30 },
  { round: 'R5', sov: 28 },
  { round: 'R6', sov: 33 },
  { round: 'R7', sov: 34.2 },
];

export function SOVTrendChart() {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">
        {t('sov.title')}
      </h2>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="sovGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(199 89% 48%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(199 89% 48%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(217 33% 17%)"
            />
            <XAxis
              dataKey="round"
              tick={{ fill: 'hsl(215 20% 65%)', fontSize: 11 }}
              axisLine={{ stroke: 'hsl(217 33% 17%)' }}
            />
            <YAxis
              domain={[0, 50]}
              tick={{ fill: 'hsl(215 20% 65%)', fontSize: 11 }}
              axisLine={{ stroke: 'hsl(217 33% 17%)' }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(222 47% 14%)',
                border: '1px solid hsl(217 33% 22%)',
                borderRadius: 8,
                fontSize: 12,
                color: 'hsl(210 40% 98%)',
              }}
              formatter={(v: number) => [`${v}%`, 'SOV']}
            />
            <Area
              type="monotone"
              dataKey="sov"
              stroke="hsl(199 89% 48%)"
              fill="url(#sovGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
