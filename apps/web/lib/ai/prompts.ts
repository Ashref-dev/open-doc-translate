import type { SupportedLanguageCode } from "@/lib/config"
import { config } from "@/lib/config"
import type { TranslationBlock } from "@/lib/ai/types"

function getLanguageLabel(code: SupportedLanguageCode): string {
  const lang = config.supportedLanguages.find((l) => l.code === code)
  return lang?.label ?? code
}

export function buildSystemPrompt(
  sourceLang: SupportedLanguageCode,
  targetLang: SupportedLanguageCode
): string {
  const source = getLanguageLabel(sourceLang)
  const target = getLanguageLabel(targetLang)

  return `You are a professional resume and CV translator. Translate the following text blocks from ${source} to ${target}.

 Rules:
 - Preserve the factual meaning exactly. Do not add, remove, or embellish information.
 - Keep email addresses, URLs, and phone numbers unchanged.
 - Keep proper nouns and company names unchanged unless a widely accepted translated form exists.
 - Preserve placeholder tokens like [[KEEP_A]], [[KEEP_B]], etc. exactly as provided.
 - Keep numeric date values and punctuation unchanged, but translate month names and words like "Present" when appropriate for the target language.
 - Preserve original separators, bullets, and list markers.
 - Preserve resume hierarchy: section headers must remain short, strong labels; metadata rows must stay compact; grid/sidebar items must remain concise.
 - If a block is marked compact, prefer the shortest professional equivalent that preserves meaning.
 - For section headers and labels, avoid unnecessary articles or long paraphrases.
 - For metadata rows, keep company / location / date structure intact and compact.
 - For summary/profile blocks, preserve the concise professional tone and formatting emphasis.
 - Maintain a professional, concise tone appropriate for resumes and CVs.
 - Each block has an "id" and "text". Return a JSON object with a "translations" array.
- Each item in "translations" must have "id" (matching the input) and "translatedText" (the translated text).
- If a block contains only a number, symbol, or untranslatable content, return it unchanged and set "preserveOriginal" to true.

Respond ONLY with valid JSON in this exact format:
{
  "translations": [
    { "id": "block-id", "translatedText": "translated content" }
  ]
}`
}

export function buildUserPrompt(blocks: TranslationBlock[]): string {
  const payload = blocks.map((b) => ({
    id: b.id,
    text: b.text,
    ...(b.styleHint ? { styleHint: b.styleHint } : {}),
    ...(typeof b.compact === "boolean" ? { compact: b.compact } : {}),
    ...(b.region ? { region: b.region } : {}),
  }))

  return `Translate these text blocks. Copy placeholder tokens such as [[KEEP_A]] exactly as they appear and do not translate them:\n${JSON.stringify(payload, null, 2)}`
}
