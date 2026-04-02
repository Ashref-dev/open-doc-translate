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

  const lines: LineItem[][] = []
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
      lines.push(currentLine)
      currentLine = [item]
      currentY = item.baselineY
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines
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

  const H_PAD = 2
  const V_PAD = 2

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
