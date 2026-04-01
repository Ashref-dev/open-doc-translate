import { v4 as uuidv4 } from "uuid"
import type { SupportedLanguageCode } from "@/lib/config"
import { config } from "@/lib/config"
import type { Job, JobStatus, JobResult } from "@/lib/jobs/types"

const jobs = new Map<string, Job>()
const results = new Map<string, JobResult>()
const uploads = new Map<string, { buffer: Buffer; fileName: string }>()

export function createJob(
  fileName: string,
  sourceLang: SupportedLanguageCode,
  targetLang: SupportedLanguageCode
) {
  const id = uuidv4()
  jobs.set(id, {
    id,
    fileName,
    sourceLang,
    targetLang,
    status: "pending",
    progress: 0,
    warnings: [],
    createdAt: Date.now(),
  })
  return id
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null
}

export function updateJobStatus(
  id: string,
  status: JobStatus,
  progress?: number
) {
  const job = jobs.get(id)
  if (!job) return
  job.status = status
  if (progress !== undefined) job.progress = progress
  if (status === "completed") job.completedAt = Date.now()
  jobs.set(id, job)
}

export function failJob(id: string, error: string) {
  const job = jobs.get(id)
  if (!job) return
  job.status = "failed"
  job.error = error
  job.completedAt = Date.now()
  jobs.set(id, job)
}

export function completeJob(id: string, result: JobResult) {
  const job = jobs.get(id)
  if (!job) return
  job.status = "completed"
  job.progress = 100
  job.completedAt = Date.now()
  jobs.set(id, job)
  results.set(id, result)
}

export function getJobResult(id: string): JobResult | null {
  return results.get(id) ?? null
}

export function storeUpload(buffer: Buffer, fileName: string) {
  const id = uuidv4()
  uploads.set(id, { buffer, fileName })
  return id
}

export function getUpload(
  id: string
): { buffer: Buffer; fileName: string } | null {
  return uploads.get(id) ?? null
}

export function removeUpload(id: string) {
  uploads.delete(id)
}

export function cleanup() {
  const expiryThreshold = Date.now() - config.job.expiryMs
  for (const [id, job] of jobs) {
    if (job.createdAt < expiryThreshold) {
      jobs.delete(id)
      results.delete(id)
      uploads.delete(id)
    }
  }
}

const cleanupTimer = setInterval(cleanup, config.job.cleanupIntervalMs)
cleanupTimer.unref?.()
