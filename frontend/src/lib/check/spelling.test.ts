import { describe, expect, test } from "vitest"
import { samples } from "@/lib/import/testRender"
import { runChecks } from "./engine"
import type { DialectName } from "./dialect"
import { viewOf } from "./resume"
import { RULES } from "./rules"
import { grammarTexts, isTypo, SPELLING_RULES } from "./spelling"
import { addWord, CHECK_FIELD, readCheckState } from "./state"
import { readingOf } from "./testHarper"

const job = (bullets: string[], { workEndDate = "Present", companyName = "Google", workRole = "Engineer" } = {}) => ({
  id: 1,
  workRole,
  companyName,
  workStartDate: "Jan 2022",
  workEndDate,
  workDescription: bullets.map((bullet) => `• ${bullet}`).join("\n"),
})

const resumeWith = (jobs: ReturnType<typeof job>[], extra: Record<string, unknown> = {}) => ({
  profileSection: { fullName: "Jake Ryan", email: "jake@exmaple.com", linkedin: "linkedin.com/in/jakeryan" },
  workExperienceSection: jobs,
  ...extra,
})

const TODAY = new Date(2026, 9, 7)

/** What one rule says about a resume, with Harper reading its text as the editor has it read. */
async function check(id: string, resume: Record<string, any>, { dialect = "american" as DialectName, read = true } = {}) {
  const rule = RULES.find((rule) => rule.id === id)!
  const grammar = read ? await readingOf(grammarTexts(viewOf(resume)).map(({ text }) => text), dialect) : undefined
  const report = runChecks(resume, { rules: [rule], grammar, today: TODAY })
  return {
    status: report.results[0].status,
    messages: report.findings.map((finding) => finding.message),
    findings: report.findings,
  }
}

const bulletAt = (line: number) => ({ kind: "entry", section: "Work", entry: 0, field: "workDescription", line })

describe("G1 typos", () => {
  test("points at each typo, with what to write instead", async () => {
    const result = await check("G1", resumeWith([job(["Recieved the team award", "Built a search index"])]))
    expect(result.findings).toEqual([
      expect.objectContaining({ place: bulletAt(0), text: "Recieved", level: "fix", message: "“Recieved” may be misspelled", suggestion: "Try “Received”. If it's spelled right, add the word." }),
    ])
  })

  test("waits for the grammar checker", async () => {
    expect((await check("G1", resumeWith([job(["Recieved the team award"])]), { read: false })).status).toBe("waiting")
  })

  test("knows the resume's own names, tech words, degrees and verbs", async () => {
    const resume = resumeWith([job(["Shipped Woonsocket's new site with DuckDB and eBPF at p99", "Prototyped an autograder in malloc for the nodejs backend"], { companyName: "Woonsocket Labs" })], {
      educationSection: [{ id: 1, schoolName: "Questrom School of Business", degree: "B.S.E. in Computer Science", schoolEndDate: "May 2024" }],
    })
    expect((await check("G1", resume)).status).toBe("passed")
  })

  test("doesn't check names, links and emails", async () => {
    const resume = resumeWith([job(["Built a search index"], { companyName: "Gogle" })])
    expect((await check("G1", resume)).status).toBe("passed")
  })

  test("a word added with Add word isn't flagged anywhere on the resume", async () => {
    const resume = resumeWith([job(["Built Flurbo's cache", "Moved Flurbo to Go"]), job(["Ran flurbo tests"])])
    expect((await check("G1", resume)).findings.map((finding) => finding.text)).toEqual(["Flurbo's", "Flurbo", "flurbo"])
    const added = { ...resume, [CHECK_FIELD]: addWord(readCheckState({}), "Flurbo") }
    expect((await check("G1", added)).status).toBe("passed")
  })

  test("names with capitals inside, words with digits, initials and dotted abbreviations aren't typos", () => {
    const known = new Set<string>()
    expect(["DuckDB", "XGBoost", "iOS", "SQL", "p99", "D.", "e.g.", "B.Sc"].filter((word) => isTypo(word, known))).toEqual([])
    expect(isTypo("recieved", known)).toBe(true)
    expect(isTypo("Flurbo's", new Set(["flurbo"]))).toBe(false)
  })

  test("British English, when the browser reads it", async () => {
    const resume = resumeWith([job(["Optimised the honours programme"])])
    expect((await check("G1", resume)).status).toBe("failed")
    expect((await check("G1", resume, { dialect: "british" })).status).toBe("passed")
  })
})

