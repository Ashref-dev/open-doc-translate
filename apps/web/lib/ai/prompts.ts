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
- Keep dates in their original format.
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
  }))

  return `Translate these text blocks:\n${JSON.stringify(payload, null, 2)}`
}
