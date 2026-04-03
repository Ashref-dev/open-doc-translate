import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, extname, join, resolve } from "node:path"
import { parsePdf } from "@/lib/pdf/parser"
import { clusterTextItems } from "@/lib/pdf/clustering"
import { translateBlocks } from "@/lib/ai/translator"
import { generateTranslatedPdf } from "@/lib/pdf/generator"
import type { TextBlock } from "@/lib/pdf/types"
import type { SupportedLanguageCode } from "@/lib/config"

type CliArgs = {
  input: string
  source: SupportedLanguageCode
  target: SupportedLanguageCode
  outputDir: string
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key || !value || !key.startsWith("--")) continue
    args.set(key.slice(2), value)
  }

  const input = args.get("input")
  if (!input) {
    throw new Error("Missing required --input argument")
  }

  return {
    input: resolve(input),
    source: (args.get("source") ?? "en") as SupportedLanguageCode,
    target: (args.get("target") ?? "fr") as SupportedLanguageCode,
    outputDir: resolve(
      args.get("output-dir") ??
        join(process.cwd(), "../../testing/manual-regression")
    ),
  }
}

async function main() {
  const { input, source, target, outputDir } = parseArgs(process.argv.slice(2))
  const pdfBuffer = readFileSync(input)
  const document = await parsePdf(pdfBuffer)

  for (const [pageIndex, page] of document.pages.entries()) {
    if (!page.rawItems || !page.rawStyles) continue
    page.textBlocks = clusterTextItems(
      page.rawItems,
      page.rawStyles,
      page.width,
      page.height,
      pageIndex
    )
  }

  const allBlocks: TextBlock[] = document.pages.flatMap(
    (page) => page.textBlocks
  )
  const translatedBlocks = await translateBlocks(allBlocks, source, target, {
    documentTitle: document.metadata.title,
  })

  const { buffer, warnings } = await generateTranslatedPdf(
    pdfBuffer,
    document,
    translatedBlocks
  )

  mkdirSync(outputDir, { recursive: true })

  const stem = basename(input, extname(input))
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const runDir = join(outputDir, `${stem}-${source}-to-${target}-${timestamp}`)
  mkdirSync(runDir, { recursive: true })

  const outputPdf = join(runDir, `${stem}_${target}.pdf`)
  const summaryPath = join(runDir, "summary.json")
  const warningDetails = warnings.map((warning) => {
    const blockId = warning.replace(/^Text overflow in\s+/, "")
    const block = allBlocks.find((entry) => entry.id === blockId)
    return {
      warning,
      blockId,
      text: block?.text,
      role: block?.role,
      region: block?.region,
      bbox: block?.bbox,
    }
  })

  writeFileSync(outputPdf, buffer)
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        input,
        outputPdf,
        source,
        target,
        pageCount: document.metadata.pageCount,
        blockCount: allBlocks.length,
        warningCount: warnings.length,
        warnings,
        warningDetails,
      },
      null,
      2
    )
  )

  console.log(
    JSON.stringify(
      {
        outputPdf,
        summaryPath,
        warningCount: warnings.length,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
