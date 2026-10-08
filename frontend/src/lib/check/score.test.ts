import { afterEach, describe, expect, test, vi } from "vitest"
import { readBack, render, samples } from "@/lib/import/testRender"
import { runChecks, type Outcome, type Rule } from "./engine"
import { viewOf } from "./resume"
import { RULES } from "./rules"
import { readForChecks } from "@/lib/import/read"
import { pdfLayoutOf } from "./extraPdf"
import { checkingCategories, keepScores, scoreOf, shownScore, totalOf, wholePoints, type KeptScores, type Score } from "./score"
import { CATEGORIES, MUST_FIX_MAX, type CategoryId, type Level } from "./settings"
import { grammarTexts } from "./spelling"
import { addWord, CHECK_FIELD, dismiss, readCheckState } from "./state"
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

// Suggestions in a category that pass, as most of a category's rules do on a good resume.
const passing = (category: CategoryId, count = 8) => Array.from({ length: count }, (_, index) => rule(`${category}${index}`, category, "look", passes))

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

  test("takes half a category's points for a must-fix it finds, and a fifth for a suggestion", () => {
    // Contact is worth 15: the broken email takes 7.5 of them.
    const score = scoreWith([...passing("contact"), rule("C2", "contact", "fix", found(1))])
    expect(category(score, "contact")).toEqual({ id: "contact", points: 15, earned: 7.5, applies: true, mustFix: true })
    expect(score.total).toBe(50)
    expect(category(scoreWith([...passing("contact"), rule("C3", "contact", "look", found(1))]), "contact").earned).toBe(12)
  })

  test("gives nothing for passing, so easy passes don't make up for a problem", () => {
    const broken = rule("C2", "contact", "fix", found(1))
    expect(category(scoreWith([...passing("contact", 3), broken]), "contact").earned).toBe(7.5)
    expect(category(scoreWith([...passing("contact", 30), broken]), "contact").earned).toBe(7.5)
  })

  test("takes at least half the penalty for finding anything, and the rest by how much of the resume fails", () => {
    // 1 bullet in 4: half a fifth, and an eighth of the other half.
    const score = scoreWith([...passing("bullets"), rule("B1", "bullets", "look", found(4, 1))])
    expect(category(score, "bullets").earned).toBe(17.5)
    expect(score.total).toBe(87)
    expect(category(scoreWith([...passing("bullets"), rule("B1", "bullets", "look", found(4))]), "bullets").earned).toBe(16)
  })

  test("earns no more than the share of a category's rules that pass, so one whose only rules fail earns nothing", () => {
    // No bullets at all: the only rule about bullets that applies says so.
    expect(category(scoreWith([rule("B8", "bullets", "look", found(1))]), "bullets").earned).toBe(0)
    // A page that's half empty, beside a page count that's fine.
    expect(category(scoreWith([rule("L1", "length", "look", passes), rule("L5", "length", "look", found(1))]), "length").earned).toBe(5)
  })

  test("adds up what each rule takes, down to nothing", () => {
    const score = scoreWith([rule("C2", "contact", "fix", found(1)), rule("C10", "contact", "fix", found(1)), rule("C3", "contact", "look", found(1))])
    expect(category(score, "contact").earned).toBe(0)
    expect(score.total).toBe(0)
  })

  test("stays at 89 or below while a must-fix is left", () => {
    const elsewhere = CATEGORIES.filter(({ id }) => id !== "spelling").flatMap(({ id }) => passing(id, 1))
    // One typo in a hundred texts takes only 4 of the 100 points, but it's a typo.
    const typo = scoreWith([...elsewhere, rule("G1", "spelling", "fix", found(100, 1))])
    expect(typo.total).toBe(MUST_FIX_MAX)
    // A suggestion as small isn't held.
    expect(scoreWith([...elsewhere, rule("G7", "spelling", "look", found(100, 1))]).total).toBe(98)
  })

  test("leaves out rules that don't apply, broke, or are still waiting, and a category without any gives its points to the others", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const broken = rule("B2", "bullets", "look", () => {
      throw new Error("A bug")
    })
    const waiting: Rule = { ...rule("L1", "length", "look", passes), reads: "pdf", check: passes }
    const notProjects = rule("S6", "sections", "look", () => null)
    // C2 finds 1 problem in 2: it takes three quarters of its half of Contact.
    const score = scoreWith([rule("C1", "contact", "fix", passes), rule("C2", "contact", "fix", found(2, 1)), notProjects, broken, waiting])
    expect(score.categories.filter((category) => category.applies).map((category) => category.id)).toEqual(["contact"])
    expect(category(score, "contact").earned).toBe(9.375)
    expect(score.total).toBe(62)
  })

  test("scores a rule that has seen only part of the text by what it found there", () => {
    // As when the grammar checker failed partway: a typo it found costs points, so it's never beside a 100…
    const typo = rule("G1", "spelling", "fix", () => ({ ...found(4, 1)(), partial: true }))
    const withTypo = scoreWith([rule("C1", "contact", "fix", passes), typo])
    expect(category(withTypo, "spelling")).toMatchObject({ applies: true, earned: 10.3125, mustFix: true })
    expect(withTypo.total).toBe(84)
    // …but finding nothing in part of the text isn't a pass, so it's left out.
    const clean = rule("G1", "spelling", "fix", () => ({ ...found(4, 0)(), partial: true }))
    const score = scoreWith([rule("C1", "contact", "fix", passes), clean])
    expect(category(score, "spelling").applies).toBe(false)
    expect(score.total).toBe(100)
  })

  test("counts dismissed suggestions as passing", () => {
    const weak = rule("B1", "bullets", "look", found(4, 1))
    const [finding] = runChecks(ada, { rules: [weak] }).findings
    const dismissed = { ...ada, [CHECK_FIELD]: dismiss(readCheckState(ada), finding) }
    expect(scoreWith([weak], dismissed).total).toBe(100)
  })

  test("is 100 only when everything passes", () => {
    // One problem in a thousand still costs points.
    expect(scoreWith([rule("B3", "bullets", "look", found(1000, 1))]).total).toBe(89)
    // Points that come to a whole number, give or take how computers add, count as whole.
    expect(wholePoints(0.1 * 3 * 10)).toBe(3)
    expect(wholePoints(2.9999999999)).toBe(3)
    expect(totalOf([])).toBeNull()
  })
})

