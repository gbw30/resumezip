import { expect, test, type Page } from "@playwright/test"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

// The editor's left bar switches between the sections (Write) and what the
// checker found (Check), and remembers which in this browser.

async function newResume(page: Page) {
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
}

test("the left bar switches between writing and checking, and remembers which", async ({ page }) => {
  const errors = pageErrors(page)
  await newResume(page)
  const modes = page.getByRole("tablist", { name: "Write or check" })
  const write = modes.getByRole("tab", { name: "Write" })
  const check = modes.getByRole("tab", { name: /^Check/ })
  const sections = page.getByRole("navigation", { name: "Sections" })

  // It opens on Write, with the section list as it's always been.
  await expect(write).toHaveAttribute("aria-selected", "true")
  await sections.getByRole("button", { name: /^\d+ Experience$/ }).click()
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible()

  // Check puts the checker where the section list was, and leaves the form as it was.
  await check.click()
  await expect(check).toHaveAttribute("aria-selected", "true")
  await expect(sections).toBeHidden()
  await expect(page.getByRole("tabpanel", { name: /^Check/ })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible()
  expect(await seriousAccessibilityProblems(page, [".react-pdf__Page"])).toEqual([])

  // Arrow keys, Home and End move between the two, as in any set of tabs.
  await check.focus()
  for (const [key, tab] of [
    ["ArrowLeft", write],
    ["End", check],
    ["Home", write],
    ["ArrowRight", check],
  ] as const) {
    await page.keyboard.press(key)
    await expect(tab).toBeFocused()
    await expect(tab).toHaveAttribute("aria-selected", "true")
  }

  // The mode stays after a reload, until it's switched back. Each reload
  // waits for the preview, so the PDF compiler's download isn't cut off,
  // which Safari logs as an error.
  const preview = page.getByRole("region", { name: "Live preview" }).locator(".react-pdf__Page__canvas").first()
  await expect(preview).toBeVisible()
  await page.reload()
  await expect(check).toHaveAttribute("aria-selected", "true")
  await write.click()
  await expect(preview).toBeVisible()
  await page.reload()
  await expect(write).toHaveAttribute("aria-selected", "true")
  await expect(sections).toBeVisible()

  expect(errors).toEqual([])
})

test("the checker asks for a name and an entry first, then lists what passed", async ({ page }) => {
  const errors = pageErrors(page)
  await newResume(page)
  const write = page.getByRole("tab", { name: "Write" })
  const check = page.getByRole("tab", { name: /^Check/ })
  const panel = page.getByRole("tabpanel", { name: /^Check/ })

  await check.click()
  const waiting = panel.getByText("Add your name and one entry to check this resume.")
  await expect(waiting).toBeVisible()

  // The form stays beside the checker, so the name can be typed straight in.
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await write.click()
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }).click()
  await page.getByRole("button", { name: "Add experience" }).click()
  await page.getByLabel("Company").fill("Analytical Engines")
  await check.click()
  await expect(waiting).toBeHidden()

  // What the templates guarantee is listed with the passed checks, folded.
  const guaranteed = panel.getByText("Real text that can be selected and copied")
  await expect(guaranteed).toBeHidden()
  await panel.getByText(/^\d+ passed$/).click()
  await expect(guaranteed).toBeVisible()
  expect(await seriousAccessibilityProblems(page, [".react-pdf__Page"])).toEqual([])

  expect(errors).toEqual([])
})

test("choosing a finding opens its field, fixing it clears it, and a suggestion can be dismissed", async ({ page }) => {
  const errors = pageErrors(page)
  await newResume(page)
  const check = page.getByRole("tablist", { name: "Write or check" }).getByRole("tab", { name: /^Check/ })
  const panel = page.getByRole("tabpanel", { name: /^Check/ })

  // No count until there's a name and an entry to check.
  await expect(check).toHaveAccessibleName("Check")
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByLabel("Email").fill("ada@example")
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }).click()
  await page.getByRole("button", { name: "Add experience" }).click()
  await page.getByLabel("Company").fill("Analytical Engines")
  await expect(check).toHaveAccessibleName(/^Check, \d+ to look at$/)

  // The email's finding opens the profile, with the cursor in the field and why it matters under it.
  await check.click()
  const email = panel.getByRole("button", { name: /Not a whole email address/ })
  await email.click()
  const field = page.getByLabel("Email")
  await expect(field).toBeFocused()
  await expect(field).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByText("Recruiters reply by email, so it has to work.")).toBeVisible()
  await field.fill("ada@example.com")
  await expect(email).toBeHidden()
  await expect(field).not.toHaveAttribute("aria-invalid")

  // A suggestion can be dismissed, and brought back.
  const role = panel.getByRole("button", { name: /^Experience → .* No role$/ })
  await expect(role).toBeVisible()
  await panel.getByRole("button", { name: "Dismiss: No role" }).click()
  await expect(role).toBeHidden()
  await panel.getByText("Dismissed · 1").click()
  await panel.getByRole("button", { name: "Bring back: No role" }).click()
  await expect(role).toBeVisible()

  expect(await seriousAccessibilityProblems(page, [".react-pdf__Page"])).toEqual([])
  expect(errors).toEqual([])
})

