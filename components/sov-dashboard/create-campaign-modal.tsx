"use client"

import { useState, useCallback } from "react"
import { Plus, Upload, FileText, Sparkles, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, FieldLabel, FieldGroup, FieldDescription } from "@/components/ui/field"
import { useSovI18n } from "@/lib/sov-i18n"

export function SovCreateCampaignModal() {
  const [open, setOpen] = useState(false)
  const [targetBrand, setTargetBrand] = useState("")
  const [bulkQuestions, setBulkQuestions] = useState("")
  const [dragActive, setDragActive] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const { t } = useSovI18n()

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else if (e.type === "dragleave") setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.name.endsWith(".csv") || file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        setUploadedFile(file)
      }
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setUploadedFile(e.target.files[0])
  }, [])

  const handleLaunch = () => {
    setOpen(false)
    setTargetBrand("")
    setBulkQuestions("")
    setUploadedFile(null)
  }

  const questionCount = bulkQuestions.split("\n").filter((line) => line.trim()).length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 gap-2 bg-gradient-to-r from-chart-1 to-chart-2 text-white hover:opacity-90 transition-opacity border-0">
          <Plus className="w-4 h-4" />
          <span className="font-medium">{t("createNewAEOCampaign")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] bg-card border-border p-0 gap-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-chart-1/5 via-transparent to-chart-2/5 pointer-events-none" />
        <DialogHeader className="px-6 pt-6 pb-4 relative">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chart-1 to-chart-2 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            {t("createNewAEOCampaign")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("configureYourCampaign")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 relative">
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel>{t("targetBrand")}</FieldLabel>
              <Input
                placeholder={t("enterBrandName")}
                value={targetBrand}
                onChange={(e) => setTargetBrand(e.target.value)}
                className="h-11 bg-secondary/50 border-border focus:border-chart-1 placeholder:text-muted-foreground/60"
              />
              <FieldDescription>{t("brandOptimizeDescription")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("questionSet")}</FieldLabel>
              <Tabs defaultValue="bulk" className="w-full">
                <TabsList className="w-full bg-secondary/50 p-1 h-10">
                  <TabsTrigger value="bulk" className="flex-1 gap-2 data-[state=active]:bg-card">
                    <FileText className="w-4 h-4" />
                    {t("bulkPaste")}
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex-1 gap-2 data-[state=active]:bg-card">
                    <Upload className="w-4 h-4" />
                    {t("fileUpload")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="bulk" className="mt-4">
                  <div className="relative">
                    <Textarea
                      placeholder={`${t("enterOneQuestionPerLine")}\n\nExample:\nWhat is the best AI infrastructure platform?\nCompare options vs competitors`}
                      value={bulkQuestions}
                      onChange={(e) => {
                        const lines = e.target.value.split("\n")
                        if (lines.length <= 20) setBulkQuestions(e.target.value)
                      }}
                      className="min-h-[160px] bg-secondary/50 border-border focus:border-chart-1 resize-none font-mono text-sm placeholder:text-muted-foreground/60"
                    />
                    <div className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-card/80 px-2 py-1 rounded">
                      {questionCount}/20 {t("questions")}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="upload" className="mt-4">
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${
                      dragActive
                        ? "border-chart-1 bg-chart-1/10"
                        : uploadedFile
                        ? "border-chart-3 bg-chart-3/5"
                        : "border-border hover:border-muted-foreground/50 bg-secondary/30"
                    }`}
                  >
                    {uploadedFile ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-chart-3/20 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-chart-3" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{uploadedFile.name}</span>
                          <button
                            onClick={() => setUploadedFile(null)}
                            className="p-1 hover:bg-destructive/20 rounded-full transition-colors"
                          >
                            <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {(uploadedFile.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                          <Upload className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {t("dragAndDrop")}{" "}
                          <label className="text-chart-1 hover:text-chart-1/80 cursor-pointer font-medium">
                            {t("browse")}
                            <input
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              onChange={handleFileSelect}
                              className="hidden"
                            />
                          </label>
                        </p>
                        <p className="text-xs text-muted-foreground/60">{t("supportsCsvExcel")}</p>
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </Field>
          </FieldGroup>

          <div className="mt-6 pt-6 border-t border-border">
            <Button
              onClick={handleLaunch}
              disabled={!targetBrand.trim() || (!bulkQuestions.trim() && !uploadedFile)}
              className="w-full h-12 gap-2 bg-gradient-to-r from-chart-1 via-chart-2 to-chart-1 bg-[length:200%_100%] text-white font-semibold text-base hover:bg-[position:100%_0] transition-all duration-500 disabled:opacity-50 border-0 shadow-lg shadow-chart-1/20"
            >
              <Sparkles className="w-5 h-5" />
              {t("launchMatrixEngine")}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              {t("campaignWillBeProcessed")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
