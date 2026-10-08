// A made-up preview PDF reading, for testing the checker's PDF rules without
// rendering one.

import type { Line, PageSize } from "@/lib/import/lines"
import type { ParsedResume } from "@/lib/import/parse"
import type { PdfReading } from "./engine"

/** A line of text on a page, `top` points from the page's top. */
export function line(text: string, { page = 1, top = 100, bullet = false, size = 10 } = {}): Line {
  const left = bullet ? 57 : 70
  return {
    parts: [{ text, x: 70, runs: [] }],
    text,
    bullet,
    left,
    x: 70,
    size,
    bold: false,
    italic: false,
    links: [],
    page,
    box: [left, top, 560, top + 12],
  }
}

/** A reading of `lines` on letter-size pages, with what the resume reader found. */
export function reading(lines: Line[], parsed: Partial<Omit<ParsedResume, "lines">> = {}, pageCount = 1): PdfReading {
  const pages: PageSize[] = Array.from({ length: pageCount }, () => ({ width: 612, height: 792 }))
  return { lines, pages, parsed: { lines, profile: {}, profileLines: [], sections: [], unplaced: [], ...parsed } }
}
