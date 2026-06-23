"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingDown, TrendingUp, Target, Users, AlertTriangle } from "lucide-react"

const kpiData = [
  {
    title: "主要信任锚点",
    value: "Zalo & Facebook Groups",
    metric: "78.4%",
    subtext: "本地用户首选信息渠道",
    trend: "up",
    trendValue: "+3.2%",
    icon: Users,
    color: "neon-cyan",
  },
  {
    title: "中国品牌情绪差距",
    value: "信任赤字指数",
    metric: "-34.7%",
    subtext: "相对本地/韩国品牌",
    trend: "down",
    trendValue: "-2.1%",
    icon: AlertTriangle,
    color: "neon-magenta",
  },
  {
    title: "目标 T1 注入节点",
    value: "12 个高权重媒体",
    metric: "已识别",
    subtext: "待优化 PR 投放渠道",
    trend: "neutral",
    trendValue: "+2 新增",
    icon: Target,
    color: "neon-yellow",
  },
]

export function SeaKPICards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {kpiData.map((kpi, index) => {
        const Icon = kpi.icon
        const colorClass =
          kpi.color === "neon-cyan"
            ? "text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5"
            : kpi.color === "neon-magenta"
            ? "text-neon-magenta border-neon-magenta/30 bg-neon-magenta/5"
            : "text-neon-yellow border-neon-yellow/30 bg-neon-yellow/5"

        const iconBg =
          kpi.color === "neon-cyan"
            ? "bg-neon-cyan/10"
            : kpi.color === "neon-magenta"
            ? "bg-neon-magenta/10"
            : "bg-neon-yellow/10"

        const iconColor =
          kpi.color === "neon-cyan"
            ? "text-neon-cyan"
            : kpi.color === "neon-magenta"
            ? "text-neon-magenta"
            : "text-neon-yellow"

        return (
          <Card key={index} className={`border ${colorClass} backdrop-blur-sm`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${iconBg}`}>
                <Icon className={`h-4 w-4 ${iconColor}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-2xl font-bold font-mono text-foreground">{kpi.metric}</p>
                <p className={`text-sm font-medium ${iconColor}`}>{kpi.value}</p>
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">{kpi.subtext}</p>
                  <div className="flex items-center gap-1">
                    {kpi.trend === "up" ? (
                      <TrendingUp className="h-3 w-3 text-neon-green" />
                    ) : kpi.trend === "down" ? (
                      <TrendingDown className="h-3 w-3 text-neon-red" />
                    ) : null}
                    <span
                      className={`text-xs font-mono ${
                        kpi.trend === "up"
                          ? "text-neon-green"
                          : kpi.trend === "down"
                          ? "text-neon-red"
                          : "text-neon-cyan"
                      }`}
                    >
                      {kpi.trendValue}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
