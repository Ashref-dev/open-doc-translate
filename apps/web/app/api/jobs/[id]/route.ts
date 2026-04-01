import { NextResponse } from "next/server"
import { getJob } from "@/lib/jobs/manager"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = getJob(id)

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    fileName: job.fileName,
    sourceLang: job.sourceLang,
    targetLang: job.targetLang,
    warnings: job.warnings,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  })
}
