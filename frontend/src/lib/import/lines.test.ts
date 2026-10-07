import { describe, expect, test, vi } from "vitest"
import { convertToHtml } from "mammoth"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { MAX_CHARACTERS, MAX_PAGES, MAX_WORD_XML_BYTES, TooMuchTextError } from "./limits"
import { cleanLink, linesFromDocx, linesFromPages, readPdf, unzippedXmlSize } from "./lines"
import { textPdf, wordFile } from "./testFiles"

// mammoth as it is, with its converter watched.
vi.mock("mammoth", async (importOriginal) => {
  const mammoth = await importOriginal<typeof import("mammoth")>()
  return { ...mammoth, convertToHtml: vi.fn(mammoth.convertToHtml) }
})

const bytes = (buffer: Buffer) => new Uint8Array(buffer).buffer

async function withPdf(pdf: Buffer, check: (doc: PDFDocumentProxy) => Promise<void>) {
  const doc = (await getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, fontExtraProperties: true }).promise) as unknown as PDFDocumentProxy
  try {
    await check(doc)
  } finally {
    await doc.destroy()
  }
}

describe("cleanLink", () => {
  test("drops what pdf.js adds to a LaTeX link written without https://", () => {
    expect(cleanLink("www.linkedin.com/in/someone/.pdf#[0,{\"name\":\"Fit\"}]")).toBe("www.linkedin.com/in/someone")
    expect(cleanLink("http://www.linkedin.com/in/someone/.pdf#[0,{%22name%22:%22Fit%22}]")).toBe("http://www.linkedin.com/in/someone")
  })

  test("leaves real links alone, including links to PDFs", () => {
    expect(cleanLink("https://github.com/someone")).toBe("https://github.com/someone")
    expect(cleanLink("https://example.com/paper.pdf#page=2")).toBe("https://example.com/paper.pdf#page=2")
    expect(cleanLink("mailto:someone@example.com")).toBe("mailto:someone@example.com")
  })
})

describe("reading a PDF", () => {
  test(`one of ${MAX_PAGES} full pages comes back whole, in order`, async () => {
    const pages = Array.from({ length: MAX_PAGES }, (_, page) => Array.from({ length: 45 }, (_, line) => `Page ${page + 1}, line ${line + 1}`))
    await withPdf(textPdf(pages), async (doc) => {
      const lines = linesFromPages(await readPdf(doc))
      expect(lines.map((line) => line.text)).toEqual(pages.flat())
      expect(lines.map((line) => line.page)).toEqual(pages.flatMap((page, index) => page.map(() => index + 1)))
    })
  })

  test("stops at the page that takes it over the text limit", async () => {
    // A page of 1-point text, with room for more than the limit.
    const tiny = Array.from({ length: MAX_CHARACTERS / 1000 + 1 }, () => "x".repeat(1000))
    await withPdf(textPdf([["Mara Lin"], tiny, ["Never read"]], { size: 1 }), async (doc) => {
      const getPage = vi.spyOn(doc, "getPage")
      await expect(readPdf(doc)).rejects.toThrow(TooMuchTextError)
      expect(getPage.mock.calls.map(([number]) => number)).toEqual([1, 2])
    })
  })

  test("reads no further once cancelled", async () => {
    await withPdf(textPdf([["Mara Lin"], ["Never read"]]), async (doc) => {
      // Cancelled while the first page is being read.
      const cancel = new AbortController()
      const getPage = doc.getPage.bind(doc)
      const reads = vi.spyOn(doc, "getPage").mockImplementation((number) => {
        cancel.abort()
        return getPage(number)
      })
      await expect(readPdf(doc, cancel.signal)).rejects.toSatisfy((error: Error) => error.name === "AbortError")
      expect(reads).toHaveBeenCalledTimes(1)
    })
  })
})

describe("reading a Word file", () => {
  test("its unzipped size is read from the zip's directory", () => {
    const size = (padding: number) => unzippedXmlSize(bytes(wordFile(["Mara Lin"], { padding })))
    expect(size(5000)! - size(0)!).toBe(5000)
  })

  test("a file that isn't a zip has no size to read", () => {
    expect(unzippedXmlSize(bytes(Buffer.from("not a zip")))).toBeNull()
  })

  test("one that unzips to too much text isn't converted", async () => {
    vi.mocked(convertToHtml).mockClear()
    await expect(linesFromDocx(bytes(wordFile(["Mara Lin"], { padding: MAX_WORD_XML_BYTES })))).rejects.toThrow(TooMuchTextError)
    expect(convertToHtml).not.toHaveBeenCalled()
  })

  test("its paragraphs become lines", async () => {
    vi.mocked(convertToHtml).mockClear()
    await expect(linesFromDocx(bytes(wordFile(["Mara Lin", "mara@example.com"])))).resolves.toMatchObject([{ text: "Mara Lin" }, { text: "mara@example.com" }])
    expect(convertToHtml).toHaveBeenCalledTimes(1)
  })
})
