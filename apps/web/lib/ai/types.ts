import type { SupportedLanguageCode } from "@/lib/config"
import type { TextBlock } from "@/lib/pdf/types"

export type TranslationRequest = {
  blocks: TranslationBlock[]
  sourceLang: SupportedLanguageCode
  targetLang: SupportedLanguageCode
  context?: {
    documentTitle?: string
    documentType?: "resume" | "cover_letter" | "general"
  }
}

export type TranslationBlock = {
  id: string
  text: string
  styleHint?:
    | "heading"
    | "body"
    | "bullet"
    | "label"
    | "caption"
    | "section_header"
    | "summary"
    | "metadata_row"
    | "sidebar_item"
    | "grid_item"
    | "language_item"
  compact?: boolean
  region?: TextBlock["region"]
}

export type TranslationResponse = {
  translations: TranslatedBlock[]
}

export type TranslatedBlock = {
  id: string
  translatedText: string
  preserveOriginal?: boolean
  notes?: string[]
}

export function textBlocksToTranslationBlocks(
  blocks: TextBlock[]
): TranslationBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    text: block.text,
    styleHint: inferStyleHint(block),
    compact: block.style.compact,
    region: block.region,
  }))
}

function inferStyleHint(block: TextBlock): TranslationBlock["styleHint"] {
  if (block.role === "section_header") return "section_header"
  if (block.role === "summary") return "summary"
  if (block.role === "metadata_row") return "metadata_row"
  if (block.role === "grid_item") return "grid_item"
  if (block.role === "language_item") return "language_item"
  if (block.role === "sidebar_item") return "sidebar_item"
  if (block.style.bullet) return "bullet"

  const avgFontSize =
    block.spans.length > 0
      ? block.spans.reduce((sum, s) => sum + s.fontSize, 0) / block.spans.length
      : 12

  if (avgFontSize >= 16 || block.role === "display_heading") return "heading"
  if (avgFontSize <= 9) return "caption"
  if (block.text.length < 30 && !block.text.includes(" ")) return "label"
  return "body"
}
