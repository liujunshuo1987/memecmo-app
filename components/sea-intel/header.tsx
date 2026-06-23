"use client"

import { Activity, Shield, Globe, Languages } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSeaDashboard, REGIONS, LANGUAGES } from "./dashboard-context"

export function SeaIntelHeader() {
  const { region, setRegion, language, setLanguage } = useSeaDashboard()

  return (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-neon-cyan" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                neuronspark — 东南亚区域市场实地情报
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                {region.code}-Node 01 | Local Context Intelligence Dashboard
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Region Selector */}
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-neon-cyan" />
            <Select
              value={region.id}
              onValueChange={(value) => {
                const selected = REGIONS.find((r) => r.id === value)
                if (selected) setRegion(selected)
              }}
            >
              <SelectTrigger className="w-[140px] h-8 bg-secondary/50 border-border text-sm">
                <SelectValue placeholder="选择区域" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {REGIONS.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                      <span>{r.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-neon-magenta" />
            <Select
              value={language.id}
              onValueChange={(value) => {
                const selected = LANGUAGES.find((l) => l.id === value)
                if (selected) setLanguage(selected)
              }}
            >
              <SelectTrigger className="w-[150px] h-8 bg-secondary/50 border-border text-sm">
                <SelectValue placeholder="选择语言" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
                      <span>{l.nameNative}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Live Data Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-neon-green/10 border border-neon-green/30">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-green"></span>
            </span>
            <span className="text-sm font-medium text-neon-green">实时数据</span>
            <Activity className="h-3.5 w-3.5 text-neon-green" />
          </div>
        </div>
      </div>
    </header>
  )
}
