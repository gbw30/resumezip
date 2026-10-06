import { readFileSync } from "node:fs"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

declare global {
  interface Window {
    /** Set by a test to make saving fail as if storage were full. */
    storageFull?: boolean
    /** The keys saved to localStorage, noted by a test. */
    saves?: string[]
  }
}

/** What the editor and dashboard show while the latest changes aren't saved. */
const notSaved = (page: Page) => page.getByRole("alert").filter({ hasText: "Not saved" })

/** Starts a new resume, and returns the localStorage key it's saved under. */
async function startWriting(page: Page) {
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
  return `resume:${new URL(page.url()).pathname.split("/").pop()}`
}

/**
 * The preview showing some text. Tests wait for this before leaving the
 * editor: Safari reports leaving while the editor still downloads its PDF
 * compiler as an error.
 */
const previewShows = (preview: Locator, text: RegExp) => preview.getByText(text).first()

/** The text saved under a localStorage key, as one page sees it. */
const savedAt = (page: Page, key: string) => () => page.evaluate((key) => localStorage.getItem(key) ?? "", key)

/** The saved data a page has kept aside because it couldn't be read. */
const keptAside = (page: Page) => () =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("allResumes-unreadable-"))
      .map((key) => localStorage.getItem(key)),
  )

test("when the browser won't let the site save anything, it still works and says so", async ({ page }) => {
  const errors = pageErrors(page)
  // As in Chrome set to "Don't allow sites to save data on your device".
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Access is denied for this document.", "SecurityError")
      },
    })
  })
  await startWriting(page)
  await expect(notSaved(page)).toContainText("isn't letting resumezip save anything")

  // Editing and downloading still work, so a PDF can keep a copy.
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await expect(page.getByRole("region", { name: "Live preview" }).getByText(/Ada Lovelace/i).first()).toBeVisible()
  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download PDF" }).click()
  expect((await downloading).suggestedFilename()).toMatch(/\.pdf$/)
  // The preview is left out. With the warning above it, the page no longer
  // fits, and its scroll area can't be reached by keyboard unless the resume
  // has a link in it. That's a problem of its own, not this test's.
  expect(await seriousAccessibilityProblems(page, ['[aria-label="Live preview"]'])).toEqual([])

  // The dashboard says so too, and has the resume until the page is closed.
  await page.getByRole("link", { name: "Your resumes" }).click()
  await expect(notSaved(page)).toContainText("isn't letting resumezip save anything")
  await expect(page.getByText(/^1 resume\W+not saved$/i)).toBeVisible()

  expect(errors).toEqual([])
})

test("when storage is full, the editor says the changes aren't saved until they are", async ({ page }) => {
  const errors = pageErrors(page)
  // Saving throws as it does when storage is out of room, while window.storageFull is set.
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (window.storageFull) throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
      setItem.call(this, key, value)
    }
  })
  await startWriting(page)
  const name = page.getByLabel("Full name")
  const saved = page.getByText("Saved in this browser")

  await name.fill("Ada")
  await expect(saved).toHaveCount(1)
  await expect(notSaved(page)).toHaveCount(0)

  await page.evaluate(() => (window.storageFull = true))
  await name.fill("Ada Lovelace")
  await expect(notSaved(page)).toContainText("storage for resumezip is full")
  await expect(saved).toHaveCount(0)
  await expect(name).toHaveValue("Ada Lovelace")

  // Once there's room, the next change is saved and the warning goes.
  await page.evaluate(() => (window.storageFull = false))
  await name.fill("Ada King")
  await expect(notSaved(page)).toHaveCount(0)
  await expect(saved).toHaveCount(1)
  await expect(previewShows(page.getByRole("region", { name: "Live preview" }), /Ada King/i)).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Full name")).toHaveValue("Ada King")

  expect(errors).toEqual([])
})

