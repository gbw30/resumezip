import { expect, test } from "@playwright/test"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

const PAGES = ["/", "/templates", "/about", "/contact", "/terms", "/create/dashboard", "/does-not-exist"]

for (const path of PAGES) {
  test(`${path} loads without errors and passes accessibility checks`, async ({ page }) => {
    const errors = pageErrors(page)
    await page.goto(path)
    await page.waitForLoadState("networkidle")

    expect(await seriousAccessibilityProblems(page)).toEqual([])
    // The 404 page's own "not found" response is expected; anything else is a real error.
    expect(errors.filter((error) => !(path === "/does-not-exist" && error.includes("404")))).toEqual([])
  })
}
