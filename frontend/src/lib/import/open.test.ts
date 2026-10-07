import { beforeEach, describe, expect, test, vi } from "vitest"
import { ATTACHMENT_NAME, cleanResume, MAX_LENGTH, toAttachment } from "@/lib/resumeFile"

const resume = { selectedTemplate: "jake", profileSection: { fullName: "Mara Lin" } }
const pdf = () => new File(["%PDF-1.7"], "Mara Lin.pdf", { type: "application/pdf" })

let openResumeFile: typeof import("./open").openResumeFile
let OpenFileError: typeof import("./open").OpenFileError
let downloads: number
let failures: number
let attachment: string

// A fresh page each time, with nothing downloaded yet. pdf.js is stood in
// for: each import of it counts as a download, the first `failures` of them
// fail as on a dropped connection, and every PDF is a resumezip PDF with
// `attachment` attached, a copy of `resume` unless a test changes it.
beforeEach(async () => {
  downloads = 0
  failures = 0
  attachment = toAttachment(resume)
  vi.resetModules()
  vi.doMock("pdfjs-dist", () => {
    downloads++
    if (failures > 0) {
      failures--
      throw new TypeError("Failed to fetch dynamically imported module")
    }
    return {
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          getAttachments: async () => ({ [ATTACHMENT_NAME]: { content: new TextEncoder().encode(attachment) } }),
          destroy: async () => {},
        }),
      }),
    }
  })
  ;({ openResumeFile, OpenFileError } = await import("./open"))
})

describe("a resumezip PDF", () => {
  test("restores its resume", async () => {
    await expect(openResumeFile(pdf())).resolves.toEqual({ kind: "resumezip", resume: cleanResume(resume), title: "Mara Lin" })
  })

  test("too long to open says so, instead of opening with parts cut off", async () => {
    attachment = toAttachment({ ...resume, profileSection: { fullName: "x".repeat(MAX_LENGTH) } })
    const opening = openResumeFile(pdf())
    await expect(opening).rejects.toThrow(OpenFileError)
    await expect(opening).rejects.toThrow("This resume is longer than resumezip can open (more than 10,000 entries or 10,000,000 characters).")
  })
})

describe("downloading pdf.js", () => {
  test("a failed download is tried again for the next PDF", async () => {
    failures = 1
    await expect(openResumeFile(pdf())).rejects.toThrow()
    await expect(openResumeFile(pdf())).resolves.toEqual({ kind: "resumezip", resume: cleanResume(resume), title: "Mara Lin" })
    expect(downloads).toBe(2)
  })

  test("PDFs opened at the same time share one download, and later ones reuse it", async () => {
    await Promise.all([openResumeFile(pdf()), openResumeFile(pdf())])
    await openResumeFile(pdf())
    expect(downloads).toBe(1)
  })
})
