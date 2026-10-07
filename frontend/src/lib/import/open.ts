// Opens a resume file someone picked or dropped, entirely in the browser. A
// PDF that resumezip made carries its resume (see lib/resumeFile.ts) and is
// restored exactly; anything else is read and sorted into fields by parse.ts.
// Reading stops at the limits in limits.ts, and closes whatever it opened.

import type { PDFDocumentProxy } from "pdfjs-dist"
import { ATTACHMENT_NAME, fromAttachment, MAX_ENTRIES, MAX_LENGTH, TooLongError, type ResumeContent } from "@/lib/resumeFile"
import { MAX_BYTES, MAX_CHARACTERS, MAX_LINES, MAX_PAGES, TooMuchTextError } from "./limits"
import { linesFromDocx, linesFromPages, readPdf, type Line, type PageSize, type PdfPage } from "./lines"
import { parseResume, type ParsedResume } from "./parse"

export type OpenedFile =
  | { kind: "resumezip"; resume: ResumeContent; title: string }
  | {
      kind: "parsed"
      parsed: ParsedResume
      lines: Line[]
      title: string
      fileName: string
      /** The PDF itself, for showing it beside what was found. Absent for Word files. */
      pdf?: { doc: PDFDocumentProxy; pages: PageSize[] }
    }

/** A problem with the file, worded for the person who picked it. */
export class OpenFileError extends Error {}

const TOO_MUCH_TEXT = "This file has too much text to be a resume."

let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null

// pdf.js (and its worker) only download when a PDF is opened. A failed
// download (e.g. a network error) is forgotten, so the next PDF retries it.
function loadPdfjs() {
  pdfjs ??= import("pdfjs-dist")
    .then((module) => {
      module.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
      return module
    })
    .catch((error) => {
      pdfjs = null
      throw error
    })
  return pdfjs
}

function kindOf(file: File): "pdf" | "docx" | null {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return "pdf"
  if (/\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx"
  return null
}

/** Sorts lines into fields, unless there are more than a resume would have. */
function parseLines(lines: Line[]): ParsedResume {
  const characters = lines.reduce((sum, line) => sum + line.text.length, 0)
  if (lines.length > MAX_LINES || characters > MAX_CHARACTERS) throw new OpenFileError(TOO_MUCH_TEXT)
  return parseResume(lines)
}

/** The resume a resumezip PDF carries, or null for a PDF from anywhere else. */
async function attachedResume(doc: PDFDocumentProxy): Promise<ResumeContent | null> {
  const attachments = (await doc.getAttachments().catch(() => null)) as Record<string, { content: Uint8Array }> | null
  const attached = attachments?.[ATTACHMENT_NAME]
  try {
    return attached ? fromAttachment(new TextDecoder().decode(attached.content)) : null
  } catch (error) {
    if (!(error instanceof TooLongError)) throw error
    const most = (count: number) => count.toLocaleString("en-US")
    throw new OpenFileError(
      `This resume is longer than resumezip can open (more than ${most(MAX_ENTRIES)} entries or ${most(MAX_LENGTH)} characters).`,
    )
  }
}

async function openPdf(data: ArrayBuffer, title: string, fileName: string): Promise<OpenedFile> {
  const { getDocument } = await loadPdfjs()
  let doc: PDFDocumentProxy
  try {
    doc = await getDocument({ data: new Uint8Array(data), isEvalSupported: false, fontExtraProperties: true }).promise
  } catch (error) {
    throw new OpenFileError(
      (error as { name?: string })?.name === "PasswordException"
        ? "This PDF is password-protected. Remove the password, then open it here."
        : "This file isn't a PDF we can read.",
    )
  }

  let shown = false
  try {
    const resume = await attachedResume(doc)
    if (resume) return { kind: "resumezip", resume, title }

    if (doc.numPages > MAX_PAGES) {
      throw new OpenFileError(`This PDF has ${doc.numPages} pages, too many for a resume. Open one with ${MAX_PAGES} pages or fewer.`)
    }
    let pages: PdfPage[]
    try {
      pages = await readPdf(doc)
    } catch (error) {
      throw error instanceof TooMuchTextError ? new OpenFileError(TOO_MUCH_TEXT) : error
    }
    const lines = linesFromPages(pages)
    if (lines.length === 0) throw new OpenFileError("This PDF has no text we can read. It's probably a scan or a picture of a resume.")
    const parsed = parseLines(lines)
    shown = true
    return { kind: "parsed", parsed, lines: parsed.lines, title, fileName, pdf: { doc, pages: pages.map(({ width, height }) => ({ width, height })) } }
  } finally {
    // The review shows the PDF, and closes it when it's done.
    if (!shown) await doc.destroy()
  }
}

async function openWordFile(data: ArrayBuffer, title: string, fileName: string): Promise<OpenedFile> {
  let lines: Line[]
  try {
    lines = await linesFromDocx(data)
  } catch (error) {
    throw new OpenFileError(error instanceof TooMuchTextError ? TOO_MUCH_TEXT : "We couldn't read this Word file. Try saving it as a PDF and opening that.")
  }
  if (lines.length === 0) throw new OpenFileError("This Word file has no text in it.")
  const parsed = parseLines(lines)
  return { kind: "parsed", parsed, lines: parsed.lines, title, fileName }
}

export async function openResumeFile(file: File): Promise<OpenedFile> {
  const kind = kindOf(file)
  if (!kind) {
    throw new OpenFileError(/\.doc$/i.test(file.name) ? "That's an older Word file. Save it as .docx or PDF, then open it here." : "Open a PDF or a Word (.docx) file.")
  }
  if (file.size > MAX_BYTES) throw new OpenFileError("That file is too big to be a resume.")
  const title = file.name.replace(/\.(pdf|docx)$/i, "").trim() || "Imported resume"
  const data = await file.arrayBuffer()
  return kind === "docx" ? openWordFile(data, title, file.name) : openPdf(data, title, file.name)
}
