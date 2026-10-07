// Reads the preview PDF the way hiring software would, for the checker's PDF
// rules: pdf.js reads its text on the page, and the resume reader sorts it into
// fields in a worker, as opening a PDF does (lib/import/open.ts).

import { readPdf } from "@/lib/import/lines"
import { loadPdfjs, readInWorker } from "@/lib/import/open"
import type { PdfReading } from "./engine"

/** The preview at `url`, as read; null if it has no text to read. Rejects as soon as `signal` aborts. */
export async function readPreview(url: string, signal: AbortSignal): Promise<PdfReading | null> {
  const data = new Uint8Array(await (await fetch(url, { signal })).arrayBuffer())
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data, isEvalSupported: false, fontExtraProperties: true })
  try {
    const pages = await readPdf(await task.promise, signal)
    const result = await readInWorker({ kind: "pdf", pages }, signal)
    if (!("parsed" in result)) return null
    return { lines: result.parsed.lines, pages: pages.map(({ width, height }) => ({ width, height })), parsed: result.parsed }
  } finally {
    // Closing the document ends pdf.js's worker for it.
    void task.destroy().catch(() => {})
  }
}
