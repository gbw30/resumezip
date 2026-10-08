import { describe, expect, test, vi } from "vitest"
import { MAX_LINES } from "./limits"
import { readFile } from "./read"
import { wordFile } from "./testFiles"

const docx = (paragraphs: string[]) => ({ kind: "docx" as const, data: new Uint8Array(wordFile(paragraphs)).buffer })
const numbered = (count: number) => Array.from({ length: count }, (_, i) => `Line ${i + 1}`)

describe("the import worker", () => {
  test(`reads a file of ${MAX_LINES} lines`, async () => {
    const result = await readFile(docx(["Mara Lin", ...numbered(MAX_LINES - 1)]))
    expect("parsed" in result && result.parsed.lines).toHaveLength(MAX_LINES)
  })

  test("says there's too much text past that", async () => {
    await expect(readFile(docx(numbered(MAX_LINES + 1)))).resolves.toEqual({ problem: "too much text" })
  })

  test("finds no text on a page with none", async () => {
    await expect(readFile({ kind: "pdf", pages: [{ width: 612, height: 792, items: [], links: [] }] })).resolves.toEqual({
      problem: "no text",
    })
  })

  test("doesn't blame the file when mammoth fails to download", async () => {
    vi.resetModules()
    vi.doMock("mammoth", () => {
      throw new TypeError("Failed to fetch dynamically imported module")
    })
    try {
      const { readFile: readWithoutMammoth } = await import("./read")
      await expect(readWithoutMammoth(docx(["Mara Lin"]))).resolves.toEqual({ failed: expect.any(String) })
    } finally {
      vi.doUnmock("mammoth")
    }
  })

  test("says when a Word file can't be read", async () => {
    await expect(readFile({ kind: "docx", data: new TextEncoder().encode("not a zip").buffer })).resolves.toEqual({ problem: "unreadable" })
  })
})
