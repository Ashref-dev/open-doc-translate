import { NextResponse } from "next/server"
import { validatePdf } from "@/lib/pdf/parser"
import { storeUpload } from "@/lib/jobs/manager"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No PDF file provided" },
        { status: 400 }
      )
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const validation = await validatePdf(buffer)

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 422 })
    }

    const uploadId = storeUpload(buffer, file.name)

    return NextResponse.json({
      uploadId,
      fileName: file.name,
      pageCount: validation.pageCount,
      fileSize: buffer.byteLength,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
