// Reads the preview PDF the way hiring software would, for the checker's PDF
// rules: pdf.js reads its text on the page, and the resume reader sorts it into
// fields in a worker, as opening a PDF does (lib/import/open.ts).

import { MAX_PAGES, TooMuchTextError } from "@/lib/import/limits"
import { readPdf } from "@/lib/import/lines"
import { loadPdfjs, readInWorker, until } from "@/lib/import/open"
import type { PdfReading } from "./engine"

/**
 * The preview at `url`, as read; null if it can't be read, as when it's past
 * the reader's limits or has no text. Stops as soon as `signal` aborts,
 * rejecting with its reason.
 */
export async function readPreview(url: string, signal: AbortSignal): Promise<PdfReading | null> {
  const data = new Uint8Array(await (await fetch(url, { signal })).arrayBuffer())
  const { getDocument } = await until(loadPdfjs(), signal)
  const task = getDocument({ data, isEvalSupported: false, fontExtraProperties: true })
  // Closing the document ends pdf.js's worker for it, which stops whatever it's reading.
  const close = () => void task.destroy().catch(() => {})
  signal.addEventListener("abort", close, { once: true })
  try {
    const doc = await until(task.promise, signal)
    if (doc.numPages > MAX_PAGES) return null
    const pages = await until(readPdf(doc, signal), signal)
    const result = await readInWorker({ kind: "pdf", pages }, signal)
    if ("failed" in result) throw new Error(result.failed)
    if (!("parsed" in result)) return null
    return { lines: result.parsed.lines, pages: pages.map(({ width, height }) => ({ width, height })), parsed: result.parsed }
  } catch (error) {
    if (error instanceof TooMuchTextError) return null
    throw error
  } finally {
    signal.removeEventListener("abort", close)
    close()
  }
}
