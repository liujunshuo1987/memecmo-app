"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

const cognitiveData = [
  { axis: "价格", actual: 85, perception: 72, fullMark: 100 },
  { axis: "质量", actual: 88, perception: 45, fullMark: 100 },
  { axis: "创新", actual: 92, perception: 55, fullMark: 100 },
  { axis: "售后", actual: 78, perception: 35, fullMark: 100 },
  { axis: "信任度", actual: 80, perception: 28, fullMark: 100 },
]

export function CognitiveRadarChart() {
  return (
    <Card className="border border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          认知折叠：中国品牌在越南
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Cognitive Folding: Chinese Brands in VN — 实际能力 vs 本地认知
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={cognitiveData}>
              <PolarGrid stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: "#888", fontSize: 11 }}
                stroke="rgba(255,255,255,0.2)"
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: "#666", fontSize: 9 }}
                stroke="rgba(255,255,255,0.1)"
              />
              <Radar
                name="实际技术能力"
                dataKey="actual"
                stroke="#00d4ff"
                fill="#00d4ff"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              <Radar
                name="本地市场认知"
                dataKey="perception"
                stroke="#ff00d4"
                fill="#ff00d4"
                fillOpacity={0.2}
                strokeWidth={2}
                strokeDasharray="5 5"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 15, 25, 0.95)",
                  border: "1px solid rgba(255, 0, 212, 0.3)",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#ff00d4", fontWeight: "bold" }}
                itemStyle={{ color: "#fff" }}
                formatter={(value: number, name: string) => [`${value}%`, name]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-neon-cyan" />
            <span className="text-muted-foreground">实际技术能力</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-neon-magenta" />
            <span className="text-muted-foreground">本地市场认知 (偏差)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
