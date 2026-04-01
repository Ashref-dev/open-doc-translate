import { join } from "node:path"
import { config } from "@/lib/config"
import type {
  DocumentModel,
  PageModel,
  PdfValidationResult,
  RawTextItem,
  RawTextStyle,
} from "@/lib/pdf/types"

const PDFJS_DIST_PATH = join(process.cwd(), "node_modules", "pdfjs-dist")

type PdfjsModule = {
  getDocument: (params: Record<string, unknown>) => {
    promise: Promise<PdfjsDocument>
  }
  GlobalWorkerOptions: { workerSrc: string }
}

type PdfjsDocument = {
  numPages: number
  getPage: (num: number) => Promise<PdfjsPage>
  getMetadata: () => Promise<{ info: Record<string, unknown> }>
  destroy: () => Promise<void>
}

type PdfjsPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number }
  getTextContent: () => Promise<{
    items: unknown[]
    styles: Record<
      string,
      { fontFamily: string; ascent: number; descent: number; vertical: boolean }
    >
  }>
}

type PdfjsTextItem = {
  str: string
  dir: string
  transform: Array<number>
  width: number
  height: number
  fontName: string
  hasEOL: boolean
}

let pdfjsModule: PdfjsModule | null = null

async function getPdfjs(): Promise<PdfjsModule> {
  if (pdfjsModule) return pdfjsModule
  const mod =
    (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule
  mod.GlobalWorkerOptions.workerSrc = join(
    PDFJS_DIST_PATH,
    "legacy",
    "build",
    "pdf.worker.mjs"
  )
  pdfjsModule = mod
  return mod
}

function buildDocumentParams(buffer: Buffer) {
  return {
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: join(PDFJS_DIST_PATH, "standard_fonts") + "/",
    cMapUrl: join(PDFJS_DIST_PATH, "cmaps") + "/",
    cMapPacked: true,
  }
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

async function loadDocument(buffer: Buffer): Promise<PdfjsDocument> {
  try {
    const pdfjs = await getPdfjs()
    const loadingTask = pdfjs.getDocument(buildDocumentParams(buffer))
    return await loadingTask.promise
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
    if (typeof info["Title"] === "string" && info["Title"].length > 0) {
      title = info["Title"]
    }
    if (typeof info["Author"] === "string" && info["Author"].length > 0) {
      author = info["Author"]
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

    const rawStyles = toRawStyles(textContent.styles)

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

  let doc: PdfjsDocument
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
