"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"

const mediaData = [
  { name: "VnExpress", trust: 92, citation: 88, fill: "#00d4ff" },
  { name: "CafeF", trust: 85, citation: 82, fill: "#00d4ff" },
  { name: "Zalo", trust: 78, citation: 65, fill: "#ff00d4" },
  { name: "Cốc Cốc", trust: 72, citation: 58, fill: "#ff00d4" },
  { name: "Facebook", trust: 68, citation: 72, fill: "#e6d800" },
  { name: "Tuoi Tre", trust: 88, citation: 79, fill: "#00d4ff" },
]

export function MediaTrustChart() {
  return (
    <Card className="border border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          媒体消费与 LLM 信任权重
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Media Consumption &amp; LLM Trust Weights Analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mediaData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: "#888", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 15, 25, 0.95)",
                  border: "1px solid rgba(0, 212, 255, 0.3)",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#00d4ff", fontWeight: "bold" }}
                itemStyle={{ color: "#fff" }}
                formatter={(value: number, name: string) => [
                  `${value}%`,
                  name === "trust" ? "感知信任度" : "LLM 引用权重",
                ]}
              />
              <Bar dataKey="trust" name="trust" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {mediaData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.8} />
                ))}
              </Bar>
              <Bar
                dataKey="citation"
                name="citation"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                fill="rgba(255, 255, 255, 0.3)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-neon-cyan" />
            <span className="text-muted-foreground">感知信任度</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-foreground/30" />
            <span className="text-muted-foreground">LLM 引用权重</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
