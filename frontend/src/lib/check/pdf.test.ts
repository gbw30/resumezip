import { describe, expect, test } from "vitest"
import { comparable, printedBullets } from "./pdf"
import { viewOf } from "./resume"
import { line, reading } from "./testPdf"

const resumeWith = (bullets: string[]) =>
  viewOf({ workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Google", workDescription: bullets.map((bullet) => `• ${bullet}`).join("\n") }] })

describe("comparing text from the PDF with what was typed", () => {
  test("keeps letters and digits only, without accents or case", () => {
    expect(comparable("Résumé — “Built” C++, 40%")).toBe("resumebuiltc40")
    expect(comparable("ﬁled")).toBe("filed")
  })
})

describe("finding the lines a bullet is printed on", () => {
  test("follows a bullet onto the lines it wraps to, hyphenated or not, and skips other lines", () => {
    const resume = resumeWith(["Built a search index that cut query time by 40%", "Led the development of a new parser"])
    const pdf = reading([
      line("Engineer, Google"),
      line("Built a search index that", { bullet: true }),
      line("cut query time by 40%"),
      line("Led the devel-", { bullet: true }),
      line("opment of a new parser"),
    ])
    expect(printedBullets(resume, pdf).map(({ place, printed }) => [place, printed.lines.map(({ text }) => text)])).toEqual([
      [{ kind: "entry", section: "Work", entry: 0, field: "workDescription", line: 0 }, ["Built a search index that", "cut query time by 40%"]],
      [{ kind: "entry", section: "Work", entry: 0, field: "workDescription", line: 1 }, ["Led the devel-", "opment of a new parser"]],
    ])
  })

  test("works without bullets marked in the PDF, matches copies in order, and leaves out what isn't printed", () => {
    const resume = resumeWith(["Built the index", "Built the index", "Not in the PDF"])
    const pdf = reading([line("Built the index"), line("Built the index")])
    expect(printedBullets(resume, pdf).map(({ place }) => place.kind === "entry" && place.line)).toEqual([0, 1])
  })
})
