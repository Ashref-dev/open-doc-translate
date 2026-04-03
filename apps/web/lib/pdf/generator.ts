import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import fontkit from "@pdf-lib/fontkit"
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"
import type { DocumentModel, TextBlock, BBox, BlockRole } from "@/lib/pdf/types"
import type { TranslatedBlock } from "@/lib/ai/types"
import { mapFontToStandard } from "@/lib/pdf/font-mapper"

const MIN_FONT_SIZE = 6
const FONT_ASSET_DIR = join(process.cwd(), "assets/fonts")

type EmbeddedFontKey =
  | StandardFonts
  | "glacial-regular"
  | "glacial-bold"
  | "glacial-italic"
  | "poppins-regular"
  | "poppins-bold"
  | "poppins-italic"
  | "poppins-black"

const CUSTOM_FONT_FILES: Partial<Record<EmbeddedFontKey, string>> = {
  "glacial-bold": "GlacialIndifference-Bold.ttf",
  "glacial-italic": "GlacialIndifference-Italic.ttf",
  "glacial-regular": "GlacialIndifference-Regular.ttf",
  "poppins-black": "Poppins-Black.ttf",
  "poppins-bold": "Poppins-Bold.ttf",
  "poppins-italic": "Poppins-Italic.ttf",
  "poppins-regular": "Poppins-Regular.ttf",
}

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

function sanitizeText(text: string, usesCustomFont: boolean): string {
  if (usesCustomFont) {
    let result = ""
    for (const char of text) {
      const cp = char.codePointAt(0) ?? 0
      if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp >= 0x20) {
        result += char
      }
    }
    return result
  }

  return sanitizeForWinAnsi(text)
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

type WrappedLine = {
  text: string
  indent: number
}

type LayoutPlan = {
  horizontalPadding: number
  verticalPadding: number
  lineHeightRatio: number
}

function measureTextWidth(
  text: string,
  font: PDFFont,
  fontSize: number
): number {
  try {
    return font.widthOfTextAtSize(text, fontSize)
  } catch {
    return 0
  }
}

function getWrappedLineWidth(
  line: WrappedLine,
  font: PDFFont,
  fontSize: number
): number {
  return line.indent + measureTextWidth(line.text, font, fontSize)
}

function splitWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
}

function countWords(text: string): number {
  return splitWords(text).length
}

function isWeakWrapToken(token: string): boolean {
  return /^[-–—/|:]+$/.test(token)
}

function extractBulletPrefix(
  text: string
): { prefix: string; content: string } | null {
  const match = text.match(/^(\s*[•▪▸►◦‣⁃*>-]\s+)(.+)$/u)
  if (!match) return null

  return {
    prefix: match[1] ?? "",
    content: match[2] ?? "",
  }
}

function rebalanceWrappedLines(
  lines: WrappedLine[],
  firstLineWidth: number,
  restLineWidth: number,
  font: PDFFont,
  fontSize: number
) {
  for (let index = lines.length - 1; index > 0; index--) {
    const current = lines[index]
    const previous = lines[index - 1]
    if (!current || !previous) continue

    const currentWordCount = countWords(current.text)
    if (currentWordCount > 1 && current.text.trim().length > 14) continue

    const previousWords = splitWords(previous.text)
    if (previousWords.length < 3) continue

    const previousLimit = index - 1 === 0 ? firstLineWidth : restLineWidth
    const currentLimit = index === 0 ? firstLineWidth : restLineWidth
    const currentWords = splitWords(current.text)

    let bestCandidate: { previousText: string; currentText: string } | null =
      null
    let bestScore = Number.POSITIVE_INFINITY

    for (let movedCount = 1; movedCount <= 2; movedCount++) {
      const movedWords = previousWords.slice(-movedCount)
      const remainingWords = previousWords.slice(0, -movedCount)
      if (remainingWords.length === 0 || movedWords.length === 0) continue

      const nextCurrentWords = [...movedWords, ...currentWords]
      const previousText = remainingWords.join(" ")
      const currentText = nextCurrentWords.join(" ")

      const previousWidth = measureTextWidth(previousText, font, fontSize)
      const currentWidth = measureTextWidth(currentText, font, fontSize)
      if (previousWidth > previousLimit || currentWidth > currentLimit) continue

      const previousRatio = previousWidth / Math.max(previousLimit, 1)
      const currentRatio = currentWidth / Math.max(currentLimit, 1)
      const balanceScore = Math.abs(previousRatio - currentRatio)

      if (balanceScore < bestScore) {
        bestCandidate = { previousText, currentText }
        bestScore = balanceScore
      }
    }

    if (!bestCandidate) continue

    previous.text = bestCandidate.previousText
    current.text = bestCandidate.currentText
  }
}

