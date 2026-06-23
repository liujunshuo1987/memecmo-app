"use client"

import { Globe } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useSovI18n, sovLanguages } from "@/lib/sov-i18n"

export function SovLanguageSwitcher() {
  const { language, setLanguage } = useSovI18n()
  const currentLang = sovLanguages.find((l) => l.code === language)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 px-3 gap-2 text-sm font-medium hover:bg-secondary">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">{currentLang?.flag}</span>
          <span className="text-muted-foreground hidden sm:inline">{currentLang?.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {sovLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className="flex items-center gap-3 cursor-pointer"
          >
            <span className="text-lg">{lang.flag}</span>
            <div className="flex flex-col">
              <span className="font-medium">{lang.nativeName}</span>
              <span className="text-xs text-muted-foreground">{lang.name}</span>
            </div>
            {language === lang.code && (
              <div className="ml-auto w-2 h-2 rounded-full bg-chart-1" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
