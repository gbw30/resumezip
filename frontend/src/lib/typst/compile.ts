// Compiles resumes to PDF in the browser. The Typst compiler (and its ~7 MB
// WebAssembly download) is only loaded the first time a resume is compiled.

import { toAttachment } from "@/lib/resumeFile"
import { templateIdOf, toTemplateData, type TemplateData, type TemplateId } from "./resumeData"

export interface CompileRequest {
  id: number
  template: TemplateId
  data: TemplateData
  /** A copy of the resume to attach to the PDF (see lib/resumeFile.ts). */
  attachment?: string
}

export type CompileResponse = { id: number; pdf: Uint8Array } | { id: number; error: string }

// How long a PDF can take before the worker is taken to be stuck. The first
// one waits for the compiler (~7 MB) and fonts to download, so it gets longer.
const FIRST_PDF_MS = 90_000
const PDF_MS = 20_000

let worker: Worker | null = null
// Whether the current worker has made a PDF, so its compiler is loaded.
let started = false
let nextId = 0
const pending = new Map<
  number,
  { resolve: (pdf: Uint8Array) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

// Fails everything in flight and drops the worker, so the next request starts
// a fresh one.
function restart(error: Error) {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer)
    reject(error)
  }
  pending.clear()
  worker?.terminate()
  worker = null
  started = false
}

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL("./typst.worker.ts", import.meta.url))
  worker.onmessage = ({ data }: MessageEvent<CompileResponse>) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    clearTimeout(request.timer)
    if ("pdf" in data) {
      started = true
      request.resolve(data.pdf)
    } else request.reject(new Error(data.error))
  }
  // The worker itself broke.
  worker.onerror = (event) => restart(new Error(event.message || "The Typst worker failed"))
  return worker
}

interface CompileOptions {
  /** Attach a copy of the resume so resumezip can open the PDF again. Downloads do; previews don't need to. */
  attach?: boolean
}

/** Compiles a resume, in the editor's format, to PDF bytes. */
export function compileResume(resume: Record<string, any>, { attach = false }: CompileOptions = {}): Promise<Uint8Array> {
  const request: CompileRequest = {
    id: nextId++,
    template: templateIdOf(resume.selectedTemplate),
    data: toTemplateData(resume),
    attachment: attach ? toAttachment(resume) : undefined,
  }
  return new Promise((resolve, reject) => {
    const target = getWorker()
    // A stuck worker can't hang a download forever.
    const timer = setTimeout(() => restart(new Error("Making the PDF took too long")), started ? PDF_MS : FIRST_PDF_MS)
    pending.set(request.id, { resolve, reject, timer })
    target.postMessage(request)
  })
}

/** Compiles a resume and returns an object URL for the PDF. Revoke it when done. */
export async function compileResumeUrl(resume: Record<string, any>, options?: CompileOptions): Promise<string> {
  const pdf = await compileResume(resume, options)
  return URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }))
}

/** Compiles a resume and saves it as "<title>.pdf", with the resume attached. */
export async function downloadResume(resume: Record<string, any>): Promise<void> {
  const url = await compileResumeUrl(resume, { attach: true })
  const link = document.createElement("a")
  link.href = url
  link.download = `${resume.resumeTitle?.trim() || "resume"}.pdf`
  link.click()
  // Give the browser time to start the download before freeing the PDF.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
