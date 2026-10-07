import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

// Entries and bullets can be moved, and left out of the PDF without being
// deleted, to tailor one resume to a job.

const BULLETS = "What you did · one bullet per line"
const RESUME = {
  id: "tailored",
  resumeTitle: "Tailored",
  resumeTag: "professional",
  updatedAt: "2026-10-07T12:00:00.000Z",
  selectedTemplate: "jake",
  sectionOrder: ["Work", "Skills", "Education", "Projects", "Publications", "Volunteership", "Leadership", "Awards"],
  headings: {},
  profileSection: { fullName: "Ada Lovelace" },
  educationSection: [],
  workExperienceSection: [
    {
      id: 1,
      workRole: "Engineer",
      companyName: "Google",
      workDescription: "• Built the search index\n• Cut serving costs by 30%\n• Mentored four interns",
    },
    { id: 2, workRole: "Intern", companyName: "Initech", workDescription: "• Filed the reports" },
    { id: 3, workRole: "Analyst", companyName: "Hooli", workDescription: "" },
  ],
  projectsSection: [],
  publicationsSection: [],
  skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "Python, Rust" }],
  volunteerExperienceSection: [],
  leadershipExperienceSection: [],
  awardsSection: [],
}

const preview = (page: Page) => page.getByRole("region", { name: "Live preview" })

/** The text of the preview's pages, in the order it's printed. */
const printed = async (page: Page) => (await preview(page).locator(".react-pdf__Page__textContent").allTextContents()).join(" ")

/** Which of `names` the preview prints, in the order it prints them. */
const printedOrder = async (page: Page, names: string[]) => {
  const text = await printed(page)
  return names.filter((name) => text.includes(name)).sort((a, b) => text.indexOf(a) - text.indexOf(b))
}

/** The text of a downloaded PDF. */
async function pdfText(file: string): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), isEvalSupported: false }).promise
  try {
    const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)))
    const contents = await Promise.all(pages.map((page) => page.getTextContent()))
    return contents.flatMap((content) => content.items.map((item) => ("str" in item ? item.str : ""))).join(" ")
  } finally {
    await doc.destroy()
  }
}

/** The resume as saved in this browser. */
const saved = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), `resume:${RESUME.id}`)

// Waits for the preview, so the PDF compiler's download isn't cut off by a reload, which Safari logs as an error.
const previewShown = (page: Page) => expect(preview(page).locator(".react-pdf__Page__canvas").first()).toBeVisible()

async function openSection(page: Page, section: string) {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    },
    { key: `resume:${RESUME.id}`, value: JSON.stringify(RESUME) },
  )
  await page.goto(`/create/new/${RESUME.id}`)
  await previewShown(page)
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: new RegExp(`^\\d+ ${section}$`) }).click()
}

test("entries move up and down from the keyboard, and stay moved", async ({ page }) => {
  const errors = pageErrors(page)
  await openSection(page, "Experience")

  // The focus goes with the entry, so it can be moved again and again.
  await page.getByRole("button", { name: "Move entry 1 down" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Move entry 2 down" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Move entry 3 down" })).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: "Moved to 3 of 3" })).toBeAttached()

  // At the bottom, it stays where it is.
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Move entry 3 down" })).toHaveAttribute("aria-disabled", "true")
  await expect.poll(() => printedOrder(page, ["Google", "Initech", "Hooli"])).toEqual(["Initech", "Hooli", "Google"])
  expect(await seriousAccessibilityProblems(page, [".react-pdf__Page"])).toEqual([])

  // It's saved, so it's still moved after a reload.
  await expect.poll(async () => (await saved(page)).workExperienceSection.map((entry: { companyName: string }) => entry.companyName)).toEqual([
    "Initech",
    "Hooli",
    "Google",
  ])
  await page.reload()
  await previewShown(page)
  await expect.poll(() => printedOrder(page, ["Google", "Initech", "Hooli"])).toEqual(["Initech", "Hooli", "Google"])

  expect(errors).toEqual([])
})

