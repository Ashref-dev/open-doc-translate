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

export function clusterTextItems(
  items: RawTextItem[],
  styles: Record<string, RawTextStyle>,
  _pageHeight: number,
  pageIndex: number
): TextBlock[] {
  if (items.length === 0) return []

  const lineItems = items
    .filter((item) => item.str.trim().length > 0)
    .filter((item) => !isIconOrSymbol(item.str))
    .map((item) => toLineItem(item, styles))

  const lines = groupIntoLines(lineItems)

  return lines.map((line, index) =>
    lineToTextBlock(line, styles, pageIndex, index)
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

function groupIntoLines(items: LineItem[]): LineItem[][] {
  const sorted = [...items].sort(
    (a, b) => b.baselineY - a.baselineY || a.x - b.x
  )

  const rawLines: LineItem[][] = []
  let currentLine: LineItem[] = []
  let currentY = Infinity

  const Y_TOLERANCE = 2

  for (const item of sorted) {
    if (
      currentLine.length === 0 ||
      Math.abs(item.baselineY - currentY) <= Y_TOLERANCE
    ) {
      currentLine.push(item)
      if (currentLine.length === 1) currentY = item.baselineY
    } else {
      rawLines.push(currentLine)
      currentLine = [item]
      currentY = item.baselineY
    }
  }

  if (currentLine.length > 0) {
    rawLines.push(currentLine)
  }

  const result: LineItem[][] = []
  for (const line of rawLines) {
    const segments = splitByGap(line)
    result.push(...segments)
  }

  return result
}

function splitByGap(items: LineItem[]): LineItem[][] {
  if (items.length <= 1) return [items]

  const sorted = [...items].sort((a, b) => a.x - b.x)
  const GAP_THRESHOLD = 20

  const segments: LineItem[][] = []
  let current: LineItem[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const curr = sorted[i]!
    const gap = curr.x - (prev.x + prev.item.width)

    if (gap > GAP_THRESHOLD) {
      segments.push(current)
      current = [curr]
    } else {
      current.push(curr)
    }
  }

  segments.push(current)
  return segments
}

function lineToTextBlock(
  items: LineItem[],
  styles: Record<string, RawTextStyle>,
  pageIndex: number,
  readingOrder: number
): TextBlock {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  const text = sorted.map((item) => item.item.str).join("")

  let minX = Infinity
  let maxX = -Infinity
  let topY = -Infinity
  let bottomY = Infinity

  for (const item of sorted) {
    minX = Math.min(minX, item.x)
    maxX = Math.max(maxX, item.x + item.item.width)
    topY = Math.max(topY, item.baselineY + item.ascent)
    bottomY = Math.min(bottomY, item.baselineY - item.descent)
  }

  const H_PAD = 4
  const V_PAD = 4

  const bbox: BBox = {
    x: minX - H_PAD,
    y: bottomY - V_PAD,
    width: maxX - minX + H_PAD * 2,
    height: topY - bottomY + V_PAD * 2,
  }

  const spans: TextSpan[] = sorted.map((item) => ({
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

  const blockStyle: BlockStyle = {
    align: "left",
    lineHeight: 1.2,
    bullet: /^[\s]*[•\-–—▪▸►◦‣⁃>*]/.test(text),
  }

  return {
    id: `line-${pageIndex}-${readingOrder}`,
    page: pageIndex,
    bbox,
    text,
    spans,
    style: blockStyle,
    readingOrder,
  }
}

function isIconOrSymbol(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed.length === 0) return true
  if (trimmed.length === 1) {
    const cp = trimmed.codePointAt(0) ?? 0
    if (cp < 0x20) return true
    if (cp >= 0xe000 && cp <= 0xf8ff) return true
    if (cp >= 0xf0000) return true
    if ("|•·—–".includes(trimmed)) return true
  }
  if (/^[\s|•·—–\-_=]+$/.test(trimmed)) return true
  return false
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
