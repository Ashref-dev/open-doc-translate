import type {
  RawTextItem,
  RawTextStyle,
  TextBlock,
  TextSpan,
  BBox,
  BlockStyle,
} from "@/lib/pdf/types"

type LineItem = {
  item: RawTextItem
  x: number
  baselineY: number
  fontSize: number
  fontName: string
  ascent: number
  descent: number
}

type TextLine = {
  items: LineItem[]
  baselineY: number
  minX: number
  maxX: number
  topY: number
  bottomY: number
  fontSize: number
  fontName: string
}

export function clusterTextItems(
  items: RawTextItem[],
  styles: Record<string, RawTextStyle>,
  _pageHeight: number,
  pageIndex: number
): TextBlock[] {
  if (items.length === 0) return []

  const lineItems = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => toLineItem(item, styles))

  const lines = groupIntoLines(lineItems)
  const blocks = groupIntoBlocks(lines)

  return blocks.map((block, index) =>
    toTextBlock(block, styles, pageIndex, index)
  )
}

function toLineItem(
  item: RawTextItem,
  styles: Record<string, RawTextStyle>
): LineItem {
  const fontSize = Math.abs(item.transform[3] ?? 12) || 12
  const x = item.transform[4] ?? 0
  const baselineY = item.transform[5] ?? 0

  const style = styles[item.fontName]
  const ascent = style ? style.ascent * fontSize : fontSize * 0.8
  const descent = style ? Math.abs(style.descent) * fontSize : fontSize * 0.2

  return {
    item,
    x,
    baselineY,
    fontSize,
    fontName: item.fontName,
    ascent,
    descent,
  }
}

function groupIntoLines(items: LineItem[]): TextLine[] {
  const sorted = [...items].sort(
    (a, b) => b.baselineY - a.baselineY || a.x - b.x
  )

  const lines: TextLine[] = []
  let currentLine: LineItem[] = []
  let currentY = Infinity

  const Y_TOLERANCE = 3

  for (const item of sorted) {
    if (
      currentLine.length === 0 ||
      Math.abs(item.baselineY - currentY) <= Y_TOLERANCE
    ) {
      currentLine.push(item)
      if (currentLine.length === 1) currentY = item.baselineY
    } else {
      lines.push(buildLine(currentLine))
      currentLine = [item]
      currentY = item.baselineY
    }
  }

  if (currentLine.length > 0) {
    lines.push(buildLine(currentLine))
  }

  return lines
}

function buildLine(items: LineItem[]): TextLine {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  const primaryFont = getMostCommonFont(sorted)
  const primarySize = getMostCommonFontSize(sorted)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!

  let topY = -Infinity
  let bottomY = Infinity
  for (const item of sorted) {
    topY = Math.max(topY, item.baselineY + item.ascent)
    bottomY = Math.min(bottomY, item.baselineY - item.descent)
  }

  return {
    items: sorted,
    baselineY: first.baselineY,
    minX: first.x,
    maxX: last.x + last.item.width,
    topY,
    bottomY,
    fontSize: primarySize,
    fontName: primaryFont,
  }
}

function groupIntoBlocks(lines: TextLine[]): TextLine[][] {
  if (lines.length === 0) return []

  const sorted = [...lines].sort((a, b) => b.baselineY - a.baselineY)
  const blocks: TextLine[][] = []
  let currentBlock: TextLine[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const prevLine = sorted[i - 1]!
    const currLine = sorted[i]!

    const verticalGap = prevLine.bottomY - currLine.topY
    const expectedLineHeight = prevLine.fontSize * 1.5
    const fontSizeRatio =
      Math.min(prevLine.fontSize, currLine.fontSize) /
      Math.max(prevLine.fontSize, currLine.fontSize)
    const sameFontSize = fontSizeRatio > 0.8
    const horizontalOverlap = hasHorizontalOverlap(prevLine, currLine)

    const shouldMerge =
      Math.abs(verticalGap) <= expectedLineHeight * 1.3 &&
      sameFontSize &&
      horizontalOverlap

    if (shouldMerge) {
      currentBlock.push(currLine)
    } else {
      blocks.push(currentBlock)
      currentBlock = [currLine]
    }
  }

  blocks.push(currentBlock)
  return blocks
}

function hasHorizontalOverlap(a: TextLine, b: TextLine): boolean {
  const margin = 50
  return a.minX < b.maxX + margin && b.minX < a.maxX + margin
}

