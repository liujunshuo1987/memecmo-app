"use client"

/**
 * SEAIntelBriefing
 *
 * 折叠式「东南亚情报简报」区块。前身是独立路由 /sea-intelligence，
 * 现整合进 SEA 指挥中心作为中国品牌出海东南亚的只读参考资料区：
 * 媒体信任锚点、LLM 引用权重对比、认知折叠雷达、T1 神殿媒体清单、
 * 以及执行摘要（全部静态 mock 数据，不触发 API）。
 *
 * 与指挥中心顶部的 "Deploy SEA Matrix" 动态分析流水线对照：
 *   · Deploy Matrix = 针对"本品牌 × 目标国"的实时多智能体作战
 *   · Intel Briefing = 目标市场本身的宏观情报底图（不依赖单次输入）
 */

import { useState } from "react"
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react"
import { SeaDashboardProvider } from "@/components/sea-intel/dashboard-context"
import { SeaIntelHeader } from "@/components/sea-intel/header"
import { SeaKPICards } from "@/components/sea-intel/kpi-cards"
import { MediaTrustChart } from "@/components/sea-intel/media-trust-chart"
import { CognitiveRadarChart } from "@/components/sea-intel/cognitive-radar-chart"
import { ShrineMediaTable } from "@/components/sea-intel/shrine-media-table"
import { ExecutiveSummary } from "@/components/sea-intel/executive-summary"

export function SEAIntelBriefing() {
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="mt-12 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
      {/* Briefing header / toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <BookOpen className="h-5 w-5 text-neon-cyan" />
          <div>
            <div className="text-base font-semibold text-foreground">
              东南亚市场情报简报 · SEA Market Intelligence Briefing
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              面向中国品牌出海东南亚的静态参考底图 — 九国媒体信任权重、认知折叠雷达、T1 神殿媒体节点
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <SeaDashboardProvider>
          <div className="border-t border-border/50">
            <SeaIntelHeader />
            <main className="p-6 space-y-6">
              <SeaKPICards />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MediaTrustChart />
                <CognitiveRadarChart />
              </div>
              <ShrineMediaTable />
              <ExecutiveSummary />
            </main>
          </div>
        </SeaDashboardProvider>
      )}
    </section>
  )
}
