// Renders resumes to PDF with the real Typst templates and reads them back
// the way "Open a file" does for PDFs from elsewhere, for tests. Used by the
// import round-trip tests and the checker's PDF rule tests.

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { CompileFormatEnum, createTypstCompiler, type TypstCompiler } from "@myriaddreamin/typst.ts/compiler"
import { loadFonts } from "@myriaddreamin/typst.ts/options.init"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { toTemplateData } from "@/lib/typst/resumeData"
import { linesFromPages, readPdf, type PageSize } from "./lines"
import { parseResume, toResumeContent } from "./parse"

const TYPST = path.resolve("src/lib/typst")
const FONTS = path.resolve("src/lib/typst/fonts")
const WASM = path.resolve("node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm")

/** The sample resume of each template, as the template gallery shows it. */
export const samples = readdirSync(path.join(TYPST, "preview-samples")).map((file) =>
  JSON.parse(readFileSync(path.join(TYPST, "preview-samples", file), "utf8")),
)

let compiler: Promise<TypstCompiler> | null = null

// One compiler for every test in a file, with the templates and fonts loaded once.
function typst(): Promise<TypstCompiler> {
  compiler ??= (async () => {
    const created = createTypstCompiler()
    await created.init({
      getModule: () => readFileSync(WASM),
      beforeBuild: [loadFonts(readdirSync(FONTS).map((file) => new Uint8Array(readFileSync(path.join(FONTS, file)))), { assets: false })],
    })
    for (const file of readdirSync(path.join(TYPST, "templates"))) {
      created.addSource(`/${file}`, readFileSync(path.join(TYPST, "templates", file), "utf8"))
    }
    return created
  })()
  return compiler
}

/** A resume in the editor's format, printed with its template. */
export async function render(resume: Record<string, unknown>): Promise<Uint8Array> {
  const typstCompiler = await typst()
  typstCompiler.mapShadow("/resume.json", new TextEncoder().encode(JSON.stringify(toTemplateData(resume))))
  const { result, diagnostics } = await typstCompiler.compile({
    mainFilePath: `/${resume.selectedTemplate}.typ`,
    format: CompileFormatEnum.pdf,
    diagnostics: "unix",
  })
  if (!result) throw new Error(diagnostics?.join("\n") || "Typst produced no output")
  return result
}

/** A PDF read back: its pages, what the resume reader found, and that as a resume. */
export async function readBack(pdf: Uint8Array) {
  const doc = (await getDocument({ data: pdf, isEvalSupported: false, fontExtraProperties: true }).promise) as unknown as PDFDocumentProxy
  try {
    const pdfPages = await readPdf(doc)
    const parsed = parseResume(linesFromPages(pdfPages))
    const pages: PageSize[] = pdfPages.map(({ width, height }) => ({ width, height }))
    return { parsed, pages, resume: toResumeContent(parsed) }
  } finally {
    await doc.destroy()
  }
}