test("saved data that can't be read is kept instead of being saved over", async ({ page }) => {
  const errors = pageErrors(page)
  const unreadable = '{"a": {"resumeTitle": "Ada'
  // Saved before the first page loads, once.
  await page.addInitScript((text) => {
    if (sessionStorage.getItem("seeded")) return
    sessionStorage.setItem("seeded", "yes")
    localStorage.setItem("allResumes", text)
  }, unreadable)
  await page.goto("/create/dashboard")
  const kept = keptAside(page)

  const note = page.getByText("couldn't be read, so resumezip kept a copy")
  await expect(note).toBeVisible()
  expect(await kept()).toEqual([unreadable])
  expect(await seriousAccessibilityProblems(page)).toEqual([])

  // It's still there after a reload, and downloads exactly as it was saved.
  await page.reload()
  await expect(note).toBeVisible()
  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download the copy" }).click()
  expect(readFileSync(await (await downloading).path(), "utf8")).toBe(unreadable)

  // Deleting it removes it from the browser.
  await page.getByRole("button", { name: "Delete it" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click()
  await expect(note).toHaveCount(0)
  expect(await kept()).toEqual([])

  expect(errors).toEqual([])
})

test("when another tab saves something unreadable, the open resume stays and is saved again", async ({ page, context }) => {
  const errors = pageErrors(page)
  const key = await startWriting(page)
  await page.getByLabel("Full name").fill("Ada Lovelace")
  const saved = savedAt(page, key)
  await expect.poll(saved).toContain("Ada Lovelace")

  // Another tab (a page in the same browser) saves something unreadable over
  // it, once it has read the resumes itself.
  const other = await context.newPage()
  await other.goto("/create/dashboard")
  await expect(other.getByText(/^1 resume\W+stored in this browser$/i)).toBeVisible()
  await other.evaluate((key) => localStorage.setItem(key, "not json"), key)

  // The editor keeps what was unreadable aside, keeps its resume, and saves it back.
  await expect.poll(keptAside(page)).toEqual(["not json"])
  await expect.poll(saved).toContain("Ada Lovelace")
  await expect(page.getByLabel("Full name")).toHaveValue("Ada Lovelace")

  expect(errors).toEqual([])
})

test("typing is saved once it pauses, and just opening a page saves nothing", async ({ page }) => {
  const errors = pageErrors(page)
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    window.saves = []
    Storage.prototype.setItem = function (key: string, value: string) {
      window.saves?.push(key)
      setItem.call(this, key, value)
    }
  })
  const key = await startWriting(page)
  const editor = new URL(page.url()).pathname
  const preview = page.getByRole("region", { name: "Live preview" })
  const saves = () => page.evaluate(() => window.saves ?? [])
  await page.evaluate(() => (window.saves = []))

  // Twelve keystrokes are saved once, or a few times if the machine stalls mid-word.
  await page.getByLabel("Full name").pressSequentially("Ada Lovelace", { delay: 25 })
  await expect.poll(saves).not.toEqual([])
  const made = await saves()
  expect(made.every((saved) => saved === key)).toBe(true)
  expect(made.length).toBeLessThanOrEqual(3)
  await expect(previewShows(preview, /Ada Lovelace/i)).toBeVisible()

  // Opening the dashboard, or the editor again, saves nothing.
  await page.goto("/create/dashboard")
  await expect(page.getByText(/^1 resume\W+stored in this browser$/i)).toBeVisible()
  await page.waitForTimeout(1_000)
  expect(await saves()).toEqual([])
  await page.goto(editor)
  await expect(previewShows(preview, /Ada Lovelace/i)).toBeVisible()
  await page.waitForTimeout(1_000)
  expect(await saves()).toEqual([])

  expect(errors).toEqual([])
})

test("a change made just before the page closes is saved", async ({ page }) => {
  const errors = pageErrors(page)
  await page.clock.install()
  const key = await startWriting(page)
  const name = page.getByLabel("Full name")
  await name.fill("Ada")
  await expect(previewShows(page.getByRole("region", { name: "Live preview" }), /Ada/i)).toBeVisible()

  // With the page's clock stopped, typing never pauses long enough to be
  // saved, so only the save as the page closes can save it.
  await page.clock.pauseAt(Date.now() + 1_000)
  await name.fill("Ada Lovelace")
  expect(await savedAt(page, key)()).not.toContain("Ada Lovelace")
  await page.reload()
  await page.clock.resume()
  await expect(page.getByLabel("Full name")).toHaveValue("Ada Lovelace")

  expect(errors).toEqual([])
})

test("two tabs editing different resumes at once keep both edits", async ({ page, context }) => {
  const errors = pageErrors(page)
  await startWriting(page)
  const other = await context.newPage()
  const otherErrors = pageErrors(other)
  await other.goto("/create/dashboard")
  await other.getByRole("button", { name: "New resume" }).click()
  await other.getByLabel("Name", { exact: true }).fill("Second resume")
  await other.getByRole("button", { name: "Create" }).click()
  await expect(other).toHaveURL(/\/create\/new\//)

  await Promise.all([
    page.getByLabel("Full name").pressSequentially("Ada Lovelace", { delay: 20 }),
    other.getByLabel("Full name").pressSequentially("Grace Hopper", { delay: 20 }),
  ])

  // A page opened afterwards finds both.
  const third = await context.newPage()
  await third.goto("/create/dashboard")
  const names = () =>
    third.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("resume:"))
        .map((key) => JSON.parse(localStorage.getItem(key) ?? "{}").profileSection?.fullName)
        .sort(),
    )
  await expect.poll(names).toEqual(["Ada Lovelace", "Grace Hopper"])

  expect(errors).toEqual([])
  expect(otherErrors).toEqual([])
})
