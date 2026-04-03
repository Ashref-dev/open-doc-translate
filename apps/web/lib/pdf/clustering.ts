import type {
  RawTextItem,
  RawTextStyle,
  TextBlock,
  TextSpan,
  BBox,
  BlockStyle,
  BlockRegion,
  BlockRole,
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
  pageWidth: number,
  _pageHeight: number,
  pageIndex: number
): TextBlock[] {
  if (items.length === 0) return []

  const lineItems = items
    .filter((item) => shouldKeepItem(item.str))
    .map((item) => toLineItem(item, styles))

  const lines = groupIntoLines(lineItems)
  const lineBlocks = lines.map((line, index) =>
    lineToTextBlock(line, styles, pageIndex, index, pageWidth)
  )

  const mergedBlocks = mergeAdjacentBlocks(lineBlocks)
  return assignGridGroups(mergedBlocks)
}

function mergeAdjacentBlocks(blocks: TextBlock[]): TextBlock[] {
  if (blocks.length <= 1) return blocks

  const merged: TextBlock[] = []

  for (const block of blocks) {
    const mergeTargetIndex = findMergeTargetIndex(merged, block)
    if (mergeTargetIndex !== -1) {
      const previous = merged[mergeTargetIndex]
      if (!previous) continue
      merged[mergeTargetIndex] = mergeBlocks(previous, block)
      continue
    }

    merged.push(block)
  }

  return merged.map((block, index) => ({
    ...block,
    id: `line-${block.page}-${index}`,
    readingOrder: index,
  }))
}

function findMergeTargetIndex(blocks: TextBlock[], current: TextBlock): number {
  for (let index = blocks.length - 1; index >= 0; index--) {
    const candidate = blocks[index]
    if (!candidate) continue
    if (candidate.page !== current.page) break

    const verticalDistance =
      candidate.bbox.y - (current.bbox.y + current.bbox.height)
    if (verticalDistance > 80) break

    if (shouldMergeBlocks(candidate, current)) {
      return index
    }
  }

  return -1
}

function shouldMergeBlocks(previous: TextBlock, current: TextBlock): boolean {
  if (previous.page !== current.page) return false
  if (previous.style.bullet || current.style.bullet) return false
  if (looksStructured(previous.text) || looksStructured(current.text))
    return false
  if (looksHeadingLike(previous) || looksHeadingLike(current)) return false
  if (hasLargeInternalGap(previous) || hasLargeInternalGap(current))
    return false

  const previousBottomSpan = getBottomSpan(previous)
  const currentTopSpan = getTopSpan(current)
  const previousPrimarySpan = getPrimarySpan(previous)
  const currentPrimarySpan = getPrimarySpan(current)
  if (!previousBottomSpan || !currentTopSpan) return false
  if (!previousPrimarySpan || !currentPrimarySpan) return false

  if (
    Math.abs(previousPrimarySpan.fontSize - currentPrimarySpan.fontSize) > 1
  ) {
    return false
  }
  if (previousPrimarySpan.fontWeight !== currentPrimarySpan.fontWeight) {
    return false
  }
  if (previousPrimarySpan.fontStyle !== currentPrimarySpan.fontStyle) {
    return false
  }

  const baselineGap = previousBottomSpan.bbox.y - currentTopSpan.bbox.y
  const maxGap = Math.max(previousBottomSpan.fontSize * 2.3, 24)
  if (baselineGap <= 0 || baselineGap > maxGap) return false

  const xDelta = Math.abs(previous.bbox.x - current.bbox.x)
  const maxXDelta = Math.max(previousBottomSpan.fontSize * 2.5, 18)
  if (xDelta > maxXDelta) return false

  const overlap = getHorizontalOverlap(previous.bbox, current.bbox)
  const minWidth = Math.max(
    Math.min(previous.bbox.width, current.bbox.width),
    1
  )
  if (overlap / minWidth < 0.45) return false

  if (!isLikelyParagraphContinuation(previous.text, current.text)) return false

  return true
}

