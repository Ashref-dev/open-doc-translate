import { NextResponse } from "next/server"
import { config } from "@/lib/config"
import type { SupportedLanguageCode } from "@/lib/config"
import { createJob, getUpload } from "@/lib/jobs/manager"
import { translatePdf } from "@/lib/pipeline/translate-pdf"

const validLanguages = new Set<string>(
  config.supportedLanguages.map((l) => l.code)
)

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      uploadId?: string
      sourceLang?: string
      targetLang?: string
    }

    const { uploadId, sourceLang, targetLang } = body

    if (!uploadId || !sourceLang || !targetLang) {
      return NextResponse.json(
        { error: "Missing required fields: uploadId, sourceLang, targetLang" },
        { status: 400 }
      )
    }

    if (!validLanguages.has(sourceLang) || !validLanguages.has(targetLang)) {
      return NextResponse.json(
        { error: "Unsupported language" },
        { status: 400 }
      )
    }

    if (sourceLang === targetLang) {
      return NextResponse.json(
        { error: "Source and target languages must be different" },
        { status: 400 }
      )
    }

    const upload = getUpload(uploadId)
    if (!upload) {
      return NextResponse.json(
        { error: "Upload not found or expired" },
        { status: 404 }
      )
    }

    const jobId = createJob(
      upload.fileName,
      sourceLang as SupportedLanguageCode,
      targetLang as SupportedLanguageCode
    )

    translatePdf(
      jobId,
      upload.buffer,
      sourceLang as SupportedLanguageCode,
      targetLang as SupportedLanguageCode
    ).catch(() => {})

    return NextResponse.json({ jobId })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Translation request failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
