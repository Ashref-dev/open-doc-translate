export type BBox = {
  x: number
  y: number
  width: number
  height: number
}

export type TextSpan = {
  text: string
  bbox: BBox
  fontName?: string
  fontFamily?: string
  fontSize: number
  color: string
  fontWeight?: "normal" | "bold"
  fontStyle?: "normal" | "italic"
}

export type BlockStyle = {
  align?: "left" | "center" | "right"
  lineHeight?: number
  bullet?: boolean
  compact?: boolean
  preserveLineBreaks?: boolean
  gridColumn?: number
  gridColumns?: number
}

export type BlockRegion = "full" | "sidebar" | "main"

export type BlockRole =
  | "display_heading"
  | "section_header"
  | "summary"
  | "entry_title"
  | "metadata_row"
  | "sidebar_item"
  | "grid_item"
  | "contact_item"
  | "language_item"
  | "list_item"
  | "body"

export type TextBlock = {
  id: string
  page: number
  bbox: BBox
  text: string
  spans: TextSpan[]
  style: BlockStyle
  role: BlockRole
  region: BlockRegion
  groupId?: string
  readingOrder: number
}

export type ImageBlock = {
  id: string
  page: number
  bbox: BBox
  dataUrl?: string
}

export type VectorElement = {
  id: string
  page: number
  bbox: BBox
}

export type PageModel = {
  width: number
  height: number
  textBlocks: TextBlock[]
  images: ImageBlock[]
  vectorElements: VectorElement[]
  rawItems?: RawTextItem[]
  rawStyles?: Record<string, RawTextStyle>
}

export type DocumentModel = {
  pages: PageModel[]
  metadata: {
    title?: string
    author?: string
    pageCount: number
    sourceLanguage?: string
  }
}

/** PDF.js transform: [scaleX, skewY, skewX, scaleY, translateX, translateY] */
export type RawTextItem = {
  str: string
  dir: string
  transform: number[]
  width: number
  height: number
  fontName: string
  hasEOL: boolean
}

export type RawTextStyle = {
  fontFamily: string
  ascent: number
  descent: number
  vertical: boolean
}

export type PdfValidationResult = {
  valid: boolean
  error?: string
  pageCount?: number
  hasText?: boolean
  fileSizeMB?: number
}
