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

/**
 * Lines laid out down a page, each 12 points below the last, with its right
 * edge where its text would end at 5 points a letter, so the reader can tell
 * which lines ran out of room.
 */
const onPage = (lines: Line[]): Line[] =>
  lines.map((line, i) => {
    const end = line.parts[line.parts.length - 1]
    return { ...line, box: [line.left, 100 + 12 * i, end.x + end.text.length * 5, 110 + 12 * i] }
  })

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

describe("a year on a line that wrapped", () => {
  test("stays in the bullet it carries on", () => {
    const { resume } = read(
      "Leadership",
      onPage([
        line([["Software Lead", 36], ["Sep 2026 – Present", 480]], { bold: true }),
        line([["GT Solar Racing", 36]], { italic: true }),
        line([["Lead software for the team’s solar car, building battery telemetry and a live dashboard in React for the", 54]], { bullet: true }),
        line([["2027 American Solar Challenge.", 54]]),
        line([["Mentor 5 new members", 54]], { bullet: true }),
      ]),
    )
    expect(resume.leadershipExperienceSection).toHaveLength(1)
    expect(resume.leadershipExperienceSection[0].leadershipDescription).toBe(
      "• Lead software for the team’s solar car, building battery telemetry and a live dashboard in React for the 2027 American Solar Challenge.\n• Mentor 5 new members",
    )
  })

  test("stays in the paragraph it carries on", () => {
    const { resume } = read(
      "Experience",
      onPage([
        line([["2026", 36], ["Study Abroad Instructional Staff", 120], ["Kyoto, Japan", 480]], { bold: true }),
        line([["Supported a 12-week engineering study abroad program in Kyoto for students during Summer", 120]]),
        line([["2026, combining language study with design and computing courses.", 120]]),
      ]),
    )
    expect(resume.workExperienceSection).toHaveLength(1)
    expect(resume.workExperienceSection[0].workDescription).toContain("during Summer 2026, combining")
  })

  test("doesn't take in the next entry's title, with its date set apart", () => {
    const { resume } = read(
      "Experience",
      onPage([
        line([["Google", 36]], { bold: true }),
        line([["Senior Engineer", 54], ["Jan 2021 – Present", 480]], { italic: true }),
        line([["Led the move of the ads ranking service to a new storage layer, cutting its p99 latency in half", 64]], { bullet: true }),
        line([["Engineer", 54], ["Jun 2018 – Dec 2020", 480]], { italic: true }),
      ]),
    )
    expect(resume.workExperienceSection.map((job: Record<string, string>) => job.workStartDate)).toEqual(["Jan 2021", "Jun 2018"])
  })

  test("doesn't take in a title with its date in it, after a line with room left", () => {
    const { resume } = read(
      "Experience",
      onPage([
        line([["Software Engineer, Acme Corp, 2019 – 2021", 36]], { bold: true }),
        line([["Built the billing service", 36]]),
        line([["Data Analyst, Beta Inc, 2017 – 2019", 36]], { bold: true }),
      ]),
    )
    expect(resume.workExperienceSection.map((job: Record<string, string>) => job.workStartDate)).toEqual(["2019", "2017"])
  })
})

describe("publications", () => {
  test("numbered citations that wrap under a hanging indent are read one by one", () => {
    const { resume } = read("Publications", [
      line([["[1] W. Zhang and M. Torres, “Sparse Experts for Retrieval,” International", 44]]),
      line([["Conference on Learning Representations (ICLR), 2026.", 61]]),
      line([["[2] J. Kim and W. Zhang, “Benchmarking Long Documents,” Proc. Annual Meeting", 44]]),
      line([["of the Association for Computational Linguistics (ACL), Vienna, Austria,", 61]]),
      line([["pp. 410–422, Jul 2025.", 61]]),
    ])
    expect(resume.publicationsSection.map((paper: Record<string, string>) => [paper.publicationTitle, paper.publicationDate])).toEqual([
      ["Sparse Experts for Retrieval", "2026"],
      ["Benchmarking Long Documents", "Jul 2025"],
    ])
  })
})
