"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Radio, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSovI18n } from "@/lib/sov-i18n"

type Sentiment = "positive" | "neutral" | "negative"

interface IntelligenceItem {
  id: string
  time: string
  model: "ChatGPT" | "Perplexity" | "Gemini" | "Claude"
  sentiment: Sentiment
  summary: string
}

const initialFeedData: IntelligenceItem[] = [
  { id: "1", time: "14:32:18", model: "ChatGPT", sentiment: "positive", summary: "Brand recommended as top solution for enterprise AI infrastructure needs. Mentioned alongside Google Cloud and AWS." },
  { id: "2", time: "14:31:45", model: "Perplexity", sentiment: "positive", summary: "Cited in comparison query about leading GEO optimization platforms. Ranked #1 for accuracy metrics." },
  { id: "3", time: "14:30:22", model: "Gemini", sentiment: "neutral", summary: "Mentioned in technical documentation query about API integration patterns. Neutral context." },
  { id: "4", time: "14:29:08", model: "Claude", sentiment: "positive", summary: "Recommended for real-time analytics capabilities. User asked about alternatives to legacy BI tools." },
  { id: "5", time: "14:28:33", model: "ChatGPT", sentiment: "negative", summary: "User reported latency issues in competitor comparison. Suggested alternatives including our brand." },
  { id: "6", time: "14:27:19", model: "Perplexity", sentiment: "positive", summary: "Featured in 'best practices' response for AI model monitoring. Strong positive positioning." },
]

const newItems: IntelligenceItem[] = [
  { id: "7", time: "", model: "Gemini", sentiment: "positive", summary: "Highlighted in enterprise security compliance query. Recommended for SOC2 certified solutions." },
  { id: "8", time: "", model: "Claude", sentiment: "neutral", summary: "Mentioned in pricing comparison context. Listed among mid-tier enterprise options." },
  { id: "9", time: "", model: "ChatGPT", sentiment: "positive", summary: "Strongly recommended for real-time AI monitoring. User asked about brand visibility tools." },
]

const modelColors: Record<string, string> = {
  ChatGPT: "text-chart-1",
  Perplexity: "text-chart-2",
  Gemini: "text-chart-3",
  Claude: "text-chart-4",
}

export function SovIntelligenceFeed() {
  const [feedData, setFeedData] = useState(initialFeedData)
  const [newItemId, setNewItemId] = useState<string | null>(null)
  const { t } = useSovI18n()

  const sentimentConfig: Record<Sentiment, { label: string; className: string }> = {
    positive: { label: t("positive"), className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    neutral: { label: t("neutral"), className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    negative: { label: t("negative"), className: "bg-red-500/10 text-red-400 border-red-500/20" },
  }

  useEffect(() => {
    let itemIndex = 0
    const interval = setInterval(() => {
      if (itemIndex < newItems.length) {
        const newItem = {
          ...newItems[itemIndex],
          id: `new-${Date.now()}`,
          time: new Date().toLocaleTimeString("en-US", { hour12: false }),
        }
        setNewItemId(newItem.id)
        setFeedData((prev) => [newItem, ...prev.slice(0, 9)])
        itemIndex++
        setTimeout(() => setNewItemId(null), 2000)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-chart-1/10">
              <Cpu className="w-4 h-4 text-chart-1" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                {t("liveIntelligenceFeed")}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("realTimeAIAgentMonitoring")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-chart-1/10 border border-chart-1/20">
            <Radio className="w-3 h-3 text-chart-1 animate-pulse" />
            <span className="text-xs font-medium text-chart-1">{t("live")}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[100px_120px_100px_1fr] gap-4 px-4 py-2.5 bg-secondary/50 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("time")}</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("aiModel")}</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("sentiment")}</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("intelligenceSummary")}</span>
          </div>
          <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
            {feedData.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "grid grid-cols-[100px_120px_100px_1fr] gap-4 px-4 py-3 items-center transition-colors duration-500",
                  newItemId === item.id && "bg-chart-1/5"
                )}
              >
                <span className="text-sm font-mono text-muted-foreground">{item.time}</span>
                <span className={cn("text-sm font-medium", modelColors[item.model])}>{item.model}</span>
                <Badge variant="outline" className={cn("w-fit text-xs font-medium", sentimentConfig[item.sentiment].className)}>
                  {sentimentConfig[item.sentiment].label}
                </Badge>
                <p className="text-sm text-foreground/80 truncate">{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 px-1">
          <p className="text-xs text-muted-foreground">
            {t("showingLatest")} {feedData.length} {t("intelligenceEvents")}
          </p>
          <div className="flex items-center gap-4">
            {(["positive", "neutral", "negative"] as Sentiment[]).map((key) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: key === "positive" ? "rgb(52 211 153)" : key === "neutral" ? "rgb(251 191 36)" : "rgb(248 113 113)" }} />
                <span className="text-xs text-muted-foreground">{sentimentConfig[key].label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
