import { expect, test, type Locator, type Page } from "@playwright/test"
import { pageErrors } from "./helpers"

// The bullets box makes some edits itself: Enter starts a new bullet, ⌘B and
// ⌘I add or take away marks, Alt+↑ and Alt+↓ move a line, and words typed on
// a line with no bullet get one. Each is undone and redone as typing is.

const LABEL = "What you did · one bullet per line"
const BULLETS = "• Built the search index\n• Cut serving costs by 30%"
const RESUME = {
  id: "undo",
  resumeTitle: "Undo",
  resumeTag: "professional",
  updatedAt: "2026-10-08T12:00:00.000Z",
  selectedTemplate: "jake",
  sectionOrder: ["Work", "Skills", "Education", "Projects", "Publications", "Volunteership", "Leadership", "Awards"],
  headings: {},
  profileSection: { fullName: "Ada Lovelace" },
  educationSection: [],
  workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Google", workDescription: BULLETS }],
  projectsSection: [],
  publicationsSection: [],
  skillsSection: [],
  volunteerExperienceSection: [],
  leadershipExperienceSection: [],
  awardsSection: [],
}

const undo = (page: Page) => page.keyboard.press("ControlOrMeta+z")
const redo = (page: Page) => page.keyboard.press("ControlOrMeta+Shift+z")

/** Selects from `start` to `end` in the box, or puts the cursor at `start`. */
const select = (box: Locator, start: number, end = start) =>
  box.evaluate((textarea: HTMLTextAreaElement, [start, end]) => textarea.setSelectionRange(start, end), [start, end])

/** The bullets as saved in this browser. */
const saved = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").workExperienceSection?.[0]?.workDescription, `resume:${RESUME.id}`)

test("each of the bullets box's own edits is undone and redone, as typing is", async ({ page }) => {
  const errors = pageErrors(page)
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    },
    { key: `resume:${RESUME.id}`, value: JSON.stringify(RESUME) },
  )
  await page.goto(`/create/new/${RESUME.id}`)
  // The preview first, so the PDF compiler's download isn't cut off, which Safari logs as an error.
  await expect(page.getByRole("region", { name: "Live preview" }).locator(".react-pdf__Page__canvas").first()).toBeVisible()
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }).click()
  const box = page.getByLabel(LABEL)
  await box.focus()

  // Enter starts a new bullet. Undone, the bullet is whole again; redone, split again.
  const split = "• Built the search\n• index\n• Cut serving costs by 30%"
  await select(box, "• Built the search".length)
  await page.keyboard.press("Enter")
  await expect(box).toHaveValue(split)
  await undo(page)
  await expect(box).toHaveValue(BULLETS)
  await redo(page)
  await expect(box).toHaveValue(split)
  await undo(page)
  await expect(box).toHaveValue(BULLETS)

  // Bold and italic.
  const search = ["• Built the ".length, "• Built the search".length] as const
  await select(box, ...search)
  await page.keyboard.press("ControlOrMeta+b")
  await expect(box).toHaveValue("• Built the **search** index\n• Cut serving costs by 30%")
  await undo(page)
  await expect(box).toHaveValue(BULLETS)
  await select(box, ...search)
  await page.keyboard.press("ControlOrMeta+i")
  await expect(box).toHaveValue("• Built the *search* index\n• Cut serving costs by 30%")
  await undo(page)
  await expect(box).toHaveValue(BULLETS)

  // Moving a line.
  const moved = "• Cut serving costs by 30%\n• Built the search index"
  await select(box, 0)
  await page.keyboard.press("Alt+ArrowDown")
  await expect(box).toHaveValue(moved)
  await undo(page)
  await expect(box).toHaveValue(BULLETS)
  await redo(page)
  await expect(box).toHaveValue(moved)
  await undo(page)
  await expect(box).toHaveValue(BULLETS)

  // Typing, as in any text box.
  await select(box, BULLETS.length)
  await page.keyboard.type("!")
  await expect(box).toHaveValue(`${BULLETS}!`)
  await undo(page)
  await expect(box).toHaveValue(BULLETS)

  // Words typed on a line with no bullet get one, in the same edit.
  await select(box, 0, BULLETS.length)
  await page.keyboard.type("L")
  await expect(box).toHaveValue("• L")
  await expect.poll(() => saved(page)).toBe("• L")
  // Undone, and saved that way, so the preview and the PDF follow.
  await undo(page)
  await expect(box).toHaveValue(BULLETS)
  await expect.poll(() => saved(page)).toBe(BULLETS)

  expect(errors).toEqual([])
})