test("an entry left out isn't printed, or in the PDF's copy of the resume, and comes back when it's put back", async ({ page, browser }, testInfo) => {
  const errors = pageErrors(page)
  await openSection(page, "Experience")

  await page.getByRole("checkbox", { name: "Include entry 2 in the PDF" }).uncheck()
  await expect(page.getByText("Entry 2 · Left out")).toBeVisible()
  await expect.poll(() => printedOrder(page, ["Google", "Initech", "Hooli"])).toEqual(["Google", "Hooli"])

  // Whoever gets the PDF can't read it: opened again, the PDF brings back only what was printed.
  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download PDF" }).click()
  const pdf = testInfo.outputPath("tailored.pdf")
  await (await downloading).saveAs(pdf)
  const text = await pdfText(pdf)
  expect(text).toContain("Google")
  expect(text).not.toContain("Initech")
  const elsewhere = await browser.newContext()
  const other = await elsewhere.newPage()
  const otherErrors = pageErrors(other)
  await other.goto("/create/dashboard")
  await other.locator('input[type="file"]').setInputFiles(pdf)
  await expect(other).toHaveURL(/\/create\/new\/tailored$/)
  await previewShown(other)
  const restored = await other.evaluate(() => JSON.parse(localStorage.getItem("resume:tailored") ?? "{}"))
  expect(restored.workExperienceSection.map((entry: { companyName: string }) => entry.companyName)).toEqual(["Google", "Hooli"])
  expect(JSON.stringify(restored)).not.toContain("Initech")
  await elsewhere.close()

  // Here it's kept, left out, through a reload, and put back with a tick.
  await page.reload()
  await previewShown(page)
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }).click()
  const include = page.getByRole("checkbox", { name: "Include entry 2 in the PDF" })
  await expect(include).not.toBeChecked()
  await include.check()
  await expect.poll(() => printedOrder(page, ["Google", "Initech", "Hooli"])).toEqual(["Google", "Initech", "Hooli"])

  expect(errors).toEqual([])
  expect(otherErrors).toEqual([])
})

test("bullets are moved and left out from the Arrange list, or moved with Alt and the arrow keys", async ({ page }) => {
  const errors = pageErrors(page)
  await openSection(page, "Experience")
  // The first entry is open; its bullets are in its first bullets field.
  const field = page.locator('[data-field="workDescription"]').first()

  await field.getByRole("button", { name: "Arrange bullets" }).click()
  const list = field.getByRole("list", { name: BULLETS })
  await expect(list.getByRole("listitem")).toHaveText([/Built the search index/, /Cut serving costs/, /Mentored four interns/])
  await list.getByRole("button", { name: "Move bullet 1 down" }).click()
  await expect(list.getByRole("button", { name: "Move bullet 2 down" })).toBeFocused()
  await expect(list.getByRole("listitem")).toHaveText([/Cut serving costs/, /Built the search index/, /Mentored four interns/])

  await list.getByRole("checkbox", { name: "Include bullet 3 in the PDF" }).uncheck()
  await expect(list.getByRole("listitem").nth(2)).toContainText("Left out")
  await expect.poll(() => printed(page)).not.toContain("Mentored four interns")
  expect(await seriousAccessibilityProblems(page, [".react-pdf__Page"])).toEqual([])

  // Back in the text box, the left-out bullet starts with ○, and Alt+↓ moves the line the cursor is on.
  await field.getByRole("button", { name: "Done arranging bullets" }).click()
  const box = field.getByLabel(BULLETS)
  await expect(box).toHaveValue("• Cut serving costs by 30%\n• Built the search index\n○ Mentored four interns")
  await box.focus()
  await box.evaluate((textarea: HTMLTextAreaElement) => textarea.setSelectionRange(0, 0))
  await page.keyboard.press("Alt+ArrowDown")
  await expect(box).toHaveValue("• Built the search index\n• Cut serving costs by 30%\n○ Mentored four interns")
  await expect.poll(async () => (await saved(page)).workExperienceSection[0].workDescription).toBe(
    "• Built the search index\n• Cut serving costs by 30%\n○ Mentored four interns",
  )

  expect(errors).toEqual([])
})

test("a section with every entry left out isn't printed, title and all", async ({ page }) => {
  const errors = pageErrors(page)
  await openSection(page, "Skills")
  await expect.poll(() => printed(page)).toContain("Python, Rust")

  await page.getByRole("checkbox", { name: "Include entry 1 in the PDF" }).uncheck()
  await expect.poll(async () => /skills|python/i.test(await printed(page))).toBe(false)

  expect(errors).toEqual([])
})
