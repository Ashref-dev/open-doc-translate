"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiAlertLine,
} from "@remixicon/react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

type PdfDocument = {
  numPages: number
  getPage: (num: number) => Promise<PdfPage>
  destroy: () => void
}

type RenderResult = { promise: Promise<void>; cancel: () => void }

type PdfPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number }
  render: (params: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }) => RenderResult
}

export function PdfPreview({
  pdfUrl,
  title,
}: {
  pdfUrl: string
  title?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [isRendering, setIsRendering] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let destroyed = false

    const loadPdf = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "//cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs"

        const loadingTask = pdfjsLib.getDocument(pdfUrl)
        const doc = await loadingTask.promise
        if (destroyed) {
          doc.destroy()
          return
        }
        setPdfDoc(doc as unknown as PdfDocument)
        setNumPages(doc.numPages)
        setLoading(false)
      } catch {
        if (!destroyed) {
          setError(true)
          setLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      destroyed = true
    }
  }, [pdfUrl])

  useEffect(() => {
    if (!pdfDoc) return

    let cancelled = false
    let activeRender: RenderResult | null = null

    const renderPage = async () => {
      setIsRendering(true)
      try {
        const page = await pdfDoc.getPage(pageNum)
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const containerWidth = canvas.parentElement?.clientWidth || 600
        const viewport = page.getViewport({ scale: 1 })
        const scale = containerWidth / viewport.width
        const scaledViewport = page.getViewport({ scale })

        canvas.height = scaledViewport.height
        canvas.width = scaledViewport.width

        activeRender = page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
        })
        await activeRender.promise
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setIsRendering(false)
      }
    }

    renderPage()

    return () => {
      cancelled = true
      activeRender?.cancel()
    }
  }, [pdfDoc, pageNum])

  const goToPrev = useCallback(() => setPageNum((p) => Math.max(1, p - 1)), [])
  const goToNext = useCallback(
    () => setPageNum((p) => Math.min(numPages, p + 1)),
    [numPages]
  )

  return (
    <Card className="flex flex-col overflow-hidden rounded-xl border-border/50 bg-background/50 shadow-xl backdrop-blur-sm">
      {title && (
        <CardHeader className="border-b bg-muted/20 py-4">
          <CardTitle className="text-sm font-semibold tracking-tight">
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="relative flex flex-col items-center p-0">
        {loading && (
          <div className="flex h-[600px] w-full max-w-[600px] flex-col gap-6 bg-background/50 p-8">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-1/3 rounded-md" />
              <Skeleton className="h-4 w-1/4 rounded-md" />
            </div>
            <Skeleton className="h-8 w-full rounded-md" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full rounded-sm" />
              <Skeleton className="h-4 w-[95%] rounded-sm" />
              <Skeleton className="h-4 w-[90%] rounded-sm" />
              <Skeleton className="h-4 w-[85%] rounded-sm" />
            </div>
            <Skeleton className="mt-4 h-8 w-3/4 rounded-md" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full rounded-sm" />
              <Skeleton className="h-4 w-full rounded-sm" />
              <Skeleton className="h-4 w-[90%] rounded-sm" />
              <Skeleton className="h-4 w-3/4 rounded-sm" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-[600px] w-full flex-col items-center justify-center gap-4 bg-destructive/5 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <RiAlertLine className="h-8 w-8" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-foreground">
                Failed to render preview
              </h3>
              <p className="text-sm text-muted-foreground">
                There was an issue loading the PDF document. It might be
                corrupted or unsupported.
              </p>
            </div>
          </div>
        )}

        <div className="relative flex max-h-[600px] w-full justify-center overflow-auto bg-muted/10 p-6">
          {!loading && !error && isRendering && (
            <div className="animate-shimmer pointer-events-none absolute inset-x-6 top-6 bottom-6 z-10 rounded-sm bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:200%_100%]" />
          )}
          <canvas
            ref={canvasRef}
            className={`max-w-full rounded-sm shadow-lg ring-1 ring-border/50 transition-opacity duration-300 ${
              loading || error ? "absolute opacity-0" : "relative opacity-100"
            } ${isRendering ? "opacity-50 blur-[1px]" : ""}`}
          />
        </div>

        {numPages > 0 && !error && (
          <div className="flex w-full items-center justify-between border-t border-border/50 bg-card/50 p-3 backdrop-blur-sm">
            <Button
              variant="outline"
              size="icon"
              onClick={goToPrev}
              disabled={pageNum <= 1 || isRendering}
              className="h-8 w-8 bg-background/50 hover:bg-muted"
            >
              <RiArrowLeftSLine className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5 text-sm font-medium tracking-tight tabular-nums">
              <span className="text-muted-foreground">Page</span>
              <span className="min-w-[2rem] rounded-md bg-primary/10 px-2 py-0.5 text-center text-primary">
                {pageNum}
              </span>
              <span className="text-muted-foreground">of {numPages}</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={goToNext}
              disabled={pageNum >= numPages || isRendering}
              className="h-8 w-8 bg-background/50 hover:bg-muted"
            >
              <RiArrowRightSLine className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