function wrapText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number,
  bullet: boolean,
  preserveLineBreaks: boolean
): WrappedLine[] {
  const lines: WrappedLine[] = []
  const paragraphs = preserveLineBreaks
    ? text.split("\n")
    : [text.replace(/\s*\n\s*/g, " ")]

  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) {
      lines.push({ text: "", indent: 0 })
      continue
    }

    const bulletPrefix = bullet ? extractBulletPrefix(paragraph) : null
    const paragraphText = bulletPrefix?.content ?? paragraph
    const words = splitWords(paragraphText)
    const hangingIndent = bulletPrefix
      ? measureTextWidth(bulletPrefix.prefix, font, fontSize)
      : 0
    const firstLineWidth = maxWidth
    const restLineWidth = Math.max(maxWidth - hangingIndent, 8)
    let currentWords: string[] = []
    let currentIndent = 0
    let currentLineWidth = firstLineWidth

    for (const word of words) {
      const testLine =
        currentWords.length > 0 ? `${currentWords.join(" ")} ${word}` : word
      const testWidth = measureTextWidth(testLine, font, fontSize)

      if (
        currentWords.length > 0 &&
        testWidth > currentLineWidth &&
        !isWeakWrapToken(word)
      ) {
        lines.push({
          text: currentWords.join(" "),
          indent: currentIndent,
        })
        currentWords = [word]
        currentIndent = hangingIndent
        currentLineWidth = restLineWidth
      } else {
        currentWords.push(word)
      }
    }

    if (currentWords.length > 0) {
      const lineText = currentWords.join(" ")
      if (bulletPrefix && lines.length === 0) {
        lines.push({
          text: `${bulletPrefix.prefix}${lineText}`,
          indent: 0,
        })
      } else {
        lines.push({ text: lineText, indent: currentIndent })
      }
    } else if (bulletPrefix) {
      lines.push({ text: bulletPrefix.prefix.trimEnd(), indent: 0 })
    }

    const paragraphLines = lines
      .slice(Math.max(lines.length - Math.max(words.length, 1), 0))
      .filter((line) => line.text.length > 0)

    rebalanceWrappedLines(
      paragraphLines,
      firstLineWidth,
      restLineWidth,
      font,
      fontSize
    )

    if (bulletPrefix && paragraphLines.length > 1) {
      const [firstLine, ...restLines] = paragraphLines
      if (firstLine && !firstLine.text.startsWith(bulletPrefix.prefix)) {
        firstLine.text = `${bulletPrefix.prefix}${firstLine.text}`
        firstLine.indent = 0
      }

      for (const line of restLines) {
        line.indent = hangingIndent
      }
    }
  }

  return lines.length > 0 ? lines : [{ text: "", indent: 0 }]
}

