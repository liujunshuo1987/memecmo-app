"use client"

import { useState, useEffect } from "react"
import { ChevronDown, Activity, Zap } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { SovCreateCampaignModal } from "./create-campaign-modal"
import { SovLanguageSwitcher } from "./language-switcher"
import { useSovI18n } from "@/lib/sov-i18n"

const brands = [
  { id: "memecmo", name: "MEMECMO", sector: "AI Infrastructure" },
  { id: "neurospark", name: "Neurospark", sector: "Enterprise AI" },
  { id: "synthwave", name: "SynthWave", sector: "Creative AI" },
]

export function SovHeader() {
  const [selectedBrand, setSelectedBrand] = useState(brands[0])
  const [syncTime, setSyncTime] = useState<string | null>(null)
  const { t } = useSovI18n()

  useEffect(() => {
    setSyncTime(new Date().toLocaleTimeString())
  }, [])

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-chart-1 to-chart-2 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">GEO Intelligence</span>
          </div>

          <div className="h-6 w-px bg-border" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 px-3 gap-2 text-sm font-medium hover:bg-secondary">
                <span className="text-muted-foreground">{t("brand")}:</span>
                <span className="text-foreground">{selectedBrand.name}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {brands.map((brand) => (
                <DropdownMenuItem
                  key={brand.id}
                  onClick={() => setSelectedBrand(brand)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{brand.name}</span>
                  <span className="text-xs text-muted-foreground">{brand.sector}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-4">
          <SovCreateCampaignModal />
          <div className="h-6 w-px bg-border" />
          <SovLanguageSwitcher />
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">
              {t("agentStatus")}: {t("online")}
            </span>
          </div>
          {syncTime && (
            <div className="text-xs text-muted-foreground font-mono">
              {t("lastSync")}: {syncTime}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
