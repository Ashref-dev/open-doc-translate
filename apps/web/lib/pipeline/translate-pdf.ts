import type { SupportedLanguageCode } from "@/lib/config"
import { parsePdf } from "@/lib/pdf/parser"
import { clusterTextItems } from "@/lib/pdf/clustering"
import { translateBlocks } from "@/lib/ai/translator"
import { generateTranslatedPdf } from "@/lib/pdf/generator"
import { updateJobStatus, failJob, completeJob } from "@/lib/jobs/manager"
import type { TextBlock } from "@/lib/pdf/types"

export async function translatePdf(
  jobId: string,
  pdfBuffer: Buffer,
  sourceLang: SupportedLanguageCode,
  targetLang: SupportedLanguageCode
): Promise<void> {
  try {
    updateJobStatus(jobId, "parsing", 10)
    const document = await parsePdf(pdfBuffer)

    updateJobStatus(jobId, "clustering", 25)
    for (const page of document.pages) {
      if (page.rawItems && page.rawStyles) {
        page.textBlocks = clusterTextItems(
          page.rawItems,
          page.rawStyles,
          page.width,
          page.height,
          document.pages.indexOf(page)
        )
      }
    }

    const allBlocks: TextBlock[] = document.pages.flatMap((p) => p.textBlocks)

    if (allBlocks.length === 0) {
      failJob(jobId, "No translatable text blocks found in the PDF")
      return
    }

    updateJobStatus(jobId, "translating", 50)
    const translated = await translateBlocks(
      allBlocks,
      sourceLang,
      targetLang,
      { documentTitle: document.metadata.title }
    )

    updateJobStatus(jobId, "generating", 85)
    const { buffer: resultBuffer, warnings } = await generateTranslatedPdf(
      pdfBuffer,
      document,
      translated
    )

    completeJob(jobId, {
      buffer: resultBuffer,
      warnings,
      pageCount: document.metadata.pageCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failJob(jobId, message)
  }
}
