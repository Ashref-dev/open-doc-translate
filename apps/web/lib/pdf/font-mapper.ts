import { StandardFonts } from "pdf-lib"

export function isBoldFont(fontName: string): boolean {
  const lower = fontName.toLowerCase()
  return (
    lower.includes("bold") || lower.includes("bd") || fontName.includes("-B")
  )
}

export function isItalicFont(fontName: string): boolean {
  const lower = fontName.toLowerCase()
  return (
    lower.includes("italic") ||
    lower.includes("oblique") ||
    lower.includes("it")
  )
}

function isSerifFont(fontName: string): boolean {
  const lower = fontName.toLowerCase()
  return lower.includes("times") || lower.includes("serif")
}

function isMonoFont(fontName: string): boolean {
  const lower = fontName.toLowerCase()
  return lower.includes("courier") || lower.includes("mono")
}

function isSansFont(fontName: string): boolean {
  const lower = fontName.toLowerCase()
  return (
    lower.includes("arial") ||
    lower.includes("helvetica") ||
    lower.includes("sans")
  )
}

export function mapFontToStandard(
  pdfJsFontName: string,
  fontFamily?: string
): StandardFonts {
  const name = fontFamily ?? pdfJsFontName
  const bold = isBoldFont(name)
  const italic = isItalicFont(name)

  if (isSerifFont(name)) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }

  if (isMonoFont(name)) {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }

  if (isSansFont(name) || !isSerifFont(name)) {
    if (bold && italic) return StandardFonts.HelveticaBoldOblique
    if (bold) return StandardFonts.HelveticaBold
    if (italic) return StandardFonts.HelveticaOblique
    return StandardFonts.Helvetica
  }

  return StandardFonts.Helvetica
}
