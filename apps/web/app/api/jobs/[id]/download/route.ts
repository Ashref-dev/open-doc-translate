import { NextResponse } from "next/server"
import { getJob, getJobResult } from "@/lib/jobs/manager"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = getJob(id)

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  if (job.status !== "completed") {
    return NextResponse.json(
      { error: "Translation not yet complete", status: job.status },
      { status: 409 }
    )
  }

  const result = getJobResult(id)
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 })
  }

  const translatedFileName = job.fileName.replace(
    /\.pdf$/i,
    `_${job.targetLang}.pdf`
  )

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${translatedFileName}"`,
      "Content-Length": String(result.buffer.byteLength),
    },
  })
}
