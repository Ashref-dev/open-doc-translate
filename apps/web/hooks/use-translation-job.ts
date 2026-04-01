"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { config } from "@/lib/config"
import { JobStatus } from "@/lib/jobs/types"

interface UseTranslationJobResult {
  startTranslation: (
    uploadId: string,
    sourceLang: string,
    targetLang: string
  ) => Promise<void>
  status: JobStatus | "idle"
  progress: number
  warnings: string[]
  error: string | null
  jobId: string | null
  isComplete: boolean
  isFailed: boolean
}

export function useTranslationJob(): UseTranslationJobResult {
  const [status, setStatus] = useState<JobStatus | "idle">("idle")
  const [progress, setProgress] = useState(0)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const isComplete = status === "completed"
  const isFailed = status === "failed"

  const cleanupPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const pollJobStatus = useCallback(
    async (currentJobId: string) => {
      try {
        const response = await fetch(`/api/jobs/${currentJobId}`)
        if (!response.ok) {
          throw new Error("Failed to fetch job status")
        }

        const data = await response.json()

        setStatus(data.status)
        if (typeof data.progress === "number") {
          setProgress(data.progress)
        }

        if (Array.isArray(data.warnings)) {
          setWarnings(data.warnings)
        }

        if (data.error) {
          setError(data.error)
        }

        if (data.status === "completed" || data.status === "failed") {
          cleanupPolling()
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to poll job status"
        )
        setStatus("failed")
        cleanupPolling()
      }
    },
    [cleanupPolling]
  )

  const startTranslation = useCallback(
    async (uploadId: string, sourceLang: string, targetLang: string) => {
      try {
        cleanupPolling()
        setStatus("pending")
        setProgress(0)
        setWarnings([])
        setError(null)
        setJobId(null)

        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId, sourceLang, targetLang }),
        })

        if (!response.ok) {
          throw new Error("Failed to start translation")
        }

        const data = await response.json()
        const newJobId = data.jobId

        if (!newJobId) {
          throw new Error("No job ID received")
        }

        setJobId(newJobId)

        pollIntervalRef.current = setInterval(
          () => pollJobStatus(newJobId),
          config.job.pollIntervalMs || 1500
        )
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to start translation"
        )
        setStatus("failed")
      }
    },
    [cleanupPolling, pollJobStatus]
  )

  useEffect(() => {
    return cleanupPolling
  }, [cleanupPolling])

  return {
    startTranslation,
    status,
    progress,
    warnings,
    error,
    jobId,
    isComplete,
    isFailed,
  }
}
