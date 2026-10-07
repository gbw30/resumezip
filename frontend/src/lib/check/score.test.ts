import { afterEach, describe, expect, test, vi } from "vitest"
import { readBack, render, samples } from "@/lib/import/testRender"
import { runChecks, type Outcome, type Rule } from "./engine"
import { viewOf } from "./resume"
import { scoreOf, totalOf, wholePoints, type Score } from "./score"
import { CATEGORIES, type CategoryId, type Level } from "./settings"
import { grammarTexts } from "./spelling"
import { CHECK_FIELD, dismiss, readCheckState } from "./state"
import { readingOf } from "./testHarper"

const TODAY = new Date(2026, 9, 7)

const ada = {
  resumeTag: "professional",
  profileSection: { fullName: "Ada Lovelace", email: "ada@example.com" },
  workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Analytical Engines", workDescription: "• Built a loom" }],
}

/** A rule for tests that comes to `outcome`: null when it doesn't apply. */
function rule(id: string, category: CategoryId, level: Level, outcome: () => Outcome | null): Rule {
  return { id, category, level, title: `Check ${id}`, why: `Why ${id} matters`, reads: "form", check: outcome }
}

// A rule that looked at `checked` things and found something wrong with `wrong` of them.
const found =
  (checked: number, wrong = checked): (() => Outcome) =>
  () => ({
    checked,
    problems: Array.from({ length: wrong }, () => ({ place: { kind: "profile", field: "fullName" } as const, message: "Something's off" })),
  })
const passes = found(1, 0)

const scoreWith = (rules: Rule[], resume: Record<string, unknown> = ada) => scoreOf(runChecks(resume, { rules, today: TODAY }))
const category = (score: Score, id: CategoryId) => score.categories.find((category) => category.id === id)!

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the resume score", () => {
  test("waits for a name and an entry", () => {
    const rules = [rule("C1", "contact", "fix", passes)]
    expect(scoreWith(rules, {}).total).toBeNull()
    expect(scoreWith(rules, { profileSection: { fullName: "Ada Lovelace" } }).total).toBeNull()
    expect(scoreWith(rules).total).toBe(100)
  })

  test("is out of the categories' points, 100 in all", () => {
    expect(CATEGORIES.reduce((sum, category) => sum + category.points, 0)).toBe(100)
    const score = scoreWith(CATEGORIES.map((category, index) => rule(`X${index}`, category.id, "look", passes)))
    expect(score.categories.map(({ id, points, earned }) => [id, points, earned])).toEqual(CATEGORIES.map(({ id, points }) => [id, points, points]))
    expect(score.total).toBe(100)
  })

  test("shares a category's points among its rules, a must-fix counting twice as much as a suggestion", () => {
    // Contact is worth 15: the fix that failed would have earned 10 of them, the suggestion that passed earns its 5.
    const score = scoreWith([rule("C2", "contact", "fix", found(1)), rule("C3", "contact", "look", passes)])
    expect(category(score, "contact")).toEqual({ id: "contact", points: 15, earned: 5, applies: true })
    expect(score.total).toBe(33)
  })

  test("gives partial credit for how much of the resume passes", () => {
    // 1 bullet in 4 has a problem: Bullets earns 3/4 of its 20 points.
    const score = scoreWith([rule("B1", "bullets", "look", found(4, 1))])
    expect(category(score, "bullets").earned).toBe(15)
    expect(score.total).toBe(75)
  })

  test("leaves out rules that don't apply, broke, or are still waiting, and a category without any gives its points to the others", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const broken = rule("B2", "bullets", "look", () => {
      throw new Error("A bug")
    })
    const waiting: Rule = { ...rule("L1", "length", "look", passes), reads: "pdf", check: passes }
    const notProjects = rule("S6", "sections", "look", () => null)
    // C1 earns its half of Contact, C2 half of its half.
    const score = scoreWith([rule("C1", "contact", "fix", passes), rule("C2", "contact", "fix", found(2, 1)), notProjects, broken, waiting])
    expect(score.categories.filter((category) => category.applies).map((category) => category.id)).toEqual(["contact"])
    expect(category(score, "contact").earned).toBe(11.25)
    expect(score.total).toBe(75)
  })

  test("counts dismissed suggestions as passing", () => {
    const weak = rule("B1", "bullets", "look", found(4, 1))
    const [finding] = runChecks(ada, { rules: [weak] }).findings
    const dismissed = { ...ada, [CHECK_FIELD]: dismiss(readCheckState(ada), finding) }
    expect(scoreWith([weak], dismissed).total).toBe(100)
  })

  test("is 100 only when everything passes", () => {
    // One problem in a thousand still costs a point.
    expect(scoreWith([rule("B3", "bullets", "look", found(1000, 1))]).total).toBe(99)
    // Points that come to a whole number, give or take how computers add, count as whole.
    expect(wholePoints(0.1 * 3 * 10)).toBe(3)
    expect(wholePoints(2.9999999999)).toBe(3)
    expect(totalOf([])).toBeNull()
  })
})

describe("on real resumes", () => {
  // Every rule, with the PDF printed and read back, and the text checked for spelling, as the editor does.
  async function scoreOfResume(resume: Record<string, unknown>): Promise<number | null> {
    const { parsed, pages } = await readBack(await render(resume))
    const grammar = await readingOf(grammarTexts(viewOf(resume)).map(({ text }) => text))
    return scoreOf(runChecks(resume, { pdf: { lines: parsed.lines, pages, parsed }, grammar, today: TODAY })).total
  }

  test("each template's sample scores high, and a resume with obvious problems clearly lower", async () => {
    for (const sample of samples) expect(await scoreOfResume(sample), sample.selectedTemplate).toBeGreaterThanOrEqual(95)

    // A broken email, no dates, no education or skills, a typo, and weak, vague bullets on a page a third full.
    const sloppy = {
      resumeTag: "professional",
      selectedTemplate: "jake",
      profileSection: { fullName: "Marcus Bell", email: "marcus@gmail", phoneNumber: "555 0134", linkedin: "linkedin.com/feed" },
      workExperienceSection: [
        {
          id: 1,
          workRole: "Intern",
          companyName: "Google",
          workDescription: "• Responsible for the the backend\n• I helped with varous tasks etc.\n• Worked on team projects",
        },
        {
          id: 2,
          workRole: "Developer",
          companyName: "Acme",
          workStartDate: "Jnu 2024",
          workEndDate: "Present",
          workDescription: "• Responsible for the the frontend\n• Helped with alot of stuff\n• Worked on team projects",
        },
      ],
    }
    expect(await scoreOfResume(sloppy)).toBeLessThanOrEqual(80)
  })
})
