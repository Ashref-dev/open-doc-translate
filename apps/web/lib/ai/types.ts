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
  styleHint?: "heading" | "body" | "bullet" | "label" | "caption"
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
  }))
}

function inferStyleHint(block: TextBlock): TranslationBlock["styleHint"] {
  if (block.style.bullet) return "bullet"

  const avgFontSize =
    block.spans.length > 0
      ? block.spans.reduce((sum, s) => sum + s.fontSize, 0) / block.spans.length
      : 12

  if (avgFontSize >= 16) return "heading"
  if (avgFontSize <= 9) return "caption"
  if (block.text.length < 30 && !block.text.includes(" ")) return "label"
  return "body"
}
