// preview.ts keeps one pdf.js worker for all its readings, passing it to each
// document it opens, as the editor's preview does for the PDFs it shows
// (components/editor/PdfPreview.tsx). That relies on pdf.js leaving a worker
// it was given running when a document closes, as it only ends workers it
// started itself.

import { getDocument, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs"
import { expect, test } from "vitest"
import { render, samples } from "@/lib/import/testRender"

test("closing a document leaves the worker it was given for the next one", async () => {
  const pdf = await render(samples[0])
  const worker = new PDFWorker()
  try {
    for (let reading = 0; reading < 2; reading++) {
      const task = getDocument({ data: pdf.slice(), isEvalSupported: false, worker })
      expect((await task.promise).numPages).toBeGreaterThan(0)
      await task.destroy()
      expect(worker.destroyed).toBe(false)
    }
  } finally {
    worker.destroy()
  }
})
