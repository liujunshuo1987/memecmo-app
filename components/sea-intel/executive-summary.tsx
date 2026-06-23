"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, AlertTriangle, Target, Lightbulb } from "lucide-react"

interface SummarySection {
  icon: React.ReactNode
  title: string
  content: string
  accent: "cyan" | "magenta" | "yellow" | "green"
}

const summarySections: SummarySection[] = [
  {
    icon: <FileText className="h-5 w-5" />,
    title: "情报概述",
    content:
      "本周期内，越南数字媒体生态呈现高度碎片化特征。VnExpress 与 Zalo 双渠道垄断了约 62% 的消费者决策入口。LLM 爬虫分析显示，主流 AI 模型在回答越南市场相关问题时，对 CafeF 财经内容的引用权重持续攀升（+18.3% MoM）。",
    accent: "cyan",
  },
  {
    icon: <AlertTriangle className="h-5 w-5" />,
    title: "风险预警",
    content:
      "中国品牌在「质量认知」与「售后信任」两个维度存在显著认知折叠（Cognitive Folding Gap > 25pts）。当地消费者实际体验反馈与 AI 生成内容中的品牌叙事存在系统性偏差，需优先修复 T1 神殿媒体的叙事锚点。",
    accent: "magenta",
  },
  {
    icon: <Target className="h-5 w-5" />,
    title: "行动建议",
    content:
      "建议优先注入 VnExpress 与 Tuoi Tre 的内容管道，预计可在 6-8 周内实现 LLM 引用概率提升 12-15%。同步启动 Zalo 社群的 KOL 矩阵建设，以对冲潜在的平台算法波动风险。",
    accent: "yellow",
  },
  {
    icon: <Lightbulb className="h-5 w-5" />,
    title: "战略洞察",
    content:
      "越南市场正处于「AI 原生消费者」崛起的临界点。Z 世代用户对 AI 助手推荐的信任度已超越传统搜索引擎。抢占 LLM 训练语料的「神殿媒体」将成为未来 3-5 年品牌认知战的核心战场。",
    accent: "green",
  },
]

const accentColors = {
  cyan: { border: "border-l-neon-cyan", icon: "text-neon-cyan" },
  magenta: { border: "border-l-neon-magenta", icon: "text-neon-magenta" },
  yellow: { border: "border-l-neon-yellow", icon: "text-neon-yellow" },
  green: { border: "border-l-neon-green", icon: "text-neon-green" },
}

export function ExecutiveSummary() {
  return (
    <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
            <span className="text-neon-cyan">///</span>
            执行层结论摘要
            <span className="text-xs font-normal text-muted-foreground ml-2">
              EXECUTIVE INTELLIGENCE BRIEF
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-1 bg-neon-cyan/10 text-neon-cyan rounded border border-neon-cyan/30">
              机密等级: INTERNAL
            </span>
            <span className="px-2 py-1 bg-secondary rounded border border-border/50">
              报告周期: W15-2026
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summarySections.map((section, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg bg-secondary/30 border border-border/30 border-l-4 ${accentColors[section.accent].border} hover:bg-secondary/50 transition-colors duration-200`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${accentColors[section.accent].icon}`}>{section.icon}</div>
                <div className="flex-1 space-y-2">
                  <h4 className="font-medium text-foreground text-sm">{section.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 mt-4 border-t border-border/30">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">综合评估:</span>
              <span className="px-3 py-1.5 bg-neon-yellow/10 text-neon-yellow rounded-full border border-neon-yellow/30 font-medium">
                中高优先级介入窗口
              </span>
              <span className="text-muted-foreground">建议响应周期: 14 工作日内</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>分析师: 观澜 GEO-VIET 小组</span>
              <span className="text-border">|</span>
              <span>审核: L3 通过</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
