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
  return (
    lower.includes("times") ||
    lower.includes("garamond") ||
    lower.includes("georgia") ||
    lower.includes("palatino") ||
    lower.includes("cambria") ||
    lower.includes("bookman") ||
    lower.includes("century") ||
    lower.includes("didot") ||
    lower.includes("bodoni") ||
    lower.includes("baskerville") ||
    lower.includes("caslon") ||
    lower.includes("minion") ||
    lower.includes("charter") ||
    lower.includes("liberation serif") ||
    lower.includes("tinos") ||
    lower.includes("noto serif") ||
    lower.includes("pt serif") ||
    lower.includes("lora") ||
    lower.includes("merriweather") ||
    lower.includes("playfair") ||
    lower.includes("crimson") ||
    (lower.includes("serif") && !lower.includes("sans"))
  )
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
    lower.includes("sans") ||
    lower.includes("calibri") ||
    lower.includes("segoe") ||
    lower.includes("verdana") ||
    lower.includes("tahoma") ||
    lower.includes("trebuchet") ||
    lower.includes("roboto") ||
    lower.includes("inter") ||
    lower.includes("lato") ||
    lower.includes("montserrat") ||
    lower.includes("poppins") ||
    lower.includes("open sans") ||
    lower.includes("nunito") ||
    lower.includes("raleway")
  )
}

export function mapFontToStandard(
  pdfJsFontName: string,
  fontFamily?: string
): StandardFonts {
  const name = pdfJsFontName + " " + (fontFamily ?? "")
  const bold = isBoldFont(name)
  const italic = isItalicFont(name)

  if (isMonoFont(name) || (fontFamily ?? "").includes("monospace")) {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }

  if (
    isSerifFont(name) ||
    ((fontFamily ?? "").includes("serif") &&
      !(fontFamily ?? "").includes("sans"))
  ) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }

  if (bold && italic) return StandardFonts.HelveticaBoldOblique
  if (bold) return StandardFonts.HelveticaBold
  if (italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}
