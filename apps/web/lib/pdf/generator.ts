import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"
import type { DocumentModel, TextBlock, BBox } from "@/lib/pdf/types"
import type { TranslatedBlock } from "@/lib/ai/types"
import { mapFontToStandard } from "@/lib/pdf/font-mapper"

const MIN_FONT_SIZE = 6

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  return {
    r: Number.isNaN(r) ? 0 : r,
    g: Number.isNaN(g) ? 0 : g,
    b: Number.isNaN(b) ? 0 : b,
  }
}

function wrapText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number
): string[] {
  const lines: string[] = []
  const paragraphs = text.split("\n")

  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ")
    let currentLine = ""

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const testWidth = font.widthOfTextAtSize(testLine, fontSize)

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }
  }

  return lines.length > 0 ? lines : [""]
}

function fitFontSize(
  text: string,
  bbox: BBox,
  font: PDFFont,
  startSize: number
): { fontSize: number; lines: string[]; overflow: boolean } {
  let fontSize = startSize
  let lines = wrapText(text, bbox.width, font, fontSize)
  const lineHeightRatio = 1.2

  while (fontSize > MIN_FONT_SIZE) {
    const totalHeight = lines.length * fontSize * lineHeightRatio
    const maxLineWidth = Math.max(
      ...lines.map((l) => font.widthOfTextAtSize(l, fontSize))
    )

    if (maxLineWidth <= bbox.width && totalHeight <= bbox.height) {
      return { fontSize, lines, overflow: false }
    }

    fontSize -= 1
    lines = wrapText(text, bbox.width, font, fontSize)
  }

  lines = wrapText(text, bbox.width, font, fontSize)
  const totalHeight = lines.length * fontSize * lineHeightRatio
  const maxLineWidth = Math.max(
    ...lines.map((l) => font.widthOfTextAtSize(l, fontSize))
  )
  const overflow = maxLineWidth > bbox.width || totalHeight > bbox.height

  return { fontSize, lines, overflow }
}

function eraseOriginalText(page: PDFPage, bbox: BBox, pageHeight: number) {
  page.drawRectangle({
    x: bbox.x,
    y: pageHeight - bbox.y - bbox.height,
    width: bbox.width + 2,
    height: bbox.height + 2,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  })
}

function drawTranslatedText(
  page: PDFPage,
  bbox: BBox,
  lines: string[],
  font: PDFFont,
  fontSize: number,
  color: { r: number; g: number; b: number },
  pageHeight: number
) {
  const lineHeight = fontSize * 1.2
  // y positions: start from the top of the bbox, offset by one line of text
  const startY = pageHeight - bbox.y - fontSize

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    page.drawText(line, {
      x: bbox.x,
      y: startY - i * lineHeight,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
    })
  }
}

async function resolveFont(
  block: TextBlock,
  newDoc: PDFDocument,
  fontCache: Map<StandardFonts, PDFFont>
): Promise<PDFFont> {
  const firstSpan = block.spans[0]
  const fontName = firstSpan?.fontFamily ?? "Helvetica"
  const standardFont = mapFontToStandard(fontName, firstSpan?.fontFamily)

  let font = fontCache.get(standardFont)
  if (!font) {
    font = await newDoc.embedFont(standardFont)
    fontCache.set(standardFont, font)
  }
  return font
}

export async function generateTranslatedPdf(
  originalPdfBuffer: Buffer,
  document: DocumentModel,
  translatedBlocks: TranslatedBlock[]
): Promise<{ buffer: Buffer; warnings: string[] }> {
  const warnings: string[] = []

  const translationMap = new Map<string, TranslatedBlock>()
  for (const block of translatedBlocks) {
    translationMap.set(block.id, block)
  }

  const origDoc = await PDFDocument.load(originalPdfBuffer)
  const newDoc = await PDFDocument.create()
  const fontCache = new Map<StandardFonts, PDFFont>()

  const origPages = origDoc.getPages()

  for (let pageIndex = 0; pageIndex < origPages.length; pageIndex++) {
    const origPage = origPages[pageIndex]
    if (!origPage) continue
    const { width, height: pageHeight } = origPage.getSize()

    const embeddedPage = await newDoc.embedPage(origPage)
    const newPage = newDoc.addPage([width, pageHeight])

    newPage.drawPage(embeddedPage, { x: 0, y: 0, width, height: pageHeight })

    const pageModel = document.pages[pageIndex]
    if (!pageModel) continue

    for (const block of pageModel.textBlocks) {
      const translation = translationMap.get(block.id)
      if (!translation || translation.preserveOriginal) continue

      const font = await resolveFont(block, newDoc, fontCache)
      const firstSpan = block.spans[0]
      const defaultFontSize = firstSpan?.fontSize ?? 12
      const colorHex = firstSpan?.color ?? "#000000"
      const color = parseHexColor(colorHex)

      eraseOriginalText(newPage, block.bbox, pageHeight)

      const { fontSize, lines, overflow } = fitFontSize(
        translation.translatedText,
        block.bbox,
        font,
        defaultFontSize
      )

      if (overflow) {
        warnings.push(`Text overflow in block ${block.id}`)
      }

      drawTranslatedText(
        newPage,
        block.bbox,
        lines,
        font,
        fontSize,
        color,
        pageHeight
      )
    }
  }

  const pdfBytes = await newDoc.save()
  return { buffer: Buffer.from(pdfBytes), warnings }
}
