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

const WINANSI_SAFE = new Set<number>()
for (let i = 0x20; i <= 0x7e; i++) WINANSI_SAFE.add(i)
for (const cp of [
  0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac,
  0xad, 0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9,
  0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6,
  0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3,
  0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf, 0xe0,
  0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed,
  0xee, 0xef, 0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  0xfb, 0xfc, 0xfd, 0xfe, 0xff, 0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e,
  0x192, 0x2c6, 0x2dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d,
  0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac,
  0x2122,
])
  WINANSI_SAFE.add(cp)

function sanitizeForWinAnsi(text: string): string {
  let result = ""
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0
    if (WINANSI_SAFE.has(cp) || cp === 0x0a || cp === 0x0d || cp === 0x09) {
      result += char
    } else if (cp < 0x20) {
      continue
    } else {
      result += "?"
    }
  }
  return result
}

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
    if (paragraph.trim().length === 0) {
      lines.push("")
      continue
    }
    const words = paragraph.split(" ")
    let currentLine = ""

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      try {
        const testWidth = font.widthOfTextAtSize(testLine, fontSize)
        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          currentLine = testLine
        }
      } catch {
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
  innerWidth: number,
  innerHeight: number,
  font: PDFFont,
  startSize: number
): { fontSize: number; lines: string[]; overflow: boolean } {
  let fontSize = Math.min(startSize, 24)
  let lines = wrapText(text, innerWidth, font, fontSize)
  const lineHeightRatio = 1.2

  while (fontSize > MIN_FONT_SIZE) {
    const totalHeight = lines.length * fontSize * lineHeightRatio
    let maxLineWidth = 0
    for (const l of lines) {
      try {
        maxLineWidth = Math.max(
          maxLineWidth,
          font.widthOfTextAtSize(l, fontSize)
        )
      } catch {
        maxLineWidth = innerWidth
      }
    }

    if (maxLineWidth <= innerWidth && totalHeight <= innerHeight) {
      return { fontSize, lines, overflow: false }
    }

    fontSize -= 0.5
    lines = wrapText(text, innerWidth, font, fontSize)
  }

  lines = wrapText(text, innerWidth, font, fontSize)
  return { fontSize, lines, overflow: true }
}

function eraseArea(page: PDFPage, bbox: BBox) {
  page.drawRectangle({
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  })
}

function drawLines(
  page: PDFPage,
  bbox: BBox,
  lines: string[],
  font: PDFFont,
  fontSize: number,
  color: { r: number; g: number; b: number }
) {
  const lineHeight = fontSize * 1.2
  const ascent = font.heightAtSize(fontSize) * 0.75
  const startY = bbox.y + bbox.height - ascent

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (line.length === 0) continue
    const y = startY - i * lineHeight
    if (y < bbox.y - fontSize) break
    try {
      page.drawText(line, {
        x: bbox.x + 2,
        y,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
      })
    } catch {
      continue
    }
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

      const safeText = sanitizeForWinAnsi(translation.translatedText)
      if (safeText.trim().length === 0) continue

      eraseArea(newPage, block.bbox)

      const baselineY =
        firstSpan?.bbox.y ?? block.bbox.y + block.bbox.height * 0.7
      let fontSize = defaultFontSize

      try {
        let textWidth = font.widthOfTextAtSize(safeText, fontSize)
        const maxWidth = block.bbox.width
        while (textWidth > maxWidth && fontSize > MIN_FONT_SIZE) {
          fontSize -= 0.5
          textWidth = font.widthOfTextAtSize(safeText, fontSize)
        }
        if (textWidth > maxWidth) {
          warnings.push(`Text overflow in ${block.id}`)
        }
      } catch {
        fontSize = Math.min(defaultFontSize, 10)
      }

      try {
        newPage.drawText(safeText, {
          x: block.bbox.x + 2,
          y: baselineY,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        })
      } catch {
        continue
      }
    }
  }

  const pdfBytes = await newDoc.save()
  return { buffer: Buffer.from(pdfBytes), warnings }
}