test("with Check open, the PDF is read too: a bullet that runs three lines is flagged and opens", async ({ page }) => {
  const errors = pageErrors(page)
  await newResume(page)
  const check = page.getByRole("tablist", { name: "Write or check" }).getByRole("tab", { name: /^Check/ })
  const panel = page.getByRole("tabpanel", { name: /^Check/ })

  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }).click()
  await page.getByRole("button", { name: "Add experience" }).click()
  await page.getByLabel("Company").fill("Analytical Engines")
  const bullets = page.getByLabel(/^What you did/)
  await bullets.fill(
    "Wrote the first published algorithm for the Analytical Engine, a method for computing Bernoulli numbers that ran to " +
      "twenty-five steps, and explained in seven long notes how the engine could act on symbols as well as numbers, " +
      "which later readers took as the first description of a general-purpose computer and of programming itself",
  )

  // The layout rules read the preview once Check is open, and point at the bullet.
  await check.click()
  const long = panel.getByRole("button", { name: /^Experience → .* Runs \d+ lines$/ })
  await expect(long).toBeVisible()
  await expect(panel.getByText("Checking the PDF…")).toBeHidden()
  await long.click()
  await expect(bullets).toBeFocused()

  expect(errors).toEqual([])
})

test("when the preview can't be built, the checker says its PDF checks are left out", async ({ page }) => {
  const errors = pageErrors(page)
  // The compiler's worker fails each resume it's given, as in download.spec.ts.
  await page.addInitScript(() => {
    const RealWorker = window.Worker
    window.Worker = class extends RealWorker {
      postMessage(message: any, options?: any) {
        if (message?.template === undefined) return super.postMessage(message, options)
        setTimeout(() => this.onerror?.call(this, new ErrorEvent("error", { message: "Typst crashed" })))
      }
    }
  })
  await newResume(page)
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }).click()
  await page.getByRole("button", { name: "Add experience" }).click()
  await page.getByLabel("Company").fill("Analytical Engines")

  await page.getByRole("tablist", { name: "Write or check" }).getByRole("tab", { name: /^Check/ }).click()
  const panel = page.getByRole("tabpanel", { name: /^Check/ })
  await expect(panel.getByRole("status")).toContainText("The preview couldn't be built, so the checks on the PDF are left out.")
  expect(errors).toEqual([])
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test("the switch sits above the section tabs, and works with the Edit and Preview switch", async ({ page }) => {
    const errors = pageErrors(page)
    await newResume(page)
    const modes = page.getByRole("tablist", { name: "Write or check" })
    const check = modes.getByRole("tab", { name: /^Check/ })
    const sections = page.getByRole("navigation", { name: "Sections" })

    const switchBox = await modes.boundingBox()
    const tabsBox = await sections.boundingBox()
    expect(switchBox!.y + switchBox!.height).toBeLessThanOrEqual(tabsBox!.y + 1)

    await check.tap()
    await expect(check).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tabpanel", { name: /^Check/ })).toBeVisible()
    await expect(sections).toBeHidden()

    // Preview hides the left bar, and Edit brings it back as it was.
    await page.getByRole("button", { name: "Preview", exact: true }).tap()
    await expect(page.getByRole("region", { name: "Live preview" })).toBeVisible()
    await expect(modes).toBeHidden()
    await page.getByRole("button", { name: "Edit", exact: true }).tap()
    await expect(check).toHaveAttribute("aria-selected", "true")

    expect(await seriousAccessibilityProblems(page, [".react-pdf__Page"])).toEqual([])
    expect(errors).toEqual([])
  })

  test("tapping Check far down the form goes back up to what was found", async ({ page }) => {
    const errors = pageErrors(page)
    await newResume(page)
    const check = page.getByRole("tablist", { name: "Write or check" }).getByRole("tab", { name: /^Check/ })

    // The switch stays pinned while the form scrolls under it.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
    await expect(check).toBeInViewport()

    await check.tap()
    await expect(page.getByRole("tabpanel", { name: /^Check/ })).toBeInViewport()
    await expect(check).toBeInViewport()
    expect(errors).toEqual([])
  })
})
