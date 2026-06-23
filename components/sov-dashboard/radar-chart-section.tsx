"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts"
import { useSovI18n } from "@/lib/sov-i18n"

const radarData = [
  { model: "ChatGPT", MEMECMO: 85, CompetitorA: 72, CompetitorB: 58 },
  { model: "Perplexity", MEMECMO: 92, CompetitorA: 65, CompetitorB: 78 },
  { model: "Gemini", MEMECMO: 78, CompetitorA: 88, CompetitorB: 62 },
]

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold text-foreground">{entry.value}%</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export function SovRadarChartSection() {
  const { t } = useSovI18n()

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              {t("aiModelPerformanceMatrix")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t("brandVisibilityAcross")}</p>
          </div>
          <div className="flex items-center gap-4">
            {[
              { name: "MEMECMO", color: "oklch(0.7 0.18 250)" },
              { name: "CompetitorA", color: "oklch(0.6 0.2 300)" },
              { name: "CompetitorB", color: "oklch(0.7 0.18 160)" },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
              <PolarGrid stroke="oklch(0.22 0.01 280)" strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="model" tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }} tickLine={false} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "oklch(0.5 0 0)", fontSize: 10 }} tickCount={5} axisLine={false} />
              <Radar name="MEMECMO" dataKey="MEMECMO" stroke="oklch(0.7 0.18 250)" fill="oklch(0.7 0.18 250)" fillOpacity={0.25} strokeWidth={2} />
              <Radar name="CompetitorA" dataKey="CompetitorA" stroke="oklch(0.6 0.2 300)" fill="oklch(0.6 0.2 300)" fillOpacity={0.15} strokeWidth={2} />
              <Radar name="CompetitorB" dataKey="CompetitorB" stroke="oklch(0.7 0.18 160)" fill="oklch(0.7 0.18 160)" fillOpacity={0.15} strokeWidth={2} />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
