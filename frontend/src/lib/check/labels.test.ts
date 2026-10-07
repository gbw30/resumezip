import { describe, expect, test } from "vitest"
import { describePlace, hasEnoughToCheck } from "./labels"
import { viewOf } from "./resume"

const ada = {
  profileSection: { fullName: "Ada Lovelace", email: "ada@example.com" },
  headings: { edu: "Schooling" },
  workExperienceSection: [
    { id: 1, workRole: "Engineer", companyName: "Analytical Engines", workDescription: "• Built a loom\n\n• Wrote the notes" },
    { id: 2 },
  ],
  educationSection: [{ id: 1, schoolName: "University of London" }],
}

describe("whether there's enough to check", () => {
  test("needs a name and an entry with something in it", () => {
    expect(hasEnoughToCheck(viewOf(ada))).toBe(true)
    expect(hasEnoughToCheck(viewOf({ ...ada, profileSection: { fullName: "  " } }))).toBe(false)
    expect(hasEnoughToCheck(viewOf({ profileSection: { fullName: "Ada" }, workExperienceSection: [{ id: 1, workRole: "" }] }))).toBe(false)
    expect(hasEnoughToCheck(viewOf({}))).toBe(false)
  })
})

describe("where a finding is", () => {
  const view = viewOf(ada)

  test("names the profile field, section, or section title", () => {
    expect(describePlace(view, { kind: "profile", field: "email" })).toBe("Profile → Email")
    expect(describePlace(view, { kind: "section", section: "Skills" })).toBe("Skills")
    // A renamed section goes by its own title.
    expect(describePlace(view, { kind: "section", section: "Education" })).toBe("Schooling")
    expect(describePlace(view, { kind: "heading", section: "Education" })).toBe("Schooling → Section title")
  })

  test("names an entry by its company, school or project, with the field or bullet", () => {
    expect(describePlace(view, { kind: "entry", section: "Work", entry: 0 })).toBe("Experience → Analytical Engines")
    expect(describePlace(view, { kind: "entry", section: "Work", entry: 0, field: "workRole" })).toBe(
      "Experience → Analytical Engines · Role",
    )
    // Bullets count from 1, skipping blank lines.
    expect(describePlace(view, { kind: "entry", section: "Work", entry: 0, field: "workDescription", line: 2 })).toBe(
      "Experience → Analytical Engines · bullet 2",
    )
    expect(describePlace(view, { kind: "entry", section: "Education", entry: 0 })).toBe("Schooling → University of London")
  })

  test("falls back to the entry as the editor shows it collapsed, then to its number", () => {
    const noCompany = viewOf({ workExperienceSection: [{ id: 1, workRole: "Engineer" }, { id: 2 }] })
    expect(describePlace(noCompany, { kind: "entry", section: "Work", entry: 0 })).toBe("Experience → Engineer")
    expect(describePlace(noCompany, { kind: "entry", section: "Work", entry: 1 })).toBe("Experience → Entry 2")
  })

  test("names the PDF or one of its pages", () => {
    expect(describePlace(view, { kind: "page" })).toBe("The PDF")
    expect(describePlace(view, { kind: "page", page: 2 })).toBe("Page 2")
  })
})