function mergeBlocks(previous: TextBlock, current: TextBlock): TextBlock {
  const text = joinBlockText(previous.text, current.text)
  const minX = Math.min(previous.bbox.x, current.bbox.x)
  const minY = Math.min(previous.bbox.y, current.bbox.y)
  const maxX = Math.max(
    previous.bbox.x + previous.bbox.width,
    current.bbox.x + current.bbox.width
  )
  const maxY = Math.max(
    previous.bbox.y + previous.bbox.height,
    current.bbox.y + current.bbox.height
  )

  return {
    ...previous,
    bbox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
    text,
    spans: [...previous.spans, ...current.spans],
    style: {
      ...previous.style,
      bullet: previous.style.bullet || current.style.bullet,
      compact: previous.style.compact || current.style.compact,
      preserveLineBreaks:
        previous.style.preserveLineBreaks || current.style.preserveLineBreaks,
    },
  }
}

function joinBlockText(previous: string, current: string): string {
  const prevTrimmed = previous.trimEnd()
  const currTrimmed = current.trimStart()

  if (prevTrimmed.length === 0) return currTrimmed
  if (currTrimmed.length === 0) return prevTrimmed

  if (
    endsWithSoftWrapHyphen(prevTrimmed) &&
    startsWithWordContinuation(currTrimmed)
  ) {
    return `${prevTrimmed.slice(0, -1)}${currTrimmed}`
  }

  if (
    shouldAvoidSpaceAfter(prevTrimmed) ||
    shouldAvoidSpaceBefore(currTrimmed)
  ) {
    return `${prevTrimmed}${currTrimmed}`
  }

  return `${prevTrimmed} ${currTrimmed}`
}

function endsWithSoftWrapHyphen(text: string): boolean {
  return /[A-Za-zÀ-ÖØ-öø-ÿ]-$/u.test(text)
}

function startsWithWordContinuation(text: string): boolean {
  return /^[a-zà-öø-ÿ]/u.test(text)
}

