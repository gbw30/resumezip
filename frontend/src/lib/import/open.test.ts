import { beforeEach, describe, expect, test, vi } from "vitest"
import { ATTACHMENT_NAME, cleanResume, toAttachment } from "@/lib/resumeFile"

const resume = { selectedTemplate: "jake", profileSection: { fullName: "Mara Lin" } }
const pdf = () => new File(["%PDF-1.7"], "Mara Lin.pdf", { type: "application/pdf" })

describe("downloading pdf.js", () => {
  let openResumeFile: typeof import("./open").openResumeFile
  let downloads: number
  let failures: number

  // A fresh page each time, with nothing downloaded yet. pdf.js is stood in
  // for: each import of it counts as a download, the first `failures` of them
  // fail as on a dropped connection, and every PDF is a resumezip PDF of `resume`.
  beforeEach(async () => {
    downloads = 0
    failures = 0
    vi.resetModules()
    vi.doMock("pdfjs-dist", () => {
      downloads++
      if (failures > 0) {
        failures--
        throw new TypeError("Failed to fetch dynamically imported module")
      }
      const content = new TextEncoder().encode(toAttachment(resume))
      return {
        GlobalWorkerOptions: {},
        getDocument: () => ({
          promise: Promise.resolve({ getAttachments: async () => ({ [ATTACHMENT_NAME]: { content } }), destroy: async () => {} }),
        }),
      }
    })
    ;({ openResumeFile } = await import("./open"))
  })

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