function fitFontSize(
  text: string,
  innerWidth: number,
  innerHeight: number,
  font: PDFFont,
  startSize: number,
  bullet: boolean,
  lineHeightRatio: number,
  preserveLineBreaks: boolean
): { fontSize: number; lines: WrappedLine[]; overflow: boolean } {
  let fontSize = Math.min(startSize, 24)
  let lines = wrapText(
    text,
    innerWidth,
    font,
    fontSize,
    bullet,
    preserveLineBreaks
  )

  while (fontSize > MIN_FONT_SIZE) {
    const totalHeight = lines.length * fontSize * lineHeightRatio
    let maxLineWidth = 0
    for (const l of lines) {
      maxLineWidth = Math.max(
        maxLineWidth,
        getWrappedLineWidth(l, font, fontSize)
      )
    }

    if (maxLineWidth <= innerWidth && totalHeight <= innerHeight) {
      return { fontSize, lines, overflow: false }
    }

    fontSize -= 0.5
    lines = wrapText(
      text,
      innerWidth,
      font,
      fontSize,
      bullet,
      preserveLineBreaks
    )
  }

  lines = wrapText(text, innerWidth, font, fontSize, bullet, preserveLineBreaks)
  return { fontSize, lines, overflow: true }
}

function getLayoutPlan(block: TextBlock): LayoutPlan {
  if (block.role === "section_header") {
    return { horizontalPadding: 1, verticalPadding: 2, lineHeightRatio: 1.05 }
  }

  if (block.role === "summary") {
    return { horizontalPadding: 1, verticalPadding: 2, lineHeightRatio: 1.12 }
  }

  if (block.role === "metadata_row" || block.style.compact) {
    return { horizontalPadding: 1, verticalPadding: 1, lineHeightRatio: 1.08 }
  }

  return { horizontalPadding: 2, verticalPadding: 2, lineHeightRatio: 1.2 }
}