function isLikelyParagraphContinuation(
  previous: string,
  current: string
): boolean {
  const prevTrimmed = previous.trimEnd()
  const currTrimmed = current.trimStart()

  if (prevTrimmed.length === 0 || currTrimmed.length === 0) return false
  if (endsWithSoftWrapHyphen(prevTrimmed)) {
    return startsWithWordContinuation(currTrimmed)
  }

  if (startsWithWordContinuation(currTrimmed)) return true

  return /[,;:(/]$/u.test(prevTrimmed)
}

function getPrimarySpan(block: TextBlock): TextSpan | undefined {
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

function getTopSpan(block: TextBlock): TextSpan | undefined {
  return [...block.spans].sort((left, right) => right.bbox.y - left.bbox.y)[0]
}

function getBottomSpan(block: TextBlock): TextSpan | undefined {
  return [...block.spans].sort((left, right) => left.bbox.y - right.bbox.y)[0]
}

function looksStructured(text: string): boolean {
  return (
    isStructuredContactToken(text) ||
    /(?<!\w)(?:\+?\d[\d\s().\-/]{6,}\d)(?!\w)/.test(text) ||
    /@/.test(text)
  )
}

function looksHeadingLike(block: TextBlock): boolean {
  if (block.region === "sidebar" && block.bbox.width < 170) return false

  const text = block.text.trim()
  const primarySpan = getPrimarySpan(block)
  const fontSize = primarySpan?.fontSize ?? 0
  const isAllCaps = text.length > 0 && text === text.toUpperCase()

  if (isAllCaps && text.length <= 80) return true
  if (
    (primarySpan?.fontWeight === "bold" || fontSize >= 15) &&
    text.length <= 60
  ) {
    return true
  }

  return false
}

function hasLargeInternalGap(block: TextBlock): boolean {
  const sorted = [...block.spans].sort((a, b) => a.bbox.x - b.bbox.x)
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (!previous || !current) continue

    const gap = current.bbox.x - (previous.bbox.x + previous.bbox.width)
    const fontSize = Math.max(previous.fontSize, current.fontSize)
    if (gap > Math.max(fontSize * 1.8, 20)) {
      return true
    }
  }

  return false
}

function getHorizontalOverlap(left: BBox, right: BBox): number {
  const start = Math.max(left.x, right.x)
  const end = Math.min(left.x + left.width, right.x + right.width)
  return Math.max(0, end - start)
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
  readingOrder: number,
  pageWidth: number
): TextBlock {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  const contentItems = sorted.filter(
    (_, index) => !shouldSkipDecorativeContactItem(sorted, index)
  )
  const text = buildLineText(contentItems)

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

  const spans: TextSpan[] = contentItems.map((item) => ({
    text: item.item.str,
    bbox: {
      x: item.x,
      y: item.baselineY,
      width: item.item.width,
      height: item.fontSize,
    },
    fontName: item.fontName,
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

  const region = inferRegion(bbox, pageWidth)
  const role = inferRole(text, spans, bbox, region, blockStyle)
  blockStyle.compact =
    region === "sidebar" || role === "section_header" || role === "metadata_row"
  blockStyle.preserveLineBreaks =
    role === "metadata_row" || role === "grid_item" || role === "language_item"
  if (role === "grid_item") {
    blockStyle.gridColumn = inferGridColumn(bbox, pageWidth)
    blockStyle.gridColumns = 2
  }

  return {
    id: `line-${pageIndex}-${readingOrder}`,
    page: pageIndex,
    bbox,
    text,
    spans,
    style: blockStyle,
    role,
    region,
    readingOrder,
  }
}

function inferRegion(bbox: BBox, pageWidth: number): BlockRegion {
  const centerX = bbox.x + bbox.width / 2
  if (bbox.width >= pageWidth * 0.75) return "full"
  if (centerX < pageWidth * 0.42) return "sidebar"
  return "main"
}

function inferRole(
  text: string,
  spans: TextSpan[],
  bbox: BBox,
  region: BlockRegion,
  style: BlockStyle
): BlockRole {
  const trimmed = text.trim()
  const primarySpan =
    [...spans]
      .sort((left, right) => right.fontSize - left.fontSize)
      .find((span) => span.text.trim().length > 0) ?? spans[0]
  const fontSize = primarySpan?.fontSize ?? 0
  const isAllCaps = trimmed.length > 0 && trimmed === trimmed.toUpperCase()

  if (
    fontSize >= 18 ||
    (isAllCaps && trimmed.length <= 30 && region === "full")
  ) {
    return "display_heading"
  }

  if (looksSectionHeader(trimmed, fontSize, region)) {
    return "section_header"
  }

  if (region === "full" && bbox.height >= fontSize * 3) {
    return "summary"
  }

  if (isStructuredContactToken(trimmed)) {
    return "contact_item"
  }

  if (looksMetadataRow(trimmed)) {
    return "metadata_row"
  }

  if (looksEntryTitle(trimmed, fontSize, region)) {
    return "entry_title"
  }

  if (region === "sidebar" && looksLanguageItem(trimmed)) {
    return "language_item"
  }

  if (region === "sidebar" && looksGridItem(trimmed, bbox)) {
    return "grid_item"
  }

  if (style.bullet) {
    return "list_item"
  }

  if (region === "sidebar") {
    return "sidebar_item"
  }

  return "body"
}

function looksSectionHeader(
  text: string,
  fontSize: number,
  region: BlockRegion
): boolean {
  if (text.length === 0) return false
  const normalized = text.toUpperCase()
  const known = new Set([
    "CONTACT",
    "SKILLS",
    "INTERESTS",
    "LANGUAGES",
    "PROFESSIONAL EXPERIENCE",
    "EDUCATION",
  ])

  if (known.has(normalized)) return true
  return (
    text === normalized &&
    text.length <= 40 &&
    fontSize >= (region === "sidebar" ? 12 : 14)
  )
}

function looksEntryTitle(
  text: string,
  fontSize: number,
  region: BlockRegion
): boolean {
  if (region !== "main") return false
  if (text.length === 0 || text.length > 80) return false
  return (
    fontSize >= 11.5 &&
    /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(text) &&
    !looksMetadataRow(text)
  )
}

function looksMetadataRow(text: string): boolean {
  return /(?:19|20)\d{2}|PRESENT|EN COURS|JUNE|JUIL|NOV|DECEMBER|DÉCEMBRE|\/| - /iu.test(
    text
  )
}

function looksLanguageItem(text: string): boolean {
  return /LEVEL|NIVEAU|B1|B2|C1|C2|A1|A2/i.test(text)
}

function looksGridItem(text: string, bbox: BBox): boolean {
  return text.length <= 24 && bbox.width < 120 && /\p{L}/u.test(text)
}

function inferGridColumn(bbox: BBox, pageWidth: number): number {
  return bbox.x + bbox.width / 2 < pageWidth * 0.18 ? 0 : 1
}

function assignGridGroups(blocks: TextBlock[]): TextBlock[] {
  const result = [...blocks]
  let groupCounter = 0

  for (let index = 0; index < result.length; index++) {
    const block = result[index]
    if (!block || block.role !== "grid_item" || block.groupId) continue

    const partnerIndex = result.findIndex((candidate, candidateIndex) => {
      if (candidateIndex === index || !candidate) return false
      if (candidate.role !== "grid_item" || candidate.region !== block.region)
        return false
      if (candidate.groupId) return false
      return Math.abs(candidate.bbox.y - block.bbox.y) <= 2
    })

    if (partnerIndex === -1) continue

    const groupId = `grid-${groupCounter++}`
    result[index] = { ...block, groupId }
    const partner = result[partnerIndex]
    if (partner) {
      result[partnerIndex] = { ...partner, groupId }
    }
  }

  return result
}

function shouldKeepItem(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length === 1) {
    const cp = trimmed.codePointAt(0) ?? 0
    if (cp < 0x20) return false
    if (cp >= 0xe000 && cp <= 0xf8ff) return false
    if (cp >= 0xf0000) return false
  }
  return true
}

function isStructuredContactToken(text: string): boolean {
  return (
    /@/.test(text) ||
    /(?:https?:\/\/|www\.)/i.test(text) ||
    /(?<!\w)(?:\+?\d[\d\s().\-/]{6,}\d)(?!\w)/.test(text)
  )
}

function isLikelyLocationText(text: string): boolean {
  return /\p{L}/u.test(text) && (text.match(/\p{L}+/gu)?.length ?? 0) <= 4
}

function isContactLikeLine(items: LineItem[]): boolean {
  let structuredCount = 0

  for (const item of items) {
    if (isStructuredContactToken(item.item.str.trim())) {
      structuredCount += 1
    }
  }

  return structuredCount >= 2
}

function shouldSkipDecorativeContactItem(
  items: LineItem[],
  index: number
): boolean {
  if (!isContactLikeLine(items)) return false

  const current = items[index]
  if (!current) return false

  const text = current.item.str.trim()
  if (text.length !== 1) return false
  if (isSeparatorToken(text) || text === "•") return false

  const previous = items[index - 1]?.item.str.trim() ?? ""
  const next = items[index + 1]?.item.str.trim() ?? ""

  const startsContactGroup = index === 0 || isSeparatorToken(previous)
  const nextLooksLikeContactContent =
    isStructuredContactToken(next) || isLikelyLocationText(next)

  if (!startsContactGroup || !nextLooksLikeContactContent) {
    return false
  }

  return true
}

function buildLineText(items: LineItem[]): string {
  let text = ""

  for (let i = 0; i < items.length; i++) {
    const current = items[i]
    if (!current) continue

    if (i === 0) {
      text += current.item.str
      continue
    }

    const previous = items[i - 1]
    if (!previous) {
      text += current.item.str
      continue
    }

    const gap = current.x - (previous.x + previous.item.width)
    text += inferJoiner(previous, current, gap)
    text += current.item.str
  }

  return text
}

function inferJoiner(
  previous: LineItem,
  current: LineItem,
  gap: number
): string {
  if (gap <= 0.5) return ""

  const prevText = previous.item.str
  const currText = current.item.str

  if (prevText.endsWith(" ") || currText.startsWith(" ")) return ""

  const prevTrimmed = prevText.trimEnd()
  const currTrimmed = currText.trimStart()

  if (prevTrimmed.length === 0 || currTrimmed.length === 0) return ""

  if (isSeparatorToken(prevTrimmed) || isSeparatorToken(currTrimmed)) {
    return " "
  }

  if (
    shouldAvoidSpaceAfter(prevTrimmed) ||
    shouldAvoidSpaceBefore(currTrimmed)
  ) {
    return ""
  }

  const fontSize = Math.max(previous.fontSize, current.fontSize)
  const spaceThreshold = Math.max(fontSize * 0.2, 1.5)
  return gap >= spaceThreshold ? " " : ""
}

function isSeparatorToken(text: string): boolean {
  return /^[|•·—–▪◦‣⁃]+$/.test(text)
}

function shouldAvoidSpaceBefore(text: string): boolean {
  return /^[,.;:!?%)\]}]/.test(text)
}

function shouldAvoidSpaceAfter(text: string): boolean {
  return /[({/]$/.test(text) || text.endsWith("[") || text.endsWith("$")
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