describe("while checks are under way", () => {
  // Length waiting for the PDF to be read, as after each change.
  const waitingForPdf: Rule = { ...rule("L5", "length", "look", passes), reads: "pdf", check: found(1) }

  test("a category is being checked while the PDF or the text it reads is, whatever the report says so far", () => {
    expect(Object.fromEntries(checkingCategories(RULES, { readingPdf: true, checkingText: false }))).toEqual({ readable: "pdf", length: "pdf" })
    expect(Object.fromEntries(checkingCategories(RULES, { readingPdf: false, checkingText: true }))).toEqual({ spelling: "grammar" })
    expect(checkingCategories(RULES, { readingPdf: false, checkingText: false }).size).toBe(0)
  })

  test("a category being checked again keeps its points as last checked, so the score doesn't jump", () => {
    const kept: KeptScores = new Map()
    const before = scoreWith([rule("C2", "contact", "fix", passes), rule("L5", "length", "look", passes)])
    keepScores(kept, before, new Map())
    // Now the email is broken, and Length is waiting for the new PDF: it keeps its 10 points.
    const now = scoreWith([rule("C2", "contact", "fix", found(1)), waitingForPdf])
    const checking = new Map([["length", "pdf"]] as const)
    const shown = shownScore(now, kept, checking)
    expect(shown.categories.find((category) => category?.id === "length")).toEqual({ id: "length", points: 10, earned: 10, applies: true, mustFix: false })
    expect(shown.total).toBe(40)
    expect(shown.mustFix).toBe(true)
    // And isn't kept as it is while waiting.
    keepScores(kept, now, checking)
    expect(kept.get("length")!.earned).toBe(10)
    expect(kept.get("contact")!.earned).toBe(0)
  })

  test("a must-fix found while its category is checked again holds the total down at once", () => {
    // Readable was clean, and a bullet character is typed while the new PDF is read.
    const kept: KeptScores = new Map()
    const readable = (outcome: () => Outcome) => [...passing("readable"), rule("R6", "readable", "fix", outcome)]
    keepScores(kept, scoreWith(readable(passes)), new Map())
    const checking = new Map([["readable", "pdf"]] as const)
    const shown = shownScore(scoreWith(readable(found(1))), kept, checking)
    // Its points are kept as they were, but the total is held.
    expect(shown.categories.find((category) => category?.id === "readable")!.earned).toBe(15)
    expect(shown.total).toBe(MUST_FIX_MAX)
    expect(shown.mustFix).toBe(true)
    // And it says so while another category waits to be checked for the first time.
    expect(shownScore(scoreWith(readable(found(1))), new Map(), checking)).toMatchObject({ total: "checking", mustFix: true })
  })

  test("until a category has been checked once, its points and the total wait", () => {
    const now = scoreWith([rule("C1", "contact", "fix", passes), waitingForPdf])
    const shown = shownScore(now, new Map(), new Map([["length", "pdf"]] as const))
    expect(shown.total).toBe("checking")
    expect(shown.categories.find((_, index) => CATEGORIES[index].id === "length")).toBeNull()
  })

  test("points from before the resume could be scored aren't kept", () => {
    // Without a name and an entry yet, Length's rule doesn't apply.
    const kept: KeptScores = new Map()
    keepScores(kept, scoreWith([rule("L5", "length", "look", () => null)], {}), new Map())
    expect(kept.size).toBe(0)
    // So once it has them, and the new PDF is being read, the total waits for it.
    const now = scoreWith([rule("C1", "contact", "fix", passes), waitingForPdf])
    expect(shownScore(now, kept, new Map([["length", "pdf"]] as const)).total).toBe("checking")
  })

  test("points are let go when the resume can't be scored any more, so they don't come back unchecked", () => {
    const kept: KeptScores = new Map()
    keepScores(kept, scoreWith([rule("C1", "contact", "fix", passes), rule("L5", "length", "look", passes)]), new Map())
    expect(kept.get("length")!.earned).toBe(10)
    // The name is deleted, then typed again while the new PDF is being read.
    keepScores(kept, scoreWith([rule("L5", "length", "look", passes)], { profileSection: {} }), new Map())
    expect(kept.size).toBe(0)
    const now = scoreWith([rule("C1", "contact", "fix", passes), waitingForPdf])
    expect(shownScore(now, kept, new Map([["length", "pdf"]] as const)).total).toBe("checking")
  })
})

