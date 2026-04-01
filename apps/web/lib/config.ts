export const config = {
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: process.env.OPENROUTER_MODEL ?? "qwen/qwen3.6-plus-preview:free",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  upload: {
    maxFileSizeMB: Number(process.env.MAX_FILE_SIZE_MB ?? 10),
    maxPages: Number(process.env.MAX_PAGES ?? 5),
    allowedMimeTypes: ["application/pdf"] as const,
  },
  job: {
    expiryMs: 30 * 60 * 1000,
    cleanupIntervalMs: 5 * 60 * 1000,
    pollIntervalMs: 1500,
  },
  supportedLanguages: [
    { code: "fr", label: "French", flag: "🇫🇷" },
    { code: "en", label: "English", flag: "🇬🇧" },
    { code: "ar", label: "Arabic", flag: "🇸🇦" },
    { code: "es", label: "Spanish", flag: "🇪🇸" },
    { code: "de", label: "German", flag: "🇩🇪" },
    { code: "it", label: "Italian", flag: "🇮🇹" },
  ] as const,
} as const

export type SupportedLanguageCode =
  (typeof config.supportedLanguages)[number]["code"]
