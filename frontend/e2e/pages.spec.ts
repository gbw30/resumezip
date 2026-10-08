import { expect, test } from "@playwright/test"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

const PAGES = ["/", "/templates", "/about", "/contact", "/terms", "/create/dashboard", "/does-not-exist"]

for (const path of PAGES) {
  test(`${path} loads without errors and passes accessibility checks`, async ({ page }) => {
    const errors = pageErrors(page)
    await page.goto(path)
    // The home page's looping video can keep streaming in Safari. Readiness
    // for this layout/accessibility check is visible content with fonts loaded.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    expect(await seriousAccessibilityProblems(page)).toEqual([])
    // The 404 page's own "not found" response is expected, and browsers log it.
    // Only that exact message for this page is let through.
    const ownNotFound = (error: string) =>
      path === "/does-not-exist" &&
      /^Failed to load resource: the server responded with a status of 404 \(Not Found\) \(at http:\/\/[^/]+\/does-not-exist\)$/.test(error)
    expect(errors.filter((error) => !ownNotFound(error))).toEqual([])
  })
}
