// Which English the grammar checker reads, from the browser's languages. On
// its own, so the editor can tell without loading the grammar checker.

export type DialectName = "american" | "british" | "australian" | "canadian" | "indian"

/** The English the person reads, from the browser's languages ("en-GB"): American unless it says otherwise. */
export function dialectOf(languages: readonly string[]): DialectName {
  const english = languages.find((language) => /^en\b/i.test(language))?.toLowerCase() ?? ""
  if (/^en-(gb|ie|nz|za)\b/.test(english)) return "british"
  if (english.startsWith("en-au")) return "australian"
  if (english.startsWith("en-ca")) return "canadian"
  if (english.startsWith("en-in")) return "indian"
  return "american"
}
