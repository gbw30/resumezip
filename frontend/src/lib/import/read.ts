// The import worker's job: turn a file's text into lines and sort them into
// the editor's fields. It's here rather than in import.worker.ts so tests can
// run it without a worker.

import { MAX_CHARACTERS, MAX_LINES, TooMuchTextError } from "./limits"
import { linesFromDocx, linesFromPages, UnreadableWordFileError, type Line, type PdfPage } from "./lines"
import { parseResume, type ParsedResume } from "./parse"

/** A PDF's pages, read on the page with pdf.js, or a Word file. */
export type ReadRequest = { kind: "pdf"; pages: PdfPage[] } | { kind: "docx"; data: ArrayBuffer }

/** What was found, why nothing was, or a bug's message (`failed`) for the page to log. */
export type ReadResult = { parsed: ParsedResume } | { problem: "no text" | "too much text" | "unreadable" } | { failed: string }

export async function readFile(request: ReadRequest): Promise<ReadResult> {
  try {
    let lines: Line[]
    try {
      lines = request.kind === "pdf" ? linesFromPages(request.pages) : await linesFromDocx(request.data)
    } catch (error) {
      if (error instanceof TooMuchTextError) return { problem: "too much text" }
      if (error instanceof UnreadableWordFileError) return { problem: "unreadable" }
      throw error
    }
    if (lines.length === 0) return { problem: "no text" }
    const characters = lines.reduce((sum, line) => sum + line.text.length, 0)
    if (lines.length > MAX_LINES || characters > MAX_CHARACTERS) return { problem: "too much text" }
    return { parsed: parseResume(lines) }
  } catch (error) {
    return { failed: error instanceof Error ? error.message : String(error) }
  }
}
