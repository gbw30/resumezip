import { expect, test, type Locator, type Page } from "@playwright/test"
import { pageErrors } from "./helpers"

// What a click brings up fades in, rather than appearing all at once, unless
// the visitor asks for less motion.

/**
 * Clicks `control` and lists what starts fading in: the text of each element
 * with an opacity transition under way. The click and the reading happen in
 * the page in one go, so a slow test machine can't miss a 200 ms fade.
 */
function fadingIn(control: Locator): Promise<string[]> {
  return control.evaluate(async (element: HTMLElement) => {
    element.click()
    // React renders a click's update in a microtask, before this timer.
    await new Promise((resolve) => setTimeout(resolve, 0))
    return document
      .getAnimations()
      .filter((animation) => "transitionProperty" in animation && animation.transitionProperty === "opacity")
      .map((animation) => ((animation.effect as KeyframeEffect | null)?.target as Element | null)?.textContent ?? "")
  })
}

async function newResume(page: Page) {
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
}

test("a section, Write or Check, and the template gallery fade in as they're chosen", async ({ page }) => {
  const errors = pageErrors(page)
  await newResume(page)
  const sections = page.getByRole("navigation", { name: "Sections" })

  const experience = await fadingIn(sections.getByRole("button", { name: /^\d+ Experience$/ }))
  expect(experience.some((text) => text.includes("Add experience"))).toBe(true)
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible()

  const check = await fadingIn(page.getByRole("tablist", { name: "Write or check" }).getByRole("tab", { name: /^Check/ }))
  expect(check.some((text) => text.includes("Resume score"))).toBe(true)
  const write = await fadingIn(page.getByRole("tab", { name: "Write" }))
  expect(write.some((text) => text.includes("Profile"))).toBe(true)

  const gallery = await fadingIn(page.getByRole("button", { name: /^Template/ }))
  expect(gallery.some((text) => text.includes("Templates"))).toBe(true)
  await expect(page.getByRole("dialog", { name: "Choose a template" })).toBeVisible()
  await page.keyboard.press("Escape")

  // Let the preview finish, so the compiler's download isn't cut off as the page closes.
  await expect(page.getByRole("region", { name: "Live preview" }).locator(".react-pdf__Page__canvas").first()).toBeVisible()
  expect(errors).toEqual([])
})

test("the New resume and Delete dialogs fade in", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/create/dashboard")

  const creating = await fadingIn(page.getByRole("button", { name: "New resume" }).first())
  expect(creating.some((text) => text.includes("New resume"))).toBe(true)
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click()
  await expect(page).toHaveURL(/\/create\/new\//)

  await page.goto("/create/dashboard")
  const deleting = await fadingIn(page.getByRole("button", { name: "Delete", exact: true }))
  expect(deleting.some((text) => text.includes("Delete this resume?"))).toBe(true)
  await expect(page.getByRole("dialog", { name: "Delete this resume?" })).toBeVisible()
  expect(errors).toEqual([])
})

test.describe("with less motion", () => {
  test.use({ reducedMotion: "reduce" })

  test("nothing fades: it's all there at once", async ({ page }) => {
    await newResume(page)
    expect(await fadingIn(page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }))).toEqual([])
    expect(await fadingIn(page.getByRole("tab", { name: /^Check/ }))).toEqual([])
    expect(await fadingIn(page.getByRole("button", { name: /^Template/ }))).toEqual([])
    await page.keyboard.press("Escape")
    await expect(page.getByRole("region", { name: "Live preview" }).locator(".react-pdf__Page__canvas").first()).toBeVisible()
  })
})
