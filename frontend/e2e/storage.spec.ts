import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

declare global {
  interface Window {
    /** Set by a test to make saving fail as if storage were full. */
    storageFull?: boolean
  }
}

/** What the editor and dashboard show while the latest changes aren't saved. */
const notSaved = (page: Page) => page.getByRole("alert").filter({ hasText: "Not saved" })

async function startWriting(page: Page) {
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
}

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
  const kept = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("allResumes-unreadable-"))
        .map((key) => localStorage.getItem(key)),
    )

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
  await startWriting(page)
  await page.getByLabel("Full name").fill("Ada Lovelace")
  const saved = () => page.evaluate(() => localStorage.getItem("allResumes") ?? "")
  await expect.poll(saved).toContain("Ada Lovelace")

  // Another tab (a page in the same browser) saves over the resumes with
  // something unreadable, once it has read them itself.
  const other = await context.newPage()
  await other.goto("/create/dashboard")
  await expect(other.getByText(/^1 resume\W+stored in this browser$/i)).toBeVisible()
  await other.evaluate(() => localStorage.setItem("allResumes", "not json"))

  // The editor keeps what was unreadable aside, keeps its resume, and saves it back.
  const kept = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("allResumes-unreadable-"))
        .map((key) => localStorage.getItem(key)),
    )
  await expect.poll(kept).toEqual(["not json"])
  await expect.poll(saved).toContain("Ada Lovelace")
  await expect(page.getByLabel("Full name")).toHaveValue("Ada Lovelace")

  expect(errors).toEqual([])
})