describe("on real resumes", () => {
  // Every rule, with the PDF printed and read back, and the text checked for spelling, as the editor does.
  async function scoreOfResume(resume: Record<string, unknown>): Promise<number | null> {
    const { parsed, pages } = await readBack(await render(resume))
    const pdf = readForChecks(parsed.lines, pdfLayoutOf(viewOf(resume)))
    const grammar = await readingOf(grammarTexts(viewOf(resume)).map(({ text }) => text))
    return scoreOf(runChecks(resume, { pdf: { lines: pdf.parsed.lines, pages, ...pdf }, grammar, today: TODAY })).total
  }

  test("each template's sample scores high, and a resume with obvious problems fails", async () => {
    // A product's name the spelling checker doesn't know is added as a word, as a person would (see spelling.test.ts).
    for (const sample of samples) {
      const words = { ...sample, [CHECK_FIELD]: addWord(readCheckState(sample), "Powerwall") }
      expect(await scoreOfResume(words), sample.selectedTemplate).toBeGreaterThanOrEqual(95)
    }

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
    expect(await scoreOfResume(sloppy)).toBeLessThanOrEqual(50)

    // A name, a broken email and a company, and nothing else: no role, dates, bullets, education or skills.
    const bare = {
      resumeTag: "professional",
      selectedTemplate: "jake",
      profileSection: { fullName: "Marcus Bell", email: "marcus@gmail" },
      workExperienceSection: [{ id: 1, companyName: "Google" }],
    }
    expect(await scoreOfResume(bare)).toBeLessThanOrEqual(50)
  })
})
