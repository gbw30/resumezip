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

test("when a busy page has several looks queued, the zipper goes by the last", async ({ page }) => {
  // Looks can't be made to pile up on cue, so the test wraps the zipper's observer to hand it a batch, oldest first.
  await page.addInitScript(() => {
    const Real = window.IntersectionObserver
    window.IntersectionObserver = class extends Real {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options)
        const observe = this.observe.bind(this)
        this.observe = (target) => {
          // Next observes its links too (to prefetch them): only the zipper, the footer's one aria-hidden element, hears the batches.
          if (target.closest("footer") && target.getAttribute("aria-hidden") === "true") {
            window.addEventListener("looks", (event) => {
              const ratios = (event as CustomEvent<number[]>).detail
              callback.call(
                this,
                ratios.map((intersectionRatio) => ({ intersectionRatio }) as IntersectionObserverEntry),
                this,
              )
            })
          }
          observe(target)
        }
      }
    }
  })
  await page.goto("/contact")
  const footer = page.getByRole("contentinfo")
  await expect(footer).toHaveCSS("--zip", "0")

  const queue = (...detail: number[]) => page.evaluate((detail) => window.dispatchEvent(new CustomEvent("looks", { detail })), detail)
  // Out of view and then in: shut. In and then out: open. Going by the oldest look would do the reverse.
  await queue(0, 1)
  await expect(footer).toHaveCSS("--zip", "1")
  await queue(1, 0)
  await expect(footer).toHaveCSS("--zip", "0")
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
