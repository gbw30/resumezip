// Compiles resumes to PDF in the browser. The Typst compiler (and its large
// WebAssembly download) is only loaded the first time a resume is compiled.

import { toAttachment } from "@/lib/resumeFile"
import { templateIdOf, toTemplateData, type TemplateData, type TemplateId } from "./resumeData"

/** What a resume prints: its template and the data the template reads. Renaming a resume doesn't change it. */
export interface Printed {
  template: TemplateId
  data: TemplateData
}

/** What a resume, in the editor's format, prints. */
export const printedOf = (resume: Record<string, any>): Printed => ({
  template: templateIdOf(resume.selectedTemplate),
  data: toTemplateData(resume),
})

export interface CompileRequest extends Printed {
  id: number
  /** A copy of the resume to attach to the PDF (see lib/resumeFile.ts). */
  attachment?: string
}

/**
 * Why a PDF couldn't be made, which decides what the user is told to do:
 * - `connection`: the compiler or its fonts couldn't be downloaded, or stopped arriving.
 * - `resume`: Typst couldn't lay out this resume with its template.
 * - `crash`: the compiler broke or got stuck. The next request gets a fresh one.
 */
export type PdfFailure = "connection" | "resume" | "crash"

export class PdfError extends Error {
  constructor(
    message: string,
    readonly failure: PdfFailure,
  ) {
    super(message)
  }
}

/** A preview replaced by a newer one, or withdrawn, before it started, so it was never compiled. */
export class Superseded extends Error {
  constructor() {
    super("This preview was no longer needed")
    this.name = "Superseded"
  }
}

/** Why making a PDF failed, from what compileResume threw. */
export const failureOf = (error: unknown): PdfFailure => (error instanceof PdfError ? error.failure : "crash")

export type CompileResponse = { id: number; pdf: Uint8Array } | { id: number; error: string; failure: PdfFailure }

/** What the page sends the worker: a resume to compile, or word to start loading the compiler before one comes. */
export type WorkerRequest = CompileRequest | { load: true }

/** What the worker sends: an answer, or word that more of the compiler or a font has downloaded. */
export type WorkerMessage = CompileResponse | { progress: true }

// The worker is taken to be stuck when it has work and goes this long without
// sending anything. While the compiler downloads, each bit that arrives
// counts, so a slow connection keeps going and a stalled one gives up. Time
// spent waiting behind other requests doesn't count against any of them.
const LOADING_MS = 30_000
const COMPILING_MS = 20_000

let worker: Worker | null = null
// Whether the current worker's compiler has loaded.
let loaded = false
let watchdog: ReturnType<typeof setTimeout> | undefined
let nextId = 0
const pending = new Map<number, { resolve: (pdf: Uint8Array) => void; reject: (error: Error) => void }>()

// Waits afresh for the worker's next sign of life, while it has work.
function watch() {
  clearTimeout(watchdog)
  watchdog = undefined
  if (pending.size === 0) return
  watchdog = setTimeout(
    () => restart(new PdfError("Making the PDF took too long", loaded ? "crash" : "connection")),
    loaded ? COMPILING_MS : LOADING_MS,
  )
}

// Fails everything in flight and drops the worker, so the next request starts
// a fresh one.
function restart(error: PdfError) {
  for (const { reject } of pending.values()) reject(error)
  pending.clear()
  previewWaiting?.reject(error)
  previewWaiting = null
  watch()
  worker?.terminate()
  worker = null
  loaded = false
}

function getWorker(): Worker {
  if (worker) return worker

  const created = new Worker(new URL("./typst.worker.ts", import.meta.url))
  // Messages and errors from a worker that was already replaced are left
  // alone, so they can't touch the new one.
  created.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
    if (worker !== created) return
    if ("id" in data) {
      const request = pending.get(data.id)
      pending.delete(data.id)
      if ("pdf" in data) {
        loaded = true
        request?.resolve(data.pdf)
      } else {
        if (data.failure === "resume") loaded = true
        request?.reject(new PdfError(data.error, data.failure))
        // A broken compiler can't be trusted with the rest.
        if (data.failure === "crash") return restart(new PdfError(data.error, "crash"))
      }
    }
    watch()
  }
  created.onerror = (event) => {
    if (worker === created) restart(new PdfError(event.message || "The Typst worker failed", "crash"))
  }
  worker = created
  return created
}

/**
 * Starts loading the compiler, if nothing has yet, so the first PDF doesn't
 * wait for it to download. Later PDFs use the worker this starts.
 */
export function loadCompiler() {
  if (!worker) getWorker().postMessage({ load: true } satisfies WorkerRequest)
}

/** Whether the visitor has asked to save data or is on a very slow connection, so nothing should download before it's needed. */
export function savingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return Boolean(connection?.saveData) || /2g/.test(connection?.effectiveType ?? "")
}

interface CompileOptions {
  /** Attach a copy of the resume so resumezip can open the PDF again. Downloads do; previews don't need to. */
  attach?: boolean
}

/** Compiles a resume, in the editor's format, to PDF bytes. */
export function compileResume(resume: Record<string, any>, { attach = false }: CompileOptions = {}): Promise<Uint8Array> {
  return send(printedOf(resume), attach ? toAttachment(resume) : undefined)
}

function send(printed: Printed, attachment?: string): Promise<Uint8Array> {
  const request: CompileRequest = { id: nextId++, ...printed, attachment }
  return new Promise((resolve, reject) => {
    getWorker().postMessage(request satisfies WorkerRequest)
    pending.set(request.id, { resolve, reject })
    // A stuck worker can't hang a download forever. A wait that's already
    // running is kept, so new requests can't keep a stuck worker going.
    if (watchdog === undefined) watch()
  })
}

const toUrl = (pdf: Uint8Array) => URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }))

// Previews compile one at a time. While one runs, only the newest waits: an
// older one waiting is settled at once, as its result would be thrown away.
// Downloads don't wait here, so they're never replaced.
let previewRunning = false
let previewWaiting: { printed: Printed; resolve: (url: string) => void; reject: (error: Error) => void } | null = null

/**
 * Compiles a preview and returns an object URL for the PDF. Revoke it when
 * done. Rejects with Superseded if a newer preview replaces it, or `signal`
 * withdraws it, before it starts.
 */
export function compilePreview(printed: Printed, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Superseded())
    previewWaiting?.reject(new Superseded())
    const entry = { printed, resolve, reject }
    previewWaiting = entry
    signal?.addEventListener(
      "abort",
      () => {
        if (previewWaiting !== entry) return
        previewWaiting = null
        reject(new Superseded())
      },
      { once: true },
    )
    if (!previewRunning) startNextPreview()
  })
}

function startNextPreview() {
  const next = previewWaiting
  previewWaiting = null
  if (!next) return
  previewRunning = true
  send(next.printed)
    .then(toUrl)
    .then(next.resolve, next.reject)
    .finally(() => {
      previewRunning = false
      startNextPreview()
    })
}

/** Compiles a resume and saves it as "<title>.pdf", with the resume attached. */
export async function downloadResume(resume: Record<string, any>): Promise<void> {
  const url = toUrl(await compileResume(resume, { attach: true }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${resume.resumeTitle?.trim() || "resume"}.pdf`
  link.click()
  // Give the browser time to start the download before freeing the PDF.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
