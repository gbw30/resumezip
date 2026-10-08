import { expect, test } from "@playwright/test"
import { pageErrors } from "./helpers"

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
