import { describe, expect, test } from "vitest"
import type { PdfReading } from "./engine"
import { runChecks } from "./engine"
import { RULES } from "./rules"
import { line, reading } from "./testPdf"

const jake = {
  profileSection: { fullName: "Jake Ryan", email: "jake@gmail.com", phoneNumber: "(512) 555-0142" },
  workExperienceSection: [
    { id: 1, workRole: "Software Engineer II", companyName: "Stripe", workStartDate: "Jan 2024", workEndDate: "Present", workDescription: "• Built the ledger" },
  ],
}

// What the reader finds in Jake's PDF when it reads everything right.
const found = {
  profile: { fullName: "JAKE RYAN", email: "jake@gmail.com", phoneNumber: "512.555.0142" },
  sections: [{ name: "Work" as const, entries: [{ fields: { workRole: "Software Engineer II", companyName: "Stripe", workStartDate: "Jan 2024", workEndDate: "Present" }, lines: [] }] }],
}

/** What one rule says about a resume and its PDF. */
function check(id: string, resume: Record<string, any>, pdf: PdfReading = reading([], found)) {
  const rule = RULES.find((rule) => rule.id === id)!
  const report = runChecks(resume, { rules: [rule], pdf })
  return { status: report.results[0].status, messages: report.findings.map((finding) => finding.message), findings: report.findings }
}

test("a PDF that reads back as typed passes every readability rule", () => {
  for (const id of ["R1", "R2", "R3", "R4", "R5", "R6"]) expect(check(id, jake).status, id).toBe("passed")
})

describe("R1 contact details", () => {
  test("is a fix for each one the reader can't find, ignoring case and how a phone is written", () => {
    const pdf = reading([], { ...found, profile: { fullName: "Jake Ryan", phoneNumber: "512 555 0142" } })
    expect(check("R1", jake, pdf).findings).toEqual([
      expect.objectContaining({ level: "fix", place: { kind: "profile", field: "email" }, message: "Hiring software can't find your email in the PDF" }),
    ])
  })
})

describe("R2 section headings", () => {
  test("is a fix for a printed section the reader doesn't find, naming its heading", () => {
    const resume = { ...jake, headings: { work: "My Journey" } }
    expect(check("R2", resume, reading([], { ...found, sections: [] })).findings).toEqual([
      expect.objectContaining({
        level: "fix",
        place: { kind: "heading", section: "Work" },
        message: "Hiring software may not know “My Journey” as a heading",
        suggestion: "Use a usual one, like “Experience”.",
      }),
    ])
  })
})

describe("R3 entries read as typed", () => {
  test("takes values the reader puts in a neighbouring field of the same entry", () => {
    const swapped = { ...found, sections: [{ name: "Work" as const, entries: [{ fields: { workRole: "Stripe", companyName: "Software Engineer II", workStartDate: "Jan 2024", workEndDate: "Present" }, lines: [] }] }] }
    expect(check("R3", jake, reading([], swapped)).status).toBe("passed")
  })

  test("flags a value the entry doesn't have at all", () => {
    const missing = { ...found, sections: [{ name: "Work" as const, entries: [{ fields: { workRole: "Software Engineer II", companyName: "Stripe", workStartDate: "Jan 2024" }, lines: [] }] }] }
    expect(check("R3", jake, reading([], missing)).findings).toEqual([
      expect.objectContaining({ place: { kind: "entry", section: "Work", entry: 0, field: "workEndDate" }, message: "Hiring software doesn't read the end with this entry" }),
    ])
  })

  test("matches whole words, so “IT” isn't found inside “Digital”", () => {
    const resume = { ...jake, workExperienceSection: [{ ...jake.workExperienceSection[0], workRole: "IT" }] }
    const digital = { ...found, sections: [{ name: "Work" as const, entries: [{ fields: { workRole: "Digital", companyName: "Stripe", workStartDate: "Jan 2024", workEndDate: "Present" }, lines: [] }] }] }
    expect(check("R3", resume, reading([], digital)).findings.map(({ place }) => place)).toEqual([{ kind: "entry", section: "Work", entry: 0, field: "workRole" }])
  })

  test("checks awards, papers and skills too", () => {
    const resume = { ...jake, awardsSection: [{ id: 1, awardName: "Dean's List", awardDate: "2024" }] }
    const awards = { ...found, sections: [...found.sections, { name: "Awards" as const, entries: [{ fields: { awardName: "Deans", awardDate: "2024" }, lines: [] }] }] }
    expect(check("R3", resume, reading([], awards)).findings.map(({ place }) => place)).toEqual([{ kind: "entry", section: "Awards", entry: 0, field: "awardName" }])
  })

  test("flags a section where the reader finds a different number of entries", () => {
    const merged = { ...found, sections: [{ name: "Work" as const, entries: [] }] }
    expect(check("R3", jake, reading([], merged)).findings).toEqual([
      expect.objectContaining({ place: { kind: "section", section: "Work" }, message: "Hiring software reads 0 entries here, not 1" }),
    ])
  })
})

describe("R4 text the reader can't place", () => {
  test("points at the field it came from, or else its page", () => {
    const lines = [line("Built the ledger"), line("Stray words", { page: 1 })]
    const pdf = reading(lines, { ...found, unplaced: [{ heading: "", lines: [0], text: ["Built the ledger"] }, { heading: "", lines: [1], text: ["Stray words"] }] })
    expect(check("R4", jake, pdf).findings.map(({ place }) => place)).toEqual([
      { kind: "entry", section: "Work", entry: 0, field: "workDescription", line: 0 },
      { kind: "page", page: 1 },
    ])
  })

  test("points text with no letters or digits at its page", () => {
    const pdf = reading([line("— · —", { page: 1 })], { ...found, unplaced: [{ heading: "", lines: [0], text: ["— · —"] }] })
    expect(check("R4", jake, pdf).findings.map(({ place }) => place)).toEqual([{ kind: "page", page: 1 }])
  })
})

describe("R5 symbols and emoji", () => {
  test("flags emoji, arrows and stars, wherever they're typed", () => {
    const resume = { ...jake, workExperienceSection: [{ ...jake.workExperienceSection[0], workRole: "Engineer ★", workDescription: "• Shipped it 🚀\n• Cut costs → saved $2M" }] }
    expect(check("R5", resume).messages).toEqual(["“★” may not come through", "“🚀” may not come through", "“→” may not come through"])
  })

  test("takes normal punctuation, ©, ® and ™, and leaves a typed bullet to R6", () => {
    const resume = { ...jake, workExperienceSection: [{ ...jake.workExperienceSection[0], workDescription: "• Built “Atlas” — Microsoft® Office™, 2020–2024…\n• ◦ Led the team" }] }
    expect(check("R5", resume).status).toBe("passed")
  })
})

describe("R6 bullet characters typed into bullets", () => {
  test("is a fix for a bullet that starts with one", () => {
    const resume = { ...jake, workExperienceSection: [{ ...jake.workExperienceSection[0], workDescription: "• • Built it\n• - Led it\n• ◦ Ran it\n• -5% churn" }] }
    expect(check("R6", resume).findings.map(({ level, message }) => [level, message])).toEqual([
      ["fix", "Starts with “•”, so it shows two bullets"],
      ["fix", "Starts with “-”, so it shows two bullets"],
      ["fix", "Starts with “◦”, so it shows two bullets"],
    ])
  })
})
