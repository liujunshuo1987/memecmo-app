"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export type Region = {
  id: string
  name: string
  nameEn: string
  code: string
}

export type Language = {
  id: string
  name: string
  nameNative: string
  code: string
}

export const REGIONS: Region[] = [
  { id: "vn", name: "越南", nameEn: "Vietnam", code: "VN" },
  { id: "th", name: "泰国", nameEn: "Thailand", code: "TH" },
  { id: "id", name: "印度尼西亚", nameEn: "Indonesia", code: "ID" },
  { id: "my", name: "马来西亚", nameEn: "Malaysia", code: "MY" },
  { id: "sg", name: "新加坡", nameEn: "Singapore", code: "SG" },
  { id: "ph", name: "菲律宾", nameEn: "Philippines", code: "PH" },
  { id: "mm", name: "缅甸", nameEn: "Myanmar", code: "MM" },
  { id: "kh", name: "柬埔寨", nameEn: "Cambodia", code: "KH" },
  { id: "la", name: "老挝", nameEn: "Laos", code: "LA" },
]

export const LANGUAGES: Language[] = [
  { id: "zh", name: "中文", nameNative: "中文", code: "ZH" },
  { id: "en", name: "英文", nameNative: "English", code: "EN" },
  { id: "vi", name: "越南语", nameNative: "Tiếng Việt", code: "VI" },
  { id: "th", name: "泰语", nameNative: "ภาษาไทย", code: "TH" },
  { id: "id", name: "印尼语", nameNative: "Bahasa Indonesia", code: "ID" },
  { id: "ms", name: "马来语", nameNative: "Bahasa Melayu", code: "MS" },
  { id: "tl", name: "菲律宾语", nameNative: "Filipino", code: "TL" },
  { id: "my", name: "缅甸语", nameNative: "မြန်မာဘာသာ", code: "MY" },
  { id: "km", name: "柬埔寨语", nameNative: "ភាសាខ្មែរ", code: "KM" },
  { id: "lo", name: "老挝语", nameNative: "ພາສາລາວ", code: "LO" },
]

type SeaDashboardContextType = {
  region: Region
  setRegion: (region: Region) => void
  language: Language
  setLanguage: (language: Language) => void
}

const SeaDashboardContext = createContext<SeaDashboardContextType | undefined>(undefined)

export function SeaDashboardProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState<Region>(REGIONS[0])
  const [language, setLanguage] = useState<Language>(LANGUAGES[0])

  return (
    <SeaDashboardContext.Provider value={{ region, setRegion, language, setLanguage }}>
      {children}
    </SeaDashboardContext.Provider>
  )
}

export function useSeaDashboard() {
  const context = useContext(SeaDashboardContext)
  if (context === undefined) {
    throw new Error("useSeaDashboard must be used within a SeaDashboardProvider")
  }
  return context
}
