import { expect, test } from "@playwright/test"
import { pageErrors } from "./helpers"

declare global {
  interface Window {
    /** Set on the open page by a test. A link that loads a new page loses it; one the app opens in the page keeps it. */
    marked?: boolean
  }
}

// The editor is one page, built once, that next.config.js serves at every
// resume's address, /create/new/<id>. The page reads the id from the address.

test("every resume's address gets the same page, built once", async ({ request }) => {
  // Resumes only exist in the browser, so a page rendered for each visit
  // would differ only by the id it was rendered for.
  const [first, second] = await Promise.all([request.get("/create/new/first-resume"), request.get("/create/new/second-resume")])
  expect(first.ok()).toBe(true)
  expect(second.ok()).toBe(true)
  expect(await first.text()).toBe(await second.text())
})

test("an address for a resume this browser doesn't have says so", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/create/new/not-in-this-browser")
  await expect(page.getByRole("heading", { name: "Resume not found" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Go to your resumes" })).toBeVisible()
  expect(errors).toEqual([])
})

test("resumes open in the page from links and the history, each one afresh", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/templates")
  await page.evaluate(() => (window.marked = true))

  // A template's link starts a resume with it.
  await page.getByRole("link", { name: /^Harvard template/ }).click()
  await expect(page).toHaveURL(/\/create\/new\//)
  const first = page.url()
  await expect(page.getByRole("button", { name: /^Template/ })).toContainText("Harvard")
  await page.getByLabel("Full name").fill("Ada Lovelace")

  // So does the dashboard's New resume.
  await page.getByRole("link", { name: "Your resumes" }).click()
  await page.getByRole("main").getByRole("button", { name: "New resume" }).click()
  const dialog = page.getByRole("dialog", { name: "New resume" })
  await dialog.getByLabel("Name").fill("Second")
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(page.getByLabel("Resume name")).toHaveValue("Second")
  expect(page.url()).not.toBe(first)
  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("button", { name: /^\d+ Experience$/ })
    .click()
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible()

  // Two steps back is the first resume, opened at its start rather than at
  // the section the second one was on.
  await page.evaluate(() => history.go(-2))
  await expect(page).toHaveURL(first)
  await expect(page.getByLabel("Full name")).toHaveValue("Ada Lovelace")
  await expect(page.getByRole("button", { name: /^Template/ })).toContainText("Harvard")

  // And the dashboard's link to a resume opens that one.
  await page.getByRole("link", { name: "Your resumes" }).click()
  await page.getByRole("link", { name: "Second", exact: true }).click()
  await expect(page.getByLabel("Resume name")).toHaveValue("Second")
  await expect(page.getByLabel("Full name")).toBeVisible()

  expect(await page.evaluate(() => window.marked)).toBe(true)
  // Let the preview finish, so the compiler's download isn't cut off as the page closes.
  await expect(page.getByRole("region", { name: "Live preview" }).locator(".react-pdf__Page__canvas").first()).toBeVisible()
  expect(errors).toEqual([])
})
