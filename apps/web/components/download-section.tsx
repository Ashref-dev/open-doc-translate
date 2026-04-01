"use client"

import {
  RiDownloadLine,
  RiFileTextLine,
  RiRefreshLine,
  RiCheckLine,
} from "@remixicon/react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { TranslationWarnings } from "./translation-warnings"

export interface DownloadSectionProps {
  downloadUrl: string
  fileName: string
  pageCount: number
  warnings: string[]
  onTranslateAnother: () => void
}

export function DownloadSection({
  downloadUrl,
  fileName,
  pageCount,
  warnings,
  onTranslateAnother,
}: DownloadSectionProps) {
  const handleDownload = () => {
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Card className="mx-auto w-full max-w-lg rounded-2xl border-border/50 bg-background/60 shadow-xl backdrop-blur-md">
      <CardHeader className="pb-4 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 animate-[pulse-glow_2s_ease-in-out_infinite] items-center justify-center rounded-full bg-primary/10 text-primary">
          <RiCheckLine className="h-8 w-8" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          Translation Complete!
        </CardTitle>
        <CardDescription className="text-base">
          Your document is ready to download.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-xl border-y border-r border-l-4 border-l-primary bg-card/40 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center space-x-4 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RiFileTextLine className="h-5 w-5" />
            </div>
            <div className="overflow-hidden">
              <p
                className="truncate font-semibold text-foreground"
                title={fileName}
              >
                {fileName}
              </p>
              <p className="text-sm text-muted-foreground">{pageCount} pages</p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="ml-2 bg-secondary/50 font-medium hover:bg-secondary/50"
          >
            PDF
          </Badge>
        </div>

        <Button
          onClick={handleDownload}
          className="group h-14 w-full border-0 bg-gradient-to-r from-primary to-primary/80 text-lg font-semibold text-white shadow-md transition-all hover:from-primary/90 hover:to-primary/70 hover:shadow-lg active:scale-[0.98]"
          size="lg"
        >
          <RiDownloadLine className="mr-2 h-6 w-6 transition-transform group-hover:animate-bounce" />
          Download Translated PDF
        </Button>

        {warnings && warnings.length > 0 && (
          <TranslationWarnings warnings={warnings} />
        )}

        <Separator className="bg-border/50" />

        <Button
          onClick={onTranslateAnother}
          variant="ghost"
          className="w-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <RiRefreshLine className="mr-2 h-4 w-4" />
          Translate Another Document
        </Button>
      </CardContent>
    </Card>
  )
}
