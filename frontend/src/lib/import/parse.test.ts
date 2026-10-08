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

describe("nothing on an entry's title line is thrown away", () => {
  test("a second date goes to Couldn't place", () => {
    const { resume, unplaced } = read("Experience", [
      line([["Teaching Assistant", 36], ["Fall 2023", 400], ["Spring 2025", 480]], { bold: true }),
      line([["State University", 36]], { italic: true }),
    ])
    expect(resume.workExperienceSection[0]).toMatchObject({ workRole: "Teaching Assistant", workEndDate: "Fall 2023" })
    expect(unplaced).toEqual(["Spring 2025"])
  })

  test("so do an award's other dates", () => {
    const { resume, unplaced } = read("Awards", [line([["Dean’s List, Fall 2023, Spring 2024", 36]])])
    expect(resume.awardsSection[0]).toMatchObject({ awardName: "Dean’s List", awardDate: "Fall 2023" })
    expect(unplaced).toEqual(["Spring 2024"])
  })
})

describe("an entry's date", () => {
  test("is the one alone on the right, not a year in the title, which stays in it", () => {
    const { resume, unplaced } = read("Projects", [
      line([["Sprout – HackGT 2026 | React, Flask", 36], ["September 2026", 480]], { bold: true }),
      line([["Built a garden planner", 54]], { bullet: true }),
    ])
    expect(resume.projectsSection[0].projectDate).toBe("September 2026")
    expect(Object.values(resume.projectsSection[0]).join(" ")).toContain("HackGT 2026")
    expect(unplaced).toEqual([])
  })

  test("is a year in the title when there's no other", () => {
    const { resume } = read("Awards", [line([["First Place, HackGT 2026", 36]])])
    expect(resume.awardsSection[0].awardDate).toBe("2026")
  })
})

describe("a detail line that wraps", () => {
  const school = [
    line([["State University", 36], ["Aug 2022 – May 2026", 480]], { bold: true }),
    line([["B.S. in Biology", 36], ["Austin, TX", 500]], { italic: true }),
  ]

  test("carries on at its own left edge when it was cut off mid-list", () => {
    const { resume } = read("Education", [
      ...school,
      line([["Relevant Coursework: Genetics, Organic Chemistry (CHEM 2310), Statistics (STA 2023),", 36]]),
      line([["Cell Biology (BIO 2020), Ecology", 36]]),
    ])
    expect(resume.educationSection).toHaveLength(1)
    expect(resume.educationSection[0].coursework).toBe("Genetics, Organic Chemistry (CHEM 2310), Statistics (STA 2023), Cell Biology (BIO 2020), Ecology")
  })

  test("doesn't take in the next school", () => {
    const { resume } = read("Education", [
      ...school,
      line([["Relevant Coursework: Genetics, Ecology,", 36]]),
      line([["Austin Community College", 36], ["Aug 2020 – May 2022", 480]], { bold: true }),
    ])
    expect(resume.educationSection.map((entry: Record<string, string>) => entry.schoolName)).toEqual(["State University", "Austin Community College"])
  })
})