function isTightSidebarSectionHeader(block: TextBlock): boolean {
  return (
    block.role === "section_header" &&
    block.region === "sidebar" &&
    block.bbox.width <= 70
  )
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

function getSourceLineBaselines(block: TextBlock): number[] {
  const sorted = [...block.spans]
    .map((span) => span.bbox.y)
    .sort((left, right) => right - left)

  const baselines: number[] = []
  for (const baseline of sorted) {
    const previous = baselines[baselines.length - 1]
    if (previous === undefined || Math.abs(previous - baseline) > 1) {
      baselines.push(baseline)
    }
  }

  return baselines
}

function getDrawStartY(
  block: TextBlock,
  bbox: BBox,
  font: PDFFont,
  fontSize: number
) {
  const sourceBaselines = getSourceLineBaselines(block)
  if (sourceBaselines.length > 0) {
    return (
      sourceBaselines[0] ??
      bbox.y + bbox.height - font.heightAtSize(fontSize) * 0.75
    )
  }

  const ascent = font.heightAtSize(fontSize) * 0.75
  return bbox.y + bbox.height - ascent
}

function drawLines(
  page: PDFPage,
  block: TextBlock,
  bbox: BBox,
  lines: WrappedLine[],
  font: PDFFont,
  fontSize: number,
  lineHeightRatio: number,
  color: { r: number; g: number; b: number }
) {
  const lineHeight = fontSize * lineHeightRatio
  const startY = getDrawStartY(block, bbox, font, fontSize)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.text.length === 0) continue
    const y = startY - i * lineHeight
    if (y < bbox.y - fontSize) break
    try {
      page.drawText(line.text, {
        x: bbox.x + 2 + line.indent,
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
  fontCache: Map<EmbeddedFontKey, PDFFont>
): Promise<{ font: PDFFont; usesCustomFont: boolean }> {
  const referenceSpan = getPrimaryTextSpan(block)
  const family = referenceSpan?.fontFamily ?? "sans-serif"
  const weight = referenceSpan?.fontWeight ?? "normal"
  const style = referenceSpan?.fontStyle ?? "normal"
  const text = referenceSpan?.text ?? block.text

  const fontKey = resolveFontKey(block, family, weight, style, text)

  let font = fontCache.get(fontKey)
  if (!font) {
    if (isStandardFontKey(fontKey)) {
      font = await newDoc.embedFont(fontKey)
    } else {
      const fileName = CUSTOM_FONT_FILES[fontKey]
      if (!fileName) {
        throw new Error(`Missing font asset mapping for ${fontKey}`)
      }

      const fontPath = join(FONT_ASSET_DIR, fileName)
      if (!existsSync(fontPath)) {
        throw new Error(`Missing font asset at ${fontPath}`)
      }

      font = await newDoc.embedFont(readFileSync(fontPath), { subset: false })
    }

    fontCache.set(fontKey, font)
  }

  return {
    font,
    usesCustomFont: !isStandardFontKey(fontKey),
  }
}

function isStandardFontKey(fontKey: EmbeddedFontKey): fontKey is StandardFonts {
  return Object.values(StandardFonts).includes(fontKey as StandardFonts)
}

function resolveFontKey(
  block: TextBlock,
  family: string,
  weight: "normal" | "bold",
  style: "normal" | "italic",
  text: string
): EmbeddedFontKey {
  const fontNames = block.spans
    .map((span) =>
      `${span.fontName ?? ""} ${span.fontFamily ?? ""}`.toLowerCase()
    )
    .join(" ")

  const opaqueHint = `${family} ${fontNames} ${text}`.toLowerCase()
  const wantsHeavy = weight === "bold" && referenceLooksHeavy(block)

  if (opaqueHint.includes("poppins")) {
    if (style === "italic") return "poppins-italic"
    if (wantsHeavy || opaqueHint.includes("black")) return "poppins-black"
    if (weight === "bold" || opaqueHint.includes("bold")) return "poppins-bold"
    return "poppins-regular"
  }

  if (opaqueHint.includes("glacial")) {
    if (style === "italic") return "glacial-italic"
    if (weight === "bold" || opaqueHint.includes("bold")) return "glacial-bold"
    return "glacial-regular"
  }

  if (block.role === "summary") {
    return "glacial-italic"
  }

  if (blockLooksLikeDisplayHeading(block)) {
    if (style === "italic") return "poppins-italic"
    return wantsHeavy ? "poppins-black" : "poppins-bold"
  }

  if (blockLooksLikeSubheading(block)) {
    if (style === "italic") return "glacial-italic"
    if (weight === "bold") return "glacial-bold"
    return "glacial-regular"
  }

  if (opaqueHint.includes("noto") || family.includes("sans")) {
    if (style === "italic") return "glacial-italic"
    if (wantsHeavy || opaqueHint.includes("black")) return "poppins-bold"
    if (weight === "bold" || opaqueHint.includes("bold")) return "poppins-bold"
    return "glacial-regular"
  }

  let combined = family
  if (weight === "bold") combined += " bold"
  if (style === "italic") combined += " italic"
  return mapFontToStandard(combined, family)
}

function referenceLooksHeavy(block: TextBlock): boolean {
  const primarySpan = getPrimaryTextSpan(block)
  const text = primarySpan?.text.trim() ?? block.text.trim()
  return text.length > 0 && text === text.toUpperCase() && text.length <= 40
}

function blockLooksLikeDisplayHeading(block: TextBlock): boolean {
  const primarySpan = getPrimaryTextSpan(block)
  const text = primarySpan?.text.trim() ?? block.text.trim()
  const fontSize = primarySpan?.fontSize ?? 0
  return fontSize >= 16 || (text === text.toUpperCase() && text.length <= 28)
}

function blockLooksLikeSubheading(block: TextBlock): boolean {
  if (block.role === "section_header") return true
  const primarySpan = getPrimaryTextSpan(block)
  const text = primarySpan?.text.trim() ?? block.text.trim()
  const fontSize = primarySpan?.fontSize ?? 0
  return fontSize >= 11 && text.length <= 60 && !block.style.bullet
}

function getFontSizeFloor(role: BlockRole): number {
  if (role === "display_heading") return 12
  if (role === "section_header") return 10
  if (role === "summary") return 8.5
  if (role === "metadata_row") return 8.5
  if (role === "grid_item" || role === "language_item") return 8.5
  return MIN_FONT_SIZE
}

function compactSectionHeaderText(text: string): string {
  return text
    .replace(/\bde\b/giu, "de")
    .replace(/\bd['’]\s*/giu, "d'")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeTranslatedText(block: TextBlock, text: string): string {
  let normalized = text.replace(/[ \t]+/g, " ").trim()

  if (block.role === "section_header") {
    normalized = compactSectionHeaderText(normalized)
  }

  if (block.style.preserveLineBreaks) {
    return normalized.replace(/\s*\n\s*/g, "\n")
  }

  return normalized.replace(/\s*\n\s*/g, " ")
}

function getPrimaryTextSpan(block: TextBlock) {
  return (
    [...block.spans]
      .sort((left, right) => {
        const leftScore = left.text.trim().length * left.bbox.width
        const rightScore = right.text.trim().length * right.bbox.width
        return rightScore - leftScore
      })
      .find((span) => span.text.trim().length > 0) ?? block.spans[0]
  )
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
  newDoc.registerFontkit(fontkit)
  const fontCache = new Map<EmbeddedFontKey, PDFFont>()

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

      const { font, usesCustomFont } = await resolveFont(
        block,
        newDoc,
        fontCache
      )
      const referenceSpan = getPrimaryTextSpan(block)
      const defaultFontSize = referenceSpan?.fontSize ?? 12
      const colorHex = referenceSpan?.color ?? "#000000"
      const color = parseHexColor(colorHex)
      const layoutPlan = getLayoutPlan(block)
      const fontSizeFloor = getFontSizeFloor(block.role)

      const normalizedText = normalizeTranslatedText(
        block,
        translation.translatedText
      )
      const safeText = sanitizeText(normalizedText, usesCustomFont)
      if (safeText.trim().length === 0) continue

      eraseArea(newPage, block.bbox)

      const innerWidth = Math.max(
        block.bbox.width - layoutPlan.horizontalPadding * 2,
        8
      )
      const innerHeight = Math.max(
        block.bbox.height - layoutPlan.verticalPadding * 2,
        defaultFontSize
      )

      let currentPlan = layoutPlan
      let { fontSize, lines, overflow } = fitFontSize(
        safeText,
        innerWidth,
        innerHeight,
        font,
        defaultFontSize,
        Boolean(block.style.bullet),
        currentPlan.lineHeightRatio,
        Boolean(block.style.preserveLineBreaks)
      )

      if (isTightSidebarSectionHeader(block) && lines.length > 1) {
        const joined = safeText.replace(/\s+/g, " ").trim()
        const retry = fitFontSize(
          joined,
          innerWidth,
          innerHeight,
          font,
          defaultFontSize,
          false,
          1,
          false
        )
        fontSize = retry.fontSize
        lines = retry.lines
        overflow = retry.overflow
      }

      while (overflow && currentPlan.lineHeightRatio > 1.02) {
        currentPlan = {
          ...currentPlan,
          lineHeightRatio: Math.max(1.02, currentPlan.lineHeightRatio - 0.04),
        }
        const retry = fitFontSize(
          safeText,
          innerWidth,
          innerHeight,
          font,
          defaultFontSize,
          Boolean(block.style.bullet),
          currentPlan.lineHeightRatio,
          Boolean(block.style.preserveLineBreaks)
        )
        fontSize = retry.fontSize
        lines = retry.lines
        overflow = retry.overflow
        if (!overflow) break
      }

      if (fontSize < fontSizeFloor) {
        fontSize = fontSizeFloor
        lines = wrapText(
          safeText,
          innerWidth,
          font,
          fontSize,
          Boolean(block.style.bullet),
          Boolean(block.style.preserveLineBreaks)
        )
        const totalHeight =
          lines.length * fontSize * currentPlan.lineHeightRatio
        const maxLineWidth = lines.reduce(
          (width, line) =>
            Math.max(width, getWrappedLineWidth(line, font, fontSize)),
          0
        )
        overflow = totalHeight > innerHeight || maxLineWidth > innerWidth
      }

      if (overflow) {
        warnings.push(`Text overflow in ${block.id}`)
      }

      try {
        drawLines(
          newPage,
          block,
          block.bbox,
          lines,
          font,
          fontSize,
          currentPlan.lineHeightRatio,
          color
        )
      } catch {
        continue
      }
    }
  }

  const pdfBytes = await newDoc.save()
  return { buffer: Buffer.from(pdfBytes), warnings }
}
