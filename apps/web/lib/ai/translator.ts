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
const FETCH_TIMEOUT_MS = 90_000

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
  blocks: TranslationBlock[],
  sourceLang: SupportedLanguageCode,
  targetLang: SupportedLanguageCode
): Promise<TranslatedBlock[]> {
  const systemPrompt = buildSystemPrompt(sourceLang, targetLang)
  const userPrompt = buildUserPrompt(blocks)

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

  return translateBatch(translationBlocks, sourceLang, targetLang)
}
