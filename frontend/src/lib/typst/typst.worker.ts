// Compiles resumes to PDF with the Typst WebAssembly compiler, off the main
// thread so the editor stays responsive. Talk to it through compile.ts.

import { CompileFormatEnum, createTypstCompiler, type TypstCompiler } from "@myriaddreamin/typst.ts/compiler"
import { disableDefaultFontAssets, loadFonts, type BeforeBuildFn } from "@myriaddreamin/typst.ts/options.init"
import { ATTACHMENT_NAME } from "@/lib/resumeFile"
import common from "./templates/common.typ"
import ian from "./templates/ian.typ"
import jake from "./templates/jake.typ"
import levelsfyi from "./templates/levelsfyi.typ"
import modernjack from "./templates/modernjack.typ"
import referme from "./templates/referme.typ"
import resumeworded from "./templates/resumeworded.typ"
import type { CompileRequest, CompileResponse, WorkerMessage, WorkerRequest } from "./compile"
import { COMPILER_CDN_URL, COMPILER_INTEGRITY, COMPILER_SIZE, compileChecked } from "./compilerSource"

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

// How much of the compiler has arrived, in bytes.
let compilerBytes = 0

// Tells the page the worker is getting on: some of the compiler or a font
// arrived (at most ten times a second), or a slow step is starting (`now`).
// The page only gives up when it hears nothing for a while (see compile.ts),
// so this keeps a slow connection or a long step from being taken for a
// stuck one. It also says how much of the compiler has arrived, which the
// preview shows while it waits.
let reportedAt = 0
function reportProgress(now = false) {
  if (!now && Date.now() - reportedAt < 100) return
  reportedAt = Date.now()
  postMessage({ progress: true, downloaded: Math.min(compilerBytes / COMPILER_SIZE, 1) } satisfies WorkerMessage)
}

const compilerArrived = (bytes: number) => {
  compilerBytes += bytes
  reportProgress()
}

// fetch, calling `onData` with the number of bytes as the body arrives.
async function fetchReporting(url: string, onData: (bytes: number) => void = () => reportProgress()): Promise<Response> {
  const response = await fetch(url)
  if (!response.body) return response
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        onData(chunk.length)
        controller.enqueue(chunk)
      },
    }),
  )
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

// The compiler from jsDelivr, or the app's own copy if that fails (offline,
// blocked, stalled, or not the expected file).
async function compilerModule(): Promise<WebAssembly.Module | Response> {
  compilerBytes = 0
  try {
    return await compileChecked(COMPILER_CDN_URL, COMPILER_INTEGRITY, CDN_IDLE_MS, compilerArrived)
  } catch {
    // Fall through to the bundled copy, which starts from nothing.
    compilerBytes = 0
  }
  return fetchReporting(
    new URL("@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm", import.meta.url).href,
    compilerArrived,
  )
}

async function fetchFont(url: string): Promise<Uint8Array> {
  const response = await fetchReporting(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function createCompiler(): Promise<TypstCompiler> {
  // The fonts download alongside the compiler rather than after it. If the
  // compiler fails first, nothing waits for the fonts, so their failing too
  // is caught here rather than reported as unhandled.
  const fonts = Promise.all(FONTS.map(fetchFont))
  fonts.catch(() => {})
  const addFonts: BeforeBuildFn = async (mark, context) => loadFonts(await fonts, { assets: false })(mark, context)
  const instance = createTypstCompiler()
  await instance.init({
    getModule: compilerModule,
    // Typst's own fonts would otherwise download too, as addFonts isn't
    // one of typst.ts's font loaders. Building the compiler comes last.
    beforeBuild: [disableDefaultFontAssets(), addFonts, async () => reportProgress(true)],
  })
  for (const [path, source] of Object.entries(SOURCES)) instance.addSource(path, source)
  return instance
}

function getCompiler(): Promise<TypstCompiler> {
  // Forget a failed start (e.g. a network error) so the next request retries.
  compiler ??= createCompiler().then(
    (instance) => {
      postMessage({ ready: true } satisfies WorkerMessage)
      return instance
    },
    (error) => {
      compiler = null
      postMessage({ ready: false } satisfies WorkerMessage)
      throw error
    },
  )
  return compiler
}

addEventListener("message", ({ data: request }: MessageEvent<WorkerRequest>) => {
  // Loading ahead of the first PDF. If it fails, that PDF tries again.
  if ("load" in request) getCompiler().catch(() => {})
  else void compile(request)
})

async function compile({ id, template, data, attachment }: CompileRequest) {
  let response: CompileResponse
  let typst: TypstCompiler | undefined
  try {
    typst = await getCompiler()
    // Compiling comes next.
    reportProgress(true)
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
    response = result
      ? { id, pdf: result }
      : { id, error: diagnostics?.join("\n") || "Typst produced no output", failure: "resume" }
  } catch (error) {
    // Without a compiler, it couldn't be downloaded. With one, the compiler
    // itself broke, and the page replaces this worker.
    const message = error instanceof Error ? error.message : String(error)
    response = { id, error: message, failure: typst === undefined ? "connection" : "crash" }
  }
  postMessage(response)
}
