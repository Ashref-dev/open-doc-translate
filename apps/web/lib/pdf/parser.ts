import { getDocumentProxy } from "unpdf"
import { config } from "@/lib/config"
import type {
  DocumentModel,
  PageModel,
  PdfValidationResult,
  RawTextItem,
  RawTextStyle,
} from "@/lib/pdf/types"

type PdfjsTextItem = {
  str: string
  dir: string
  transform: Array<number>
  width: number
  height: number
  fontName: string
  hasEOL: boolean
}

function isTextItem(item: unknown): item is PdfjsTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    "transform" in item
  )
}

function toRawTextItem(item: PdfjsTextItem): RawTextItem {
  return {
    str: item.str,
    dir: item.dir,
    transform: item.transform,
    width: item.width,
    height: item.height,
    fontName: item.fontName,
    hasEOL: item.hasEOL,
  }
}

function toRawStyles(
  styles: Record<
    string,
    { fontFamily: string; ascent: number; descent: number; vertical: boolean }
  >
): Record<string, RawTextStyle> {
  const result: Record<string, RawTextStyle> = {}
  for (const [key, style] of Object.entries(styles)) {
    result[key] = {
      fontFamily: style.fontFamily,
      ascent: style.ascent,
      descent: style.descent,
      vertical: style.vertical,
    }
  }
  return result
}

async function loadDocument(buffer: Buffer) {
  try {
    return await getDocumentProxy(new Uint8Array(buffer))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("password")) {
      throw new Error("PDF is password-protected")
    }
    throw new Error(`Failed to parse PDF: ${message}`)
  }
}

export async function parsePdf(buffer: Buffer): Promise<DocumentModel> {
  const doc = await loadDocument(buffer)

  const pageCount = doc.numPages
  let title: string | undefined
  let author: string | undefined

  try {
    const { info } = await doc.getMetadata()
    const metadata = info as Record<string, unknown>
    if (typeof metadata["Title"] === "string" && metadata["Title"].length > 0) {
      title = metadata["Title"]
    }
    if (
      typeof metadata["Author"] === "string" &&
      metadata["Author"].length > 0
    ) {
      author = metadata["Author"]
    }
  } catch {}

  const pages: PageModel[] = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1.0 })
    const textContent = await page.getTextContent()

    const rawItems: RawTextItem[] = []
    for (const item of textContent.items) {
      if (isTextItem(item)) {
        rawItems.push(toRawTextItem(item))
      }
    }

    const rawStyles = toRawStyles(
      textContent.styles as Record<
        string,
        {
          fontFamily: string
          ascent: number
          descent: number
          vertical: boolean
        }
      >
    )

    pages.push({
      width: viewport.width,
      height: viewport.height,
      textBlocks: [],
      images: [],
      vectorElements: [],
      rawItems,
      rawStyles,
    })
  }

  await doc.destroy()

  return {
    pages,
    metadata: {
      title,
      author,
      pageCount,
    },
  }
}

export async function validatePdf(
  buffer: Buffer
): Promise<PdfValidationResult> {
  const fileSizeMB = buffer.byteLength / (1024 * 1024)

  if (fileSizeMB > config.upload.maxFileSizeMB) {
    return {
      valid: false,
      error: `File size ${fileSizeMB.toFixed(1)}MB exceeds maximum ${config.upload.maxFileSizeMB}MB`,
      fileSizeMB,
    }
  }

  let doc: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    doc = await loadDocument(buffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { valid: false, error: message, fileSizeMB }
  }

  const pageCount = doc.numPages

  if (pageCount === 0) {
    await doc.destroy()
    return { valid: false, error: "PDF has no pages", pageCount, fileSizeMB }
  }

  if (pageCount > config.upload.maxPages) {
    await doc.destroy()
    return {
      valid: false,
      error: `PDF has ${pageCount} pages, maximum is ${config.upload.maxPages}`,
      pageCount,
      fileSizeMB,
    }
  }

  let hasText = false
  for (let i = 1; i <= Math.min(pageCount, 3); i++) {
    const page = await doc.getPage(i)
    const textContent = await page.getTextContent()
    const textLength = textContent.items
      .filter(isTextItem)
      .reduce((sum, item) => sum + item.str.trim().length, 0)

    if (textLength > 0) {
      hasText = true
      break
    }
  }

  await doc.destroy()

  if (!hasText) {
    return {
      valid: false,
      error:
        "PDF contains no extractable text (may be a scanned or image-only PDF)",
      pageCount,
      hasText: false,
      fileSizeMB,
    }
  }

  return { valid: true, pageCount, hasText: true, fileSizeMB }
}
