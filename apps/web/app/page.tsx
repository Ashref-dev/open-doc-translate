"use client"

import { useState, useEffect } from "react"
import { Button } from "@workspace/ui/components/button"
import { RiTranslate2, RiArrowRightLine } from "@remixicon/react"
import { Dithering } from "@paper-design/shaders-react"
import { UploadZone, type UploadState } from "@/components/upload-zone"
import { LanguageSelector } from "@/components/language-selector"
import { ProgressOverlay } from "@/components/progress-overlay"
import { DownloadSection } from "@/components/download-section"
import { PdfPreview } from "@/components/pdf-preview"
import { ThemeToggle } from "@/components/theme-toggle"
import { useUpload } from "@/hooks/use-upload"
import { useTranslationJob } from "@/hooks/use-translation-job"
import type { JobStatus } from "@/lib/jobs/types"
import { useTheme } from "next-themes"

type AppPhase = "upload" | "translating" | "complete"

export default function Page() {
  const [phase, setPhase] = useState<AppPhase>("upload")
  const [sourceLang, setSourceLang] = useState("fr")
  const [targetLang, setTargetLang] = useState("en")
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  const {
    upload,
    uploadState,
    fileInfo,
    uploadId,
    error: uploadError,
    reset: resetUpload,
  } = useUpload()

  const {
    startTranslation,
    status,
    progress,
    warnings,
    error: translationError,
    jobId,
    isComplete,
    isFailed,
  } = useTranslationJob()

  const handleFileSelected = async (file: File) => {
    await upload(file)
  }

  const handleTranslate = async () => {
    if (!uploadId) return
    setPhase("translating")
    await startTranslation(uploadId, sourceLang, targetLang)
  }

  const handleSwapLanguages = () => {
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
  }

  const handleTranslateAnother = () => {
    setPhase("upload")
    resetUpload()
  }

  const handleRetry = async () => {
    if (!uploadId) return
    await startTranslation(uploadId, sourceLang, targetLang)
  }

  const progressOpen = phase === "translating" && !isComplete && !isFailed

  useEffect(() => {
    if (isComplete && phase === "translating") {
      setPhase("complete")
    }
    if (isFailed && phase === "translating") {
      setPhase("upload")
    }
  }, [isComplete, isFailed, phase])

  const downloadUrl = jobId ? `/api/jobs/${jobId}/download` : ""
  const translatedFileName = fileInfo
    ? fileInfo.name.replace(/\.pdf$/i, `_${targetLang}.pdf`)
    : "translated.pdf"

  const isDark = resolvedTheme === "dark"
  const shaderBack = isDark ? "#020f09" : "#f0fdf4"
  const shaderFront = isDark ? "#10b981" : "#059669"

  return (
    <div className="relative min-h-[100dvh]">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[40vh] overflow-hidden sm:h-[60vh]">
        {mounted && (
          <Dithering
            shape="warp"
            colorBack={shaderBack}
            colorFront={shaderFront}
            speed={0.3}
            style={{ width: "100%", height: "100%" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background sm:from-transparent sm:via-transparent" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {phase === "upload" && (
          <div className="grid min-h-[100dvh] items-center gap-8 py-12 sm:gap-12 sm:py-16 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div className="flex flex-col justify-center pt-8 sm:pt-0">
              <h1 className="text-3xl leading-none font-semibold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
                OpenTranslate
              </h1>
              <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-foreground sm:mt-4 sm:max-w-[45ch] sm:text-base md:text-lg">
                Upload a resume PDF in one language, get it back in another —
                same layout, same design, ready to send.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground sm:mt-6 sm:gap-3">
                <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary">
                  AI-powered
                </span>
                <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium">
                  Layout-preserving
                </span>
                <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium">
                  6 languages
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-white/[0.08] bg-card/60 p-4 shadow-xl shadow-primary/5 backdrop-blur-xl sm:p-6 dark:bg-card/40">
                <UploadZone
                  onFileSelected={handleFileSelected}
                  uploadState={uploadState as UploadState}
                  fileInfo={fileInfo}
                  error={uploadError}
                  onRemove={resetUpload}
                />

                <div className="mt-6">
                  <LanguageSelector
                    sourceLang={sourceLang}
                    targetLang={targetLang}
                    onSourceChange={setSourceLang}
                    onTargetChange={setTargetLang}
                    onSwap={handleSwapLanguages}
                  />
                </div>

                <Button
                  onClick={handleTranslate}
                  disabled={uploadState !== "uploaded"}
                  className="mt-6 h-12 w-full cursor-pointer text-sm font-medium"
                  size="lg"
                >
                  <RiTranslate2 className="mr-2 h-4 w-4" />
                  Translate Resume
                  <RiArrowRightLine className="ml-auto h-4 w-4 opacity-60" />
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground/60">
                Works best with text-based PDFs. Images and layout preserved as
                closely as possible.
              </p>
            </div>
          </div>
        )}

        {phase === "complete" && jobId && (
          <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-10 py-16">
            <div className="w-full max-w-lg">
              <DownloadSection
                downloadUrl={downloadUrl}
                fileName={translatedFileName}
                pageCount={fileInfo?.pageCount ?? 1}
                warnings={warnings}
                onTranslateAnother={handleTranslateAnother}
              />
            </div>

            <div className="w-full max-w-2xl">
              <PdfPreview pdfUrl={downloadUrl} title="Translated PDF" />
            </div>
          </div>
        )}
      </div>

      <ProgressOverlay
        open={progressOpen}
        status={(status === "idle" ? "pending" : status) as JobStatus}
        progress={progress}
        error={translationError ?? undefined}
        onRetry={handleRetry}
        onClose={isFailed ? handleTranslateAnother : undefined}
      />
    </div>
  )
}
