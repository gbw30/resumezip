// How the templates lay out a line with text on the left and dates flush
// right, checked on the printed page: however long the text gets, the dates
// never run into it.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { expect, test } from "vitest"
import { readPdf, type PdfPage } from "@/lib/import/lines"
import { render } from "@/lib/import/testRender"
import { TEMPLATES } from "@/lib/templates"

const TEXT = "Senior Software Engineering Intern on the Payments Platform and Data Infrastructure Reliability Team for Cloud Services"

// The text a letter longer in each entry, so in one of them it fills its line
// exactly. Each entry's dates are told apart by their year.
const entries = Array.from({ length: TEXT.length - 29 }, (_, i) => ({ text: TEXT.slice(0, 30 + i).trim(), year: 1930 + i }))

async function pagesOf(pdf: Uint8Array): Promise<PdfPage[]> {
  const doc = (await getDocument({ data: pdf, isEvalSupported: false, fontExtraProperties: true }).promise) as unknown as PDFDocumentProxy
  try {
    return await readPdf(doc)
  } finally {
    await doc.destroy()
  }
}

/** How far `text` starts after what's printed before it on its line, in ems; 0 if it's run into it. */
function gapBefore(pages: PdfPage[], text: string): number {
  for (const { items } of pages) {
    const item = items.find((item) => item.text.includes(text))
    if (!item) continue
    if (!item.text.trimStart().startsWith(text)) return 0
    const before = items.filter((other) => Math.abs(other.baseline - item.baseline) <= 0.45 * item.size && other.right <= item.x + 0.5)
    return before.length ? (item.x - Math.max(...before.map((other) => other.right))) / item.size : Infinity
  }
  throw new Error(`"${text}" isn't printed`)
}

test.each(TEMPLATES.map((template) => template.id))("%s keeps dates apart from the text before them, however long it is", async (id) => {
  const pages = await pagesOf(
    await render({
      selectedTemplate: id,
      profileSection: { fullName: "Alex Kim" },
      educationSection: entries.map(({ text, year }) => ({ schoolName: text, degree: text, schoolStartDate: `Sep ${year}` })),
      workExperienceSection: entries.map(({ text, year }) => ({
        companyName: "Google",
        workLocation: "Mountain View, CA",
        workRole: text,
        workStartDate: `May ${year}`,
      })),
      projectsSection: entries.map(({ text, year }) => ({ projectName: text, projectDate: `Jan ${year}` })),
      awardsSection: entries.map(({ text, year }) => ({ awardName: text, awardDate: `Mar ${year}` })),
    }),
  )
  for (const { text, year } of entries) {
    for (const month of ["Sep", "May", "Jan", "Mar"]) {
      expect(gapBefore(pages, `${month} ${year}`), `${month} ${year} after "${text}"`).toBeGreaterThanOrEqual(0.5)
    }
  }
})
