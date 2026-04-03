import type { SupportedLanguageCode } from "@/lib/config"
import { config } from "@/lib/config"
import type { TextBlock } from "@/lib/pdf/types"
import type {
  TranslatedBlock,
  TranslationBlock,
  TranslationResponse,
} from "@/lib/ai/types"
import { textBlocksToTranslationBlocks } from "@/lib/ai/types"
import { buildSystemPrompt, buildUserPrompt } from "@/lib/ai/prompts"

const MAX_RETRIES = 3
const BASE_DELAY_MS = 2000
const FETCH_TIMEOUT_MS = 180_000
const BATCH_SIZE = 12

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const URL_REGEX = /\b(?:https?:\/\/|www\.)\S+\b/giu
const PHONE_REGEX = /(?<!\w)(?:\+?\d[\d\s().\-/]{6,}\d)(?!\w)/g
const NUMERIC_DATE_REGEX = /\b\d{1,4}(?:[./-]\d{1,4})+\b/g
const YEAR_REGEX = /\b(?:19|20)\d{2}\b/g
const DATE_RANGE_REGEX =
  /\b(?:[A-ZÀ-ÖØ-Þ][\p{L}.]+\s+)?(?:19|20)?\d{2,4}\s*[-–—/]\s*(?:[A-ZÀ-ÖØ-Þ][\p{L}.]+\s+)?(?:PRESENT|EN COURS|CURRENT|(?:19|20)?\d{2,4})\b/giu

type ProtectedToken = {
  placeholder: string
  value: string
}

type PreparedTranslationBlock = {
  original: TranslationBlock
  promptBlock: TranslationBlock
  protectedTokens: ProtectedToken[]
}

const COMPACT_LABEL_MAP: Record<string, Record<string, string>> = {
  fr: {
    CONTACT: "CONTACT",
    SKILLS: "APTITUDES",
    INTERESTS: "INTÉRÊTS",
    LANGUAGES: "LANGUES",
    EDUCATION: "FORMATION",
    "PROFESSIONAL EXPERIENCE": "EXPÉRIENCE PROFESSIONNELLE",
    PRESENT: "EN COURS",
  },
}

const FRENCH_METADATA_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bjanvier\b/giu, "JANV."],
  [/\bf[ée]vrier\b/giu, "FÉVR."],
  [/\bmars\b/giu, "MARS"],
  [/\bavril\b/giu, "AVR."],
  [/\bmai\b/giu, "MAI"],
  [/\bjuin\b/giu, "JUIN"],
  [/\bjuillet\b/giu, "JUIL."],
  [/\bao[uû]t\b/giu, "AOÛT"],
  [/\bseptembre\b/giu, "SEPT."],
  [/\boctobre\b/giu, "OCT."],
  [/\bnovembre\b/giu, "NOV."],
  [/\bd[ée]cembre\b/giu, "DÉC."],
  [/\bjanuary\b/giu, "JAN."],
  [/\bfebruary\b/giu, "FEB."],
  [/\bmarch\b/giu, "MAR."],
  [/\bapril\b/giu, "APR."],
  [/\bmay\b/giu, "MAY"],
  [/\bjune\b/giu, "JUNE"],
  [/\bjuly\b/giu, "JUL."],
  [/\baugust\b/giu, "AUG."],
  [/\bseptember\b/giu, "SEPT."],
  [/\boctober\b/giu, "OCT."],
  [/\bnovember\b/giu, "NOV."],
  [/\bdecember\b/giu, "DEC."],
  [/\bpresent\b/giu, "EN COURS"],
  [/\bcurrent\b/giu, "EN COURS"],
  [/\ben cours\b/giu, "EN COURS"],
]

type OpenRouterMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type OpenRouterResponse = {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toPlaceholder(index: number): string {
  let value = index
  let token = ""

  do {
    token = String.fromCharCode(65 + (value % 26)) + token
    value = Math.floor(value / 26) - 1
  } while (value >= 0)

  return `[[KEEP_${token}]]`
}

function replaceWithPlaceholders(
  text: string,
  regex: RegExp,
  protectedTokens: ProtectedToken[]
): string {
  return text.replace(regex, (match) => {
    const placeholder = toPlaceholder(protectedTokens.length)
    protectedTokens.push({ placeholder, value: match })
    return placeholder
  })
}

function hasMatch(regex: RegExp, text: string): boolean {
  regex.lastIndex = 0
  const matched = regex.test(text)
  regex.lastIndex = 0
  return matched
}

function isSeparatorLikeText(text: string): boolean {
  return /^[|•·—–▪◦‣⁃]+$/.test(text)
}

function isStructuredContactText(text: string): boolean {
  return (
    hasMatch(EMAIL_REGEX, text) ||
    hasMatch(URL_REGEX, text) ||
    hasMatch(PHONE_REGEX, text)
  )
}

function shouldProtectFragileSpan(
  block: TextBlock,
  spanIndex: number
): boolean {
  const span = block.spans[spanIndex]
  const trimmed = span?.text.trim() ?? ""

  if (trimmed.length === 0) return false
  if (isSeparatorLikeText(trimmed)) return true

  if (trimmed.length === 1) {
    const cp = trimmed.codePointAt(0) ?? 0
    if (cp < 0x20 || cp >= 0x7f) {
      return true
    }
  }

  if (!isStructuredContactText(block.text) || trimmed.length !== 1) {
    return block.role === "metadata_row" && isSeparatorLikeText(trimmed)
  }

  const previous = block.spans[spanIndex - 1]?.text.trim() ?? ""
  const next = block.spans[spanIndex + 1]?.text.trim() ?? ""

  return (
    isSeparatorLikeText(previous) ||
    isSeparatorLikeText(next) ||
    isStructuredContactText(previous) ||
    isStructuredContactText(next) ||
    (spanIndex === 0 && block.spans.length > 1)
  )
}

function protectFragileSpans(block: TextBlock): {
  text: string
  protectedTokens: ProtectedToken[]
} {
  let blockCursor = 0
  let text = ""
  const protectedTokens: ProtectedToken[] = []

  for (let index = 0; index < block.spans.length; index++) {
    const span = block.spans[index]
    if (!span || span.text.length === 0) continue

    const start = block.text.indexOf(span.text, blockCursor)
    if (start === -1) {
      continue
    }

    text += block.text.slice(blockCursor, start)

    if (shouldProtectFragileSpan(block, index)) {
      const placeholder = toPlaceholder(protectedTokens.length)
      protectedTokens.push({ placeholder, value: span.text })
      text += placeholder
    } else {
      text += span.text
    }

    blockCursor = start + span.text.length
  }

  text += block.text.slice(blockCursor)

  return { text, protectedTokens }
}

function protectStructuredTokens(
  text: string,
  protectedTokens: ProtectedToken[]
): string {
  let result = text
  result = replaceWithPlaceholders(result, EMAIL_REGEX, protectedTokens)
  result = replaceWithPlaceholders(result, URL_REGEX, protectedTokens)
  result = replaceWithPlaceholders(result, PHONE_REGEX, protectedTokens)
  result = replaceWithPlaceholders(result, NUMERIC_DATE_REGEX, protectedTokens)
  result = replaceWithPlaceholders(result, YEAR_REGEX, protectedTokens)

  return result
}

function restoreProtectedTokens(
  text: string,
  protectedTokens: ProtectedToken[]
): string {
  let result = text
  for (const token of [...protectedTokens].reverse()) {
    result = result.split(token.placeholder).join(token.value)
  }
  return result
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
}

function postProcessTranslation(
  block: TranslationBlock,
  text: string,
  targetLang: SupportedLanguageCode
): string {
  let result = normalizeWhitespace(text)

  if (targetLang === "fr" && block.styleHint === "metadata_row") {
    for (const [pattern, replacement] of FRENCH_METADATA_REPLACEMENTS) {
      result = result.replace(pattern, replacement)
    }
  }

  return result
}

function applyCompactLabelMap(
  block: TranslationBlock,
  targetLang: SupportedLanguageCode
): string | null {
  const mapping = COMPACT_LABEL_MAP[targetLang]
  if (!mapping) return null

  const key = normalizeWhitespace(block.text).toUpperCase()
  if (block.styleHint === "section_header" || block.styleHint === "label") {
    return mapping[key] ?? null
  }

  return null
}

function getWordCountOutsideStructuredTokens(text: string): number {
  const scrubbed = text
    .replace(EMAIL_REGEX, " ")
    .replace(URL_REGEX, " ")
    .replace(PHONE_REGEX, " ")
    .replace(NUMERIC_DATE_REGEX, " ")
    .replace(YEAR_REGEX, " ")
    .replace(/[|•·—–▪◦‣⁃/_\\-]+/g, " ")

  return scrubbed.match(/\p{L}+/gu)?.length ?? 0
}

function shouldPreserveOriginalBlock(block: TranslationBlock): boolean {
  const text = block.text.trim()
  if (text.length === 0) return true

  if (/^[\s|•·—–▪◦‣⁃/_\\=+:,.()-]+$/.test(text)) {
    return true
  }

  if (
    isStructuredContactText(text) &&
    getWordCountOutsideStructuredTokens(text) === 0
  ) {
    return true
  }

  return false
}

function prepareTranslationBlocks(
  blocks: TextBlock[],
  translationBlocks: TranslationBlock[]
): {
  prepared: PreparedTranslationBlock[]
  preserved: TranslatedBlock[]
} {
  const prepared: PreparedTranslationBlock[] = []
  const preserved: TranslatedBlock[] = []

  for (let index = 0; index < translationBlocks.length; index++) {
    const translationBlock = translationBlocks[index]
    const sourceBlock = blocks[index]
    if (!translationBlock || !sourceBlock) continue

    if (shouldPreserveOriginalBlock(translationBlock)) {
      preserved.push({
        id: translationBlock.id,
        translatedText: translationBlock.text,
        preserveOriginal: true,
        notes: ["Structured contact or separator content preserved verbatim"],
      })
      continue
    }

    const protectedContent = protectFragileSpans(sourceBlock)
    const promptText = protectStructuredTokens(
      protectedContent.text,
      protectedContent.protectedTokens
    )

    prepared.push({
      original: translationBlock,
      promptBlock: {
        ...translationBlock,
        text: promptText,
      },
      protectedTokens: protectedContent.protectedTokens,
    })
  }

  return { prepared, preserved }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

async function callOpenRouter(messages: OpenRouterMessage[]): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
      await sleep(delay)
    }

    const response = await fetch(
      `${config.openrouter.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openrouter.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.openrouter.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    )

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      lastError = new Error(`OpenRouter API error ${response.status}: ${body}`)

      if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
        continue
      }

      throw lastError
    }

    const data = (await response.json()) as OpenRouterResponse
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error("OpenRouter returned empty response content")
    }

    return content
  }

  throw lastError ?? new Error("OpenRouter request failed after retries")
}

function parseTranslationResponse(raw: string): TranslatedBlock[] {
  let parsed: TranslationResponse

  try {
    parsed = JSON.parse(raw) as TranslationResponse
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from response")
    }
    parsed = JSON.parse(jsonMatch[0]) as TranslationResponse
  }

  if (!Array.isArray(parsed.translations)) {
    throw new Error("Response missing translations array")
  }

  return parsed.translations.map((t) => ({
    id: t.id,
    translatedText: t.translatedText,
    ...(t.preserveOriginal ? { preserveOriginal: t.preserveOriginal } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
  }))
}

async function translateBatch(
  blocks: PreparedTranslationBlock[],
  sourceLang: SupportedLanguageCode,
  targetLang: SupportedLanguageCode
): Promise<TranslatedBlock[]> {
  if (blocks.length === 0) {
    return []
  }

  const systemPrompt = buildSystemPrompt(sourceLang, targetLang)
  const userPrompt = buildUserPrompt(blocks.map((block) => block.promptBlock))

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]

  let rawContent: string

  try {
    rawContent = await callOpenRouter(messages)
  } catch (error) {
    throw new Error(
      `Translation API call failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  let results: TranslatedBlock[]

  try {
    results = parseTranslationResponse(rawContent)
  } catch {
    // Retry once on malformed JSON
    rawContent = await callOpenRouter(messages)
    results = parseTranslationResponse(rawContent)
  }

  const resultMap = new Map(results.map((r) => [r.id, r]))

  return blocks.map((block) => {
    const compactMapped = applyCompactLabelMap(block.original, targetLang)
    const result = resultMap.get(block.original.id)
    if (result) {
      return {
        ...result,
        translatedText: postProcessTranslation(
          block.original,
          compactMapped ??
            restoreProtectedTokens(
              result.translatedText,
              block.protectedTokens
            ),
          targetLang
        ),
      }
    }

    const fallbackText = restoreProtectedTokens(
      block.promptBlock.text,
      block.protectedTokens
    )

    return {
      id: block.original.id,
      translatedText: postProcessTranslation(
        block.original,
        fallbackText,
        targetLang
      ),
      preserveOriginal: true,
      notes: [
        "Translation missing from API response — original text preserved",
      ],
    }
  })
}

async function translatePreparedBlocks(
  blocks: PreparedTranslationBlock[],
  sourceLang: SupportedLanguageCode,
  targetLang: SupportedLanguageCode
): Promise<TranslatedBlock[]> {
  if (blocks.length === 0) {
    return []
  }

  if (blocks.length <= BATCH_SIZE) {
    try {
      return await translateBatch(blocks, sourceLang, targetLang)
    } catch (error) {
      if (blocks.length === 1) {
        const [block] = blocks
        const fallbackText = restoreProtectedTokens(
          block?.promptBlock.text ?? "",
          block?.protectedTokens ?? []
        )

        return [
          {
            id: block?.original.id ?? "unknown",
            translatedText: fallbackText,
            preserveOriginal: true,
            notes: [
              `Translation fallback after batch failure: ${error instanceof Error ? error.message : String(error)}`,
            ],
          },
        ]
      }
    }
  }

  const midpoint = Math.ceil(blocks.length / 2)
  const [left, right] = await Promise.all([
    translatePreparedBlocks(blocks.slice(0, midpoint), sourceLang, targetLang),
    translatePreparedBlocks(blocks.slice(midpoint), sourceLang, targetLang),
  ])

  return [...left, ...right]
}

function mergeResultsInOriginalOrder(
  originalBlocks: TranslationBlock[],
  translatedBlocks: TranslatedBlock[]
): TranslatedBlock[] {
  const resultMap = new Map(translatedBlocks.map((block) => [block.id, block]))

  return originalBlocks.map((block) => {
    const result = resultMap.get(block.id)
    if (result) {
      return result
    }

    return {
      id: block.id,
      translatedText: block.text,
      preserveOriginal: true,
      notes: [
        "Translation missing from API response — original text preserved",
      ],
    }
  })
}

export async function translateBlocks(
  blocks: TextBlock[],
  sourceLang: SupportedLanguageCode,
  targetLang: SupportedLanguageCode,
  context?: { documentTitle?: string }
): Promise<TranslatedBlock[]> {
  if (blocks.length === 0) {
    return []
  }

  void context

  const translationBlocks = textBlocksToTranslationBlocks(blocks)
  const { prepared, preserved } = prepareTranslationBlocks(
    blocks,
    translationBlocks
  )

  if (prepared.length === 0) {
    return mergeResultsInOriginalOrder(translationBlocks, preserved)
  }

  const translated = await translatePreparedBlocks(
    prepared,
    sourceLang,
    targetLang
  )

  return mergeResultsInOriginalOrder(translationBlocks, [
    ...preserved,
    ...translated,
  ])
}