describe("G2–G4", () => {
  test("G2 finds a word written twice", async () => {
    expect((await check("G2", resumeWith([job(["Built the the search index"])]))).messages).toEqual(["“the” twice in a row"])
  })

  test("G3 finds the wrong “a” or “an”", async () => {
    expect((await check("G3", resumeWith([job(["Built a HTTP server", "Hired an university student"])]))).messages).toEqual([
      "“a HTTP” should be “an HTTP”",
      "“an university” should be “a university”",
    ])
  })

  test("G4 finds mixed-up words, and “loose” for “lose”", async () => {
    const resume = resumeWith([job(["Made the build faster then before", "Wrote it's docs", "Backed up data so users never loose work"])])
    expect((await check("G4", resume)).messages).toEqual(["“then” should be “than” here", "“it's” should be “its” here", "“loose” should be “lose” here"])
  })

  test("well-written bullets pass", async () => {
    const resume = resumeWith([job(["Built a search index that cut query time by 40%", "Led a team of 4 engineers", "Wrote an API used by 30 partners"])])
    for (const id of ["G1", "G2", "G3", "G4", "G7"]) expect((await check(id, resume)).status, id).toBe("passed")
  })
})

describe("G5 lead for led", () => {
  test("finds “lead” joined to what was done", async () => {
    const result = await check("G5", resumeWith([job(["Designed and lead the migration to Postgres", "Planned, lead and shipped the launch"], { workEndDate: "Dec 2024" })]))
    expect(result.messages).toEqual(["“lead” should be “led” here", "“lead” should be “led” here"])
    expect(result.findings[0].place).toEqual(bulletAt(0))
  })

  test("in a job still going, only in bullets about the past", async () => {
    expect((await check("G5", resumeWith([job(["Designed and lead the migration"])]))).status).toBe("failed")
    expect((await check("G5", resumeWith([job(["Design and lead code reviews"])]))).status).toBe("skipped")
  })

  test("not “lead” as a noun", async () => {
    expect((await check("G5", resumeWith([job(["Built dashboards and lead generation tools"], { workEndDate: "2023" })]))).status).toBe("passed")
  })
})

describe("G6 tech names", () => {
  test("finds tech names written another way, in any field", async () => {
    const resume = resumeWith([job(["Built the site in Javascript and nodejs", "Kept the code on github"])], { skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "python, SQL, Typescript" }] })
    expect((await check("G6", resume)).messages).toEqual([
      "“Javascript” is written “JavaScript”",
      "“nodejs” is written “Node.js”",
      "“github” is written “GitHub”",
      "“python” is written “Python”",
      "“Typescript” is written “TypeScript”",
    ])
  })

  test("leaves links and handles alone", async () => {
    const resume = resumeWith([job(["Open-sourced it at github.com/jake/cache", "Posted updates as @github"])], { profileSection: { fullName: "Jake Ryan", profileGithub: "github.com/jake" } })
    expect((await check("G6", resume)).status).toBe("passed")
  })
})

test("G7 finds other grammar mistakes, as suggestions", async () => {
  const result = await check("G7", resumeWith([job(["Could of shipped it faster"])]))
  expect(result.findings).toEqual([expect.objectContaining({ level: "look", text: "Could of", suggestion: "Try “Could have”." })])
})

test("few false typos on the template samples", async () => {
  const fixes: string[] = []
  for (const resume of samples) {
    const grammar = await readingOf(grammarTexts(viewOf(resume)).map(({ text }) => text))
    const report = runChecks(resume, { rules: SPELLING_RULES, grammar, today: TODAY })
    fixes.push(...report.findings.filter((finding) => finding.level === "fix").map((finding) => finding.text))
  }
  // A British spelling, read as American, and a product's name.
  expect(fixes).toEqual(["Honours", "Powerwall"])
})
