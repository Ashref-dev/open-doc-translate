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
  y: number
  fontSize: number
  fontName: string
}

type TextLine = {
  items: LineItem[]
  y: number
  minX: number
  maxX: number
  fontSize: number
  fontName: string
}

export function clusterTextItems(
  items: RawTextItem[],
  styles: Record<string, RawTextStyle>,
  pageHeight: number,
  pageIndex: number
): TextBlock[] {
  if (items.length === 0) return []

  const lineItems = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => toLineItem(item, pageHeight))

  const lines = groupIntoLines(lineItems)
  const blocks = groupIntoBlocks(lines, pageHeight)

  return blocks.map((block, index) =>
    toTextBlock(block, styles, pageIndex, index)
  )
}

function toLineItem(item: RawTextItem, pageHeight: number): LineItem {
  const fontSize = Math.abs(item.transform[3] ?? 12)
  const x = item.transform[4] ?? 0
  const yFromBottom = item.transform[5] ?? 0
  const y = pageHeight - yFromBottom

  return {
    item,
    x,
    y,
    fontSize: fontSize || 12,
    fontName: item.fontName,
  }
}

function groupIntoLines(items: LineItem[]): TextLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)

  const lines: TextLine[] = []
  let currentLine: LineItem[] = []
  let currentY = -Infinity

  const Y_TOLERANCE = 3

  for (const item of sorted) {
    if (
      currentLine.length === 0 ||
      Math.abs(item.y - currentY) <= Y_TOLERANCE
    ) {
      currentLine.push(item)
      if (currentLine.length === 1) currentY = item.y
    } else {
      lines.push(buildLine(currentLine))
      currentLine = [item]
      currentY = item.y
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

  return {
    items: sorted,
    y: first.y,
    minX: first.x,
    maxX: last.x + last.item.width,
    fontSize: primarySize,
    fontName: primaryFont,
  }
}

function groupIntoBlocks(lines: TextLine[], _pageHeight: number): TextLine[][] {
  if (lines.length === 0) return []

  const sorted = [...lines].sort((a, b) => a.y - b.y)
  const blocks: TextLine[][] = []
  let currentBlock: TextLine[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const prevLine = sorted[i - 1]!
    const currLine = sorted[i]!

    const verticalGap = currLine.y - prevLine.y
    const expectedLineHeight = prevLine.fontSize * 1.5
    const fontSizeRatio =
      Math.min(prevLine.fontSize, currLine.fontSize) /
      Math.max(prevLine.fontSize, currLine.fontSize)
    const sameFontSize = fontSizeRatio > 0.8
    const horizontalOverlap = hasHorizontalOverlap(prevLine, currLine)

    const shouldMerge =
      verticalGap <= expectedLineHeight * 1.3 &&
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
  const bbox = computeBBox(allItems)
  const text = lines
    .map((line) => line.items.map((item) => item.item.str).join(""))
    .join("\n")

  const spans: TextSpan[] = allItems.map((item) => ({
    text: item.item.str,
    bbox: {
      x: item.x,
      y: item.y,
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
      lines.length > 1
        ? ((lines[1]?.y ?? 0) - (lines[0]?.y ?? 0)) / avgFontSize
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

function computeBBox(items: LineItem[]): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const item of items) {
    minX = Math.min(minX, item.x)
    minY = Math.min(minY, item.y)
    maxX = Math.max(maxX, item.x + item.item.width)
    maxY = Math.max(maxY, item.y + item.fontSize)
  }

  const PADDING = 2

  return {
    x: minX - PADDING,
    y: minY - PADDING,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
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
