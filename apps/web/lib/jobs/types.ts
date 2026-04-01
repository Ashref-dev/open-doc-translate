import type { SupportedLanguageCode } from "@/lib/config"

export type JobStatus =
  | "pending"
  | "parsing"
  | "clustering"
  | "translating"
  | "generating"
  | "completed"
  | "failed"

export type Job = {
  id: string
  fileName: string
  sourceLang: SupportedLanguageCode
  targetLang: SupportedLanguageCode
  status: JobStatus
  progress: number
  error?: string
  warnings: string[]
  createdAt: number
  completedAt?: number
}

export type JobResult = {
  buffer: Buffer
  warnings: string[]
  pageCount: number
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Queued",
  parsing: "Parsing PDF...",
  clustering: "Analyzing layout...",
  translating: "Translating content...",
  generating: "Generating PDF...",
  completed: "Complete!",
  failed: "Failed",
}

export const JOB_STATUS_PROGRESS: Record<JobStatus, number> = {
  pending: 0,
  parsing: 10,
  clustering: 25,
  translating: 50,
  generating: 85,
  completed: 100,
  failed: 0,
}
