"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { useSovI18n } from "@/lib/sov-i18n"

const generateTrendData = () => {
  const data = []
  const baseDate = new Date()
  baseDate.setDate(baseDate.getDate() - 30)
  for (let i = 0; i < 30; i++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + i)
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sov: Math.floor(35 + Math.random() * 20 + i * 0.5),
      mentions: Math.floor(300 + Math.random() * 200 + i * 10),
    })
  }
  return data
}

const trendData = generateTrendData()

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl min-w-[160px]">
        <p className="text-xs text-muted-foreground mb-2 font-medium">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground capitalize">
                {entry.name === "sov" ? "SOV" : entry.name}
              </span>
            </div>
            <span className="font-semibold text-foreground">
              {entry.name === "sov" ? `${entry.value}%` : entry.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export function SovTrendChart() {
  const { t } = useSovI18n()

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">{t("brandSOVTrend")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t("shareOfVoiceLast30Days")}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-chart-1" />
              <span className="text-xs text-muted-foreground">{t("sovPercent")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-chart-3" />
              <span className="text-xs text-muted-foreground">{t("mentions")}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sovAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.7 0.18 250)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="oklch(0.7 0.18 250)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mentionsAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.7 0.18 160)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="oklch(0.7 0.18 160)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.01 280)" vertical={false} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.5 0 0)", fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.5 0 0)", fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.5 0 0)", fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip content={<CustomTooltip />} />
              <Area yAxisId="left" type="monotone" dataKey="sov" stroke="oklch(0.7 0.18 250)" strokeWidth={2} fill="url(#sovAreaGradient)" />
              <Area yAxisId="right" type="monotone" dataKey="mentions" stroke="oklch(0.7 0.18 160)" strokeWidth={2} fill="url(#mentionsAreaGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
