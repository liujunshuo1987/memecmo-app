"use client"

import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Target, Shield } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { useSovI18n } from "@/lib/sov-i18n"

const sparklineData = [
  { value: 2400 }, { value: 1398 }, { value: 3800 }, { value: 3908 },
  { value: 4800 }, { value: 3490 }, { value: 4300 }, { value: 5200 },
  { value: 4890 }, { value: 5670 }, { value: 6100 }, { value: 5890 },
  { value: 6340 }, { value: 7200 },
]

function CircularProgress({ value, size = 56 }: { value: number; size?: number }) {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="none" className="text-secondary" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="url(#sovGradient)" strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
        <defs>
          <linearGradient id="sovGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="oklch(0.7 0.18 160)" />
            <stop offset="100%" stopColor="oklch(0.6 0.2 300)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-foreground">{value}%</span>
      </div>
    </div>
  )
}

export function SovKPICards() {
  const { t } = useSovI18n()

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Total AI Mentions */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("totalAIMentions")} ({t("days30")})
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">12,847</span>
                <div className="flex items-center gap-1 text-emerald-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">+23.5%</span>
                </div>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-chart-1/10">
              <Target className="w-5 h-5 text-chart-1" />
            </div>
          </div>
          <div className="mt-4 h-12">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.18 250)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.7 0.18 250)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="oklch(0.7 0.18 250)" strokeWidth={2} fill="url(#sparkGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Positive Sentiment Ratio */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("positiveSentimentRatio")}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">78.4%</span>
                <div className="flex items-center gap-1 text-emerald-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">+4.2%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("aboveIndustryAvg")} (62%)</p>
            </div>
            <CircularProgress value={78} />
          </div>
        </CardContent>
      </Card>

      {/* Competitor Interception Rate */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("competitorInterceptionRate")}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">34.7%</span>
                <div className="flex items-center gap-1 text-chart-5">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">-2.1%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("queriesIntercepted")}</p>
            </div>
            <div className="p-2 rounded-lg bg-chart-2/10">
              <Shield className="w-5 h-5 text-chart-2" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-chart-2 to-chart-1" style={{ width: "34.7%" }} />
            </div>
            <span className="text-xs text-muted-foreground font-mono">34.7/100</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
