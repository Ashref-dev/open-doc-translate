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
}

export type TextBlock = {
  id: string
  page: number
  bbox: BBox
  text: string
  spans: TextSpan[]
  style: BlockStyle
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
