"use client"

import { useRef, DragEvent, ChangeEvent, KeyboardEvent } from "react"
import { Card } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  RiUploadCloud2Line,
  RiFileTextLine,
  RiCloseLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
} from "@remixicon/react"

export type UploadState =
  | "idle"
  | "dragover"
  | "uploading"
  | "uploaded"
  | "error"

interface UploadZoneProps {
  onFileSelected: (file: File) => void
  uploadState: UploadState
  fileInfo?: { name: string; size: number; pageCount?: number }
  error?: string
  onRemove: () => void
}

export function UploadZone({
  onFileSelected,
  uploadState,
  fileInfo,
  error,
  onRemove,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const validateAndProcessFile = (file: File) => {
    if (file.type !== "application/pdf") return
    if (file.size > 10 * 1024 * 1024) return
    onFileSelected(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (
      uploadState !== "idle" &&
      uploadState !== "error" &&
      uploadState !== "dragover"
    )
      return

    const files = e.dataTransfer.files
    if (files && files.length > 0 && files[0]) {
      validateAndProcessFile(files[0])
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0 && files[0]) {
      validateAndProcessFile(files[0])
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (uploadState === "idle" || uploadState === "error") {
        inputRef.current?.click()
      }
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const isInteractive = uploadState === "idle" || uploadState === "error"

  const baseContainerClasses =
    "relative flex min-h-[200px] w-full flex-col items-center justify-center rounded-2xl bg-card/50 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 outline-none overflow-hidden sm:min-h-[240px]"

  const getContainerStateClasses = () => {
    switch (uploadState) {
      case "idle":
        return "border-2 border-dashed border-border cursor-pointer hover:bg-muted/50"
      case "dragover":
        return "border-2 border-solid border-primary ring-2 ring-primary/30 scale-[1.01] bg-primary/5 cursor-pointer"
      case "error":
        return "border-2 border-solid border-destructive bg-destructive/5 cursor-pointer"
      case "uploading":
      case "uploaded":
        return "border border-white/10"
      default:
        return "border border-white/10"
    }
  }

  return (
    <Card
      className={`${baseContainerClasses} ${getContainerStateClasses()}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => isInteractive && inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      tabIndex={isInteractive ? 0 : -1}
      role="button"
      aria-disabled={!isInteractive}
    >
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        accept="application/pdf"
        onChange={handleFileChange}
        disabled={!isInteractive}
      />

      {(uploadState === "idle" || uploadState === "dragover") && (
        <div className="pointer-events-none flex flex-col items-center space-y-3 px-4 text-center sm:space-y-4">
          <div
            className={`rounded-full p-3 sm:p-4 ${
              uploadState === "dragover"
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <RiUploadCloud2Line className="h-6 w-6 sm:h-8 sm:w-8" />
          </div>
          <div className="max-w-[260px] space-y-1 sm:max-w-none">
            <p className="text-sm font-medium text-balance text-foreground">
              {uploadState === "dragover"
                ? "Drop your PDF here"
                : "Drop your resume PDF here or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">
              Supports text-based PDFs up to 10MB
            </p>
          </div>
        </div>
      )}

      {uploadState === "error" && (
        <div className="pointer-events-none flex flex-col items-center space-y-4 text-center">
          <div className="rounded-full bg-destructive/10 p-4 text-destructive">
            <RiErrorWarningLine className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Upload Failed</p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      )}

      {uploadState === "uploading" && (
        <>
          <div className="absolute inset-0 animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 bg-[length:200%_100%]" />
          <div className="relative z-10 flex flex-col items-center space-y-4 text-center">
            <div className="animate-pulse rounded-full bg-primary/10 p-4 text-primary">
              <RiUploadCloud2Line className="h-8 w-8" />
            </div>
            <div className="w-full max-w-[200px] space-y-2">
              <p className="truncate text-sm font-medium text-foreground">
                {fileInfo?.name || "Uploading..."}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-full origin-left animate-[pulse_1.5s_ease-in-out_infinite] bg-primary" />
              </div>
            </div>
          </div>
        </>
      )}

      {uploadState === "uploaded" && fileInfo && (
        <div className="relative flex w-full max-w-sm items-center justify-between rounded-xl border border-l-4 border-white/5 border-l-primary bg-background/50 p-4 shadow-sm">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">
              <RiCheckboxCircleLine className="h-6 w-6" />
            </div>
            <div className="flex flex-col truncate">
              <span className="truncate text-sm font-medium text-foreground">
                {fileInfo.name}
              </span>
              <div className="mt-1 flex items-center space-x-2 text-xs text-muted-foreground">
                <span>{formatSize(fileInfo.size)}</span>
                {fileInfo.pageCount && (
                  <>
                    <span>•</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {fileInfo.pageCount} pages
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <RiCloseLine className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  )
}