function toTextBlock(
  lines: TextLine[],
  styles: Record<string, RawTextStyle>,
  pageIndex: number,
  readingOrder: number
): TextBlock {
  const allItems = lines.flatMap((line) => line.items)

  const sortedLines = [...lines].sort((a, b) => b.baselineY - a.baselineY)
  const text = sortedLines
    .map((line) =>
      [...line.items]
        .sort((a, b) => a.x - b.x)
        .map((item) => item.item.str)
        .join("")
    )
    .join("\n")

  const bbox = computeBBox(lines)

  const spans: TextSpan[] = allItems.map((item) => ({
    text: item.item.str,
    bbox: {
      x: item.x,
      y: item.baselineY,
      width: item.item.width,
      height: item.fontSize,
    },
    fontFamily: styles[item.fontName]?.fontFamily,
    fontSize: item.fontSize,
    color: "#000000",
    fontWeight: detectBold(item.fontName) ? "bold" : "normal",
    fontStyle: detectItalic(item.fontName) ? "italic" : "normal",
  }))

  const avgFontSize =
    allItems.reduce((sum, item) => sum + item.fontSize, 0) / allItems.length
  const hasBullet = /^[\s]*[•\-–—▪▸►◦‣⁃>*]/.test(text)

  const blockStyle: BlockStyle = {
    align: detectAlignment(lines, bbox),
    lineHeight:
      sortedLines.length > 1
        ? Math.abs(
            (sortedLines[0]?.baselineY ?? 0) - (sortedLines[1]?.baselineY ?? 0)
          ) / avgFontSize
        : undefined,
    bullet: hasBullet,
  }

  return {
    id: `block-${pageIndex}-${readingOrder}`,
    page: pageIndex,
    bbox,
    text,
    spans,
    style: blockStyle,
    readingOrder,
  }
}

function computeBBox(lines: TextLine[]): BBox {
  let minX = Infinity
  let maxX = -Infinity
  let topY = -Infinity
  let bottomY = Infinity

  for (const line of lines) {
    minX = Math.min(minX, line.minX)
    maxX = Math.max(maxX, line.maxX)
    topY = Math.max(topY, line.topY)
    bottomY = Math.min(bottomY, line.bottomY)
  }

  const H_PAD = 4
  const V_PAD_TOP = 3
  const V_PAD_BOTTOM = 5

  return {
    x: minX - H_PAD,
    y: bottomY - V_PAD_BOTTOM,
    width: maxX - minX + H_PAD * 2,
    height: topY - bottomY + V_PAD_TOP + V_PAD_BOTTOM,
  }
}

function detectAlignment(
  lines: TextLine[],
  bbox: BBox
): "left" | "center" | "right" {
  if (lines.length < 2) return "left"

  const CENTER_TOLERANCE = 5
  const centers = lines.map((line) => (line.minX + line.maxX) / 2)
  const bboxCenter = bbox.x + bbox.width / 2

  const allCentered = centers.every(
    (c) => Math.abs(c - bboxCenter) < CENTER_TOLERANCE
  )
  if (allCentered) return "center"

  const rightEdges = lines.map((line) => line.maxX)
  const firstRightEdge = rightEdges[0] ?? 0
  const allRightAligned = rightEdges.every(
    (r) => Math.abs(r - firstRightEdge) < CENTER_TOLERANCE
  )
  if (allRightAligned && !allCentered) return "right"

  return "left"
}

function detectBold(fontName: string): boolean {
  const lower = fontName.toLowerCase()
  return (
    lower.includes("bold") ||
    lower.includes("-bd") ||
    lower.includes("_bd") ||
    lower.endsWith("-b")
  )
}

function detectItalic(fontName: string): boolean {
  const lower = fontName.toLowerCase()
  return (
    lower.includes("italic") ||
    lower.includes("oblique") ||
    lower.includes("-it") ||
    lower.includes("_it")
  )
}

function getMostCommonFont(items: LineItem[]): string {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.fontName, (counts.get(item.fontName) ?? 0) + 1)
  }
  let maxFont = items[0]!.fontName
  let maxCount = 0
  for (const [font, count] of counts) {
    if (count > maxCount) {
      maxFont = font
      maxCount = count
    }
  }
  return maxFont
}

function getMostCommonFontSize(items: LineItem[]): number {
  const counts = new Map<number, number>()
  for (const item of items) {
    const rounded = Math.round(item.fontSize * 10) / 10
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1)
  }
  let maxSize = items[0]!.fontSize
  let maxCount = 0
  for (const [size, count] of counts) {
    if (count > maxCount) {
      maxSize = size
      maxCount = count
    }
  }
  return maxSize
}
