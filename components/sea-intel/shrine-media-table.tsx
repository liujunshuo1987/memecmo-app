"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react"

const mediaTargets = [
  { name: "CafeF", sector: "财经/商业", citationProb: "high", difficulty: "medium", stance: "neutral", stanceText: "中立偏负", trend: "down" },
  { name: "Tuoi Tre", sector: "综合新闻", citationProb: "high", difficulty: "high", stance: "negative", stanceText: "偏负面", trend: "down" },
  { name: "VnExpress", sector: "综合新闻", citationProb: "high", difficulty: "high", stance: "neutral", stanceText: "中立", trend: "neutral" },
  { name: "Thanh Nien", sector: "青年/社会", citationProb: "medium", difficulty: "medium", stance: "negative", stanceText: "偏负面", trend: "down" },
  { name: "Dan Tri", sector: "综合新闻", citationProb: "medium", difficulty: "low", stance: "neutral", stanceText: "中立偏正", trend: "up" },
  { name: "Zing News", sector: "科技/生活", citationProb: "medium", difficulty: "low", stance: "positive", stanceText: "偏正面", trend: "up" },
  { name: "Kenh14", sector: "娱乐/生活", citationProb: "low", difficulty: "low", stance: "positive", stanceText: "正面", trend: "up" },
  { name: "VietnamNet", sector: "政府/政策", citationProb: "high", difficulty: "high", stance: "neutral", stanceText: "官方中立", trend: "neutral" },
]

function getProbabilityBadge(prob: string) {
  if (prob === "high") return <Badge className="bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30">高</Badge>
  if (prob === "medium") return <Badge className="bg-neon-yellow/20 text-neon-yellow border-neon-yellow/30">中</Badge>
  return <Badge className="bg-muted text-muted-foreground border-border">低</Badge>
}

function getDifficultyBadge(diff: string) {
  if (diff === "high") return <Badge variant="outline" className="border-neon-red/50 text-neon-red">困难</Badge>
  if (diff === "medium") return <Badge variant="outline" className="border-neon-yellow/50 text-neon-yellow">中等</Badge>
  return <Badge variant="outline" className="border-neon-green/50 text-neon-green">容易</Badge>
}

function getStanceBadge(stance: string, text: string) {
  const base = "text-xs px-2 py-0.5 rounded-full"
  if (stance === "positive") return <span className={`${base} bg-neon-green/10 text-neon-green`}>{text}</span>
  if (stance === "negative") return <span className={`${base} bg-neon-red/10 text-neon-red`}>{text}</span>
  return <span className={`${base} bg-muted text-muted-foreground`}>{text}</span>
}

function getTrendIcon(trend: string) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-neon-green" />
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-neon-red" />
  return <Minus className="h-4 w-4 text-muted-foreground" />
}

export function ShrineMediaTable() {
  return (
    <Card className="border border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              T1 &quot;神殿媒体&quot; PR 注入目标清单
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Shrine Media Target List for Strategic PR Injection — 12 High-Priority Targets
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-neon-cyan/50 text-neon-cyan">
            12 目标
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">媒体名称</TableHead>
                <TableHead className="text-muted-foreground font-medium">行业领域</TableHead>
                <TableHead className="text-muted-foreground font-medium text-center">LLM 引用概率</TableHead>
                <TableHead className="text-muted-foreground font-medium text-center">注入难度</TableHead>
                <TableHead className="text-muted-foreground font-medium">当前叙事立场</TableHead>
                <TableHead className="text-muted-foreground font-medium text-center">趋势</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mediaTargets.map((media, index) => (
                <TableRow key={index} className="border-border/30 hover:bg-secondary/30 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">{media.name}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-neon-cyan cursor-pointer" />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{media.sector}</TableCell>
                  <TableCell className="text-center">{getProbabilityBadge(media.citationProb)}</TableCell>
                  <TableCell className="text-center">{getDifficultyBadge(media.difficulty)}</TableCell>
                  <TableCell>{getStanceBadge(media.stance, media.stanceText)}</TableCell>
                  <TableCell className="text-center">{getTrendIcon(media.trend)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
