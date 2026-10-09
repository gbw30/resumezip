import { expect, test } from "@playwright/test"
import { pageErrors } from "./helpers"

// The footer's zipper is the logo's key: its --zip runs from 0 (open) to 1
// (shut), and takes about a second to get from one to the other.

test("the footer's zipper waits open, zips shut when it's reached, and opens again when it's left", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/contact")
  const footer = page.getByRole("contentinfo")

  await expect(footer).toHaveCSS("--zip", "0")
  await page.keyboard.press("End")
  await expect(footer).toHaveCSS("--zip", "1")
  await page.keyboard.press("Home")
  await expect(footer).toHaveCSS("--zip", "0")

  // It's all links and a wordmark to a screen reader: the zipper is only a picture.
  await expect(footer.getByRole("link", { name: "resumezip" })).toHaveAttribute("href", "/")
  await expect(footer.getByRole("navigation", { name: "Footer" }).getByRole("link")).toHaveText(["About", "Terms & privacy", "Contact"])
  expect(errors).toEqual([])
})

// What the zipper has to show before it shuts is a share of itself, not a margin
// from the window's edge. A margin as tall as a share of a tall window is taller
// than what the page leaves under the zipper, so it never shut there.
test.describe("in a tall window", () => {
  test.use({ viewport: { width: 1280, height: 1300 } })

  test("the footer's zipper still shuts at the end of the page", async ({ page }) => {
    await page.goto("/contact")
    const footer = page.getByRole("contentinfo")
    await expect(footer).toHaveCSS("--zip", "0")
    await page.keyboard.press("End")
    await expect(footer).toHaveCSS("--zip", "1")
  })
})

test.describe("with less motion", () => {
  test.use({ reducedMotion: "reduce" })

  test("the footer's zipper stays shut", async ({ page }) => {
    await page.goto("/contact")
    const footer = page.getByRole("contentinfo")
    await page.keyboard.press("End")
    await page.keyboard.press("Home")
    // Longer than it takes to move, to be sure it doesn't.
    await page.waitForTimeout(1500)
    await expect(footer).toHaveCSS("--zip", "1")
  })
})
