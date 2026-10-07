// Compiles resumes to PDF with the Typst WebAssembly compiler, off the main
// thread so the editor stays responsive. Talk to it through compile.ts.

import { CompileFormatEnum, createTypstCompiler, type TypstCompiler } from "@myriaddreamin/typst.ts/compiler"
import { loadFonts } from "@myriaddreamin/typst.ts/options.init"
import { ATTACHMENT_NAME } from "@/lib/resumeFile"
import common from "./templates/common.typ"
import ian from "./templates/ian.typ"
import jake from "./templates/jake.typ"
import levelsfyi from "./templates/levelsfyi.typ"
import modernjack from "./templates/modernjack.typ"
import referme from "./templates/referme.typ"
import resumeworded from "./templates/resumeworded.typ"
import type { CompileRequest, CompileResponse } from "./compile"
import { COMPILER_CDN_URL, COMPILER_INTEGRITY, compileChecked } from "./compilerSource"

const SOURCES: Record<string, string> = {
  "/common.typ": common,
  "/ian.typ": ian,
  "/jake.typ": jake,
  "/levelsfyi.typ": levelsfyi,
  "/modernjack.typ": modernjack,
  "/referme.typ": referme,
  "/resumeworded.typ": resumeworded,
}

// Templates can only use these fonts: Typst's default CDN-hosted fonts are
// disabled so everything is served by this app. They're bundled, so each is
// served under a name with its content's hash that browsers keep for good;
// a changed font gets a new name. The bundler only finds paths written out
// in full, so each one is.
const FONTS = [
  new URL("./fonts/NewCM10-Regular.otf", import.meta.url),
  new URL("./fonts/NewCM10-Bold.otf", import.meta.url),
  new URL("./fonts/NewCM10-Italic.otf", import.meta.url),
  new URL("./fonts/NewCM10-BoldItalic.otf", import.meta.url),
  new URL("./fonts/Lato-Regular.ttf", import.meta.url),
  new URL("./fonts/Lato-Bold.ttf", import.meta.url),
  new URL("./fonts/Lato-Italic.ttf", import.meta.url),
  new URL("./fonts/Lato-BoldItalic.ttf", import.meta.url),
  new URL("./fonts/texgyreheros-regular.otf", import.meta.url),
  new URL("./fonts/texgyreheros-bold.otf", import.meta.url),
  new URL("./fonts/texgyreheros-italic.otf", import.meta.url),
  new URL("./fonts/texgyreheros-bolditalic.otf", import.meta.url),
  new URL("./fonts/EBGaramond-Regular.ttf", import.meta.url),
  new URL("./fonts/EBGaramond-Bold.ttf", import.meta.url),
  new URL("./fonts/EBGaramond-Italic.ttf", import.meta.url),
  new URL("./fonts/EBGaramond-BoldItalic.ttf", import.meta.url),
].map((url) => url.href)

// Downloads wrap the template in a file that also attaches a copy of the
// resume, so templates don't need to know about it. Checked to leave every
// template's layout exactly as it was.
const withAttachment = (template: string) =>
  `#include "/${template}.typ"
#pdf.attach("/${ATTACHMENT_NAME}", relationship: "source", mime-type: "application/json", description: "This resume's content, so resumezip can open the PDF for editing again")
`

let compiler: Promise<TypstCompiler> | null = null

// How long jsDelivr can go without sending anything before the app's own
// copy is used instead.
const CDN_IDLE_MS = 15_000

// The compiler from jsDelivr, or the app's own copy if that fails (offline,
// blocked, stalled, or not the expected file).
async function compilerModule(): Promise<WebAssembly.Module | Response> {
  try {
    return await compileChecked(COMPILER_CDN_URL, COMPILER_INTEGRITY, CDN_IDLE_MS)
  } catch {
    // Fall through to the bundled copy.
  }
  return fetch(new URL("@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm", import.meta.url))
}

async function createCompiler(): Promise<TypstCompiler> {
  const instance = createTypstCompiler()
  await instance.init({
    getModule: compilerModule,
    beforeBuild: [loadFonts(FONTS, { assets: false })],
  })
  for (const [path, source] of Object.entries(SOURCES)) instance.addSource(path, source)
  return instance
}

function getCompiler(): Promise<TypstCompiler> {
  // Forget a failed start (e.g. a network error) so the next request retries.
  compiler ??= createCompiler().catch((error) => {
    compiler = null
    throw error
  })
  return compiler
}

addEventListener("message", async ({ data: { id, template, data, attachment } }: MessageEvent<CompileRequest>) => {
  let response: CompileResponse
  let typst: TypstCompiler | undefined
  try {
    typst = await getCompiler()
    // Nothing is awaited between writing the data and compiling it, so
    // concurrent requests can't see each other's data.
    typst.mapShadow("/resume.json", new TextEncoder().encode(JSON.stringify(data)))
    if (attachment !== undefined) {
      typst.mapShadow(`/${ATTACHMENT_NAME}`, new TextEncoder().encode(attachment))
      typst.addSource("/download.typ", withAttachment(template))
    }
    const { result, diagnostics } = await typst.compile({
      mainFilePath: attachment === undefined ? `/${template}.typ` : "/download.typ",
      format: CompileFormatEnum.pdf,
      diagnostics: "unix",
    })
    response = result ? { id, pdf: result } : { id, error: diagnostics?.join("\n") || "Typst produced no output", loaded: true }
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error), loaded: typst !== undefined }
  }
  postMessage(response)
})
