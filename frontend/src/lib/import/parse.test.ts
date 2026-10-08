import { describe, expect, test } from "vitest"
import type { Line } from "./lines"
import { parseResume, toResumeContent } from "./parse"

/**
 * A line of a PDF from its parts, as [text, x] pairs: text set apart on the
 * line, like dates on the right. A bullet's text starts 10 points after it.
 */
function line(parts: [string, number][], { bullet = false, bold = false, italic = false, size = 10 } = {}): Line {
  const x = parts[0][1]
  return {
    parts: parts.map(([text, at]) => ({ text, x: at, runs: [{ start: 0, end: text.length, bold, italic }] })),
    text: parts.map(([text]) => text).join(" "),
    bullet,
    left: bullet ? x - 10 : x,
    x,
    size,
    bold,
    italic,
    links: [],
    page: 1,
  }
}

/** A resume of `lines` under a name and a heading. */
const read = (heading: string, lines: Line[]) => {
  const parsed = parseResume([line([["Mara Lin", 36]], { size: 18, bold: true }), line([[heading, 36]], { size: 12, bold: true }), ...lines])
  return { parsed, resume: toResumeContent(parsed), unplaced: parsed.unplaced.flatMap((group) => group.text) }
}

describe("dates", () => {
  test("a month written as a number is a date", () => {
    const { resume } = read("Experience", [line([["Data Analyst", 36], ["06/2022 – 1/2024", 480]], { bold: true }), line([["Acme Corp", 36]], { italic: true })])
    expect(resume.workExperienceSection[0]).toMatchObject({ workStartDate: "06/2022", workEndDate: "1/2024" })
  })

  test("a split like 80/20 on a bullet's second line stays in the bullet", () => {
    const { resume } = read("Experience", [
      line([["Data Analyst", 36], ["Jun 2022 – Present", 480]], { bold: true }),
      line([["Acme Corp", 36]], { italic: true }),
      line([["Trained a fraud model on a year of card payments with a", 54]], { bullet: true }),
      line([["70/30 split between training and testing data", 54]]),
      line([["Cut false alarms by a third", 54]], { bullet: true }),
    ])
    expect(resume.workExperienceSection).toHaveLength(1)
    expect(resume.workExperienceSection[0].workDescription).toBe(
      "• Trained a fraud model on a year of card payments with a 70/30 split between training and testing data\n• Cut false alarms by a third",
    )
  })
})
