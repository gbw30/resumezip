import { describe, expect, test } from "vitest"
import { hasLeftOut, isLeftOutLine, printedResume } from "./leftOut"
import { asSaved } from "./testResume"

const tailored = asSaved({
  resumeTitle: "For the bank",
  profileSection: { fullName: "Ada Lovelace" },
  workExperienceSection: [
    { id: 1, workRole: "Engineer", workDescription: "• Built a loom\n○ Fed the cat\n• Wrote the notes" },
    { id: 2, workRole: "Intern", leftOut: true, workDescription: "• Made tea" },
    // Older resumes kept bullets as a list.
    { id: 3, workRole: "Analyst", workDescription: ["Checked sums", "○ Sharpened pencils"] },
  ],
  skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "English", leftOut: true }],
})

describe("what's printed", () => {
  test("is everything but the entries and bullets the person left out", () => {
    expect(printedResume(tailored)).toEqual({
      ...tailored,
      workExperienceSection: [
        { id: 1, workRole: "Engineer", workDescription: "• Built a loom\n• Wrote the notes" },
        { id: 3, workRole: "Analyst", workDescription: ["Checked sums"] },
      ],
      skillsSection: [],
    })
  })

  test("leaves the resume it's given as it was", () => {
    const before = structuredClone(tailored)
    printedResume(tailored)
    expect(tailored).toEqual(before)
  })

  test("is the whole resume when nothing is left out", () => {
    const { skillsSection, ...rest } = tailored
    const whole = { ...rest, workExperienceSection: [{ id: 1, workRole: "Engineer", workDescription: "• Built a loom" }] }
    expect(printedResume(whole)).toEqual(whole)
  })

  test("knows a left-out bullet by the ○ it starts with, and nothing else", () => {
    expect(["○ Fed the cat", "  ○ Fed the cat", "○"].map(isLeftOutLine)).toEqual([true, true, true])
    expect(["• Fed the cat", "• ○ marks the spot", "Fed the cat ○", ""].map(isLeftOutLine)).toEqual([false, false, false, false])
  })
})

describe("whether anything is left out", () => {
  test("counts a left-out entry or bullet, in a list or in text", () => {
    expect(hasLeftOut(tailored)).toBe(true)
    expect(hasLeftOut({ workExperienceSection: [{ id: 1, workDescription: "• Built a loom\n○ Fed the cat" }] })).toBe(true)
    expect(hasLeftOut(asSaved({ workExperienceSection: [{ id: 1, workDescription: ["Checked sums", "○ Sharpened pencils"] }] }))).toBe(true)
    expect(hasLeftOut({ projectsSection: [{ id: 1, leftOut: true }] })).toBe(true)
  })

  test("is nothing on a resume without any, whatever else starts with ○", () => {
    expect(hasLeftOut({})).toBe(false)
    expect(
      hasLeftOut({
        profileSection: { fullName: "○ Ada" },
        workExperienceSection: [{ id: 1, workRole: "○ Engineer", workDescription: "• Built a loom" }],
      }),
    ).toBe(false)
  })
})
