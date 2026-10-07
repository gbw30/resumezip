import { expect, test, type Page } from "@playwright/test"
import { WIDE_SCREEN } from "../src/components/editor/layout"
import { pageErrors } from "./helpers"

// The editor puts the form beside the preview only where both have room
// (components/editor/layout.ts). Narrower, an Edit / Preview switch shows one
// at a time, and the form's fields fit the form's own width.

const ENTRY = {
  Role: "Software Engineer",
  Company: "Example Company",
  Location: "Mountain View, CA",
  Start: "Jan 2024",
  End: "Present",
}
const BULLETS = "What you did · one bullet per line"
const LONG_BULLETS = [
  "Built a service that cut page load time by 30% for twelve million monthly visitors across four regions",
  "Led the migration of the billing system from a monolith to event-driven services with zero downtime",
  "Mentored three new engineers and wrote the onboarding guide the team still uses today",
].join("\n")

/** Starts a resume in a `width` × `height` window, with one Experience entry filled in. */
async function writeExperience(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await experience(page).click()
  await page.getByRole("button", { name: "Add experience" }).click()
  for (const [label, value] of Object.entries(ENTRY)) await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByLabel(BULLETS).fill(LONG_BULLETS)
}

const experience = (page: Page) => page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ })
const preview = (page: Page) => page.getByRole("region", { name: "Live preview" })
const views = (page: Page) => page.getByRole("group", { name: "View" })
/** Whether the page's own check for a wide screen passes, which some scrolling depends on. */
const wideByScript = (page: Page) => page.evaluate((query) => matchMedia(query).matches, WIDE_SCREEN)
/** How many pixels of the bullets don't show; the box should grow to show them all. */
const bulletsHidden = (page: Page) => page.getByLabel(BULLETS).evaluate((box) => box.scrollHeight - box.clientHeight)

for (const [width, height, split] of [
  [390, 844, false],
  [1024, 768, false],
  [1280, 800, true],
  [1440, 900, true],
] as const) {
  test(`at ${width}px wide, a filled-in entry is easy to read`, async ({ page }) => {
    const errors = pageErrors(page)
    await writeExperience(page, width, height)

    // Every value shows in full, in a box wide enough to edit it.
    for (const [label, value] of Object.entries(ENTRY)) {
      const input = page.getByLabel(label, { exact: true })
      await expect(input).toHaveValue(value)
      const { shown, needed } = await input.evaluate((box: HTMLInputElement) => ({ shown: box.clientWidth, needed: box.scrollWidth }))
      expect(needed, `all of "${value}" shows`).toBeLessThanOrEqual(shown)
      expect(shown, `the ${label} box is wide enough to edit`).toBeGreaterThanOrEqual(120)
    }
    await expect.poll(() => bulletsHidden(page)).toBeLessThanOrEqual(0)

    // The preview sits beside the form only where there's room for both;
    // otherwise the switch shows one at a time.
    if (split) {
      await expect(preview(page)).toBeVisible()
      await expect(views(page)).toBeHidden()
    } else {
      await expect(preview(page)).toBeHidden()
      await expect(views(page)).toBeVisible()
    }
    expect(await wideByScript(page)).toBe(split)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

    expect(errors).toEqual([])
  })
}

test("resizing keeps the section, what's typed and the controls, and the bullets stay whole", async ({ page }) => {
  const errors = pageErrors(page)
  await writeExperience(page, 1440, 900)

  // Across the line where the preview moves beside the form (1279 → 1280), and back.
  for (const [width, height, split] of [
    [1280, 800, true],
    [1279, 800, false],
    [1024, 768, false],
    [390, 844, false],
    [1440, 900, true],
  ] as const) {
    await page.setViewportSize({ width, height })

    // Still on Experience, with everything typed in it.
    await expect(experience(page)).toHaveAttribute("aria-current", "true")
    for (const [label, value] of Object.entries(ENTRY)) await expect(page.getByLabel(label, { exact: true })).toHaveValue(value)
    // A narrower box wraps onto more lines, and grows to show them.
    await expect.poll(() => bulletsHidden(page), { message: `bullets show in full at ${width}px` }).toBeLessThanOrEqual(0)

    // The layout and the page's script agree, right at the edge too.
    expect(await wideByScript(page), `the script's check at ${width}px`).toBe(split)
    if (split) {
      await expect(preview(page)).toBeVisible()
      continue
    }
    // Where the preview can't sit beside the form, the switch shows it and comes back.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await views(page).getByRole("button", { name: "Preview" }).click()
    await expect(preview(page)).toBeVisible()
    await expect(page.getByRole("heading", { name: "Experience" })).toBeHidden()
    await views(page).getByRole("button", { name: "Edit" }).click()
    await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible()
  }

  expect(errors).toEqual([])
})
