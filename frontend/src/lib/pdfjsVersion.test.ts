import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"

// The editor's preview draws with react-pdf's pdf.js, but loads the worker
// from the app's own pdfjs-dist (components/editor/PdfPreview.tsx), and the
// importer uses the app's copy too (lib/import/open.ts). pdf.js refuses a
// worker from another version, so pdfjs-dist must be exactly the version
// react-pdf is built on. When it isn't, npm gives react-pdf its own copy.
test("pdfjs-dist is the version react-pdf uses", () => {
  const ownCopy = path.resolve("node_modules/react-pdf/node_modules/pdfjs-dist/package.json")
  const wanted = existsSync(ownCopy) ? JSON.parse(readFileSync(ownCopy, "utf8")).version : null
  expect(wanted, `react-pdf needs pdfjs-dist ${wanted}; set that exact version in package.json`).toBeNull()
})
