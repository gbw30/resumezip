import { expect, test, type Locator, type Page } from "@playwright/test"
import { pageErrors } from "./helpers"

const resume = (id: string, resumeTitle: string) => ({
  id,
  resumeTitle,
  resumeTag: "professional",
  updatedAt: "2026-10-06T12:00:00.000Z",
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace" },
})

/** Opens the dashboard with these resumes saved in the browser, as an earlier visit would have. */
async function dashboardWith(page: Page, resumes: ReturnType<typeof resume>[]) {
  await page.addInitScript((resumes) => {
    for (const resume of resumes) {
      const key = `resume:${resume.id}`
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(resume))
    }
  }, resumes)
  await page.goto("/create/dashboard")
}

/** Whether an element's text is cut short, across or down. Layout is in fractions of a pixel, so allow one. */
const cutShort = (element: Locator) =>
  element.evaluate((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)

test("a long resume name wraps in the table, and every resume's buttons stay on screen", async ({ page }) => {
  const errors = pageErrors(page)
  // Names far too long for the table, with and without spaces.
  const unbroken = `Software_Engineer_Resume_${Array.from({ length: 110 }, (_, index) => index).join("_")}`
  const spaced = Array.from({ length: 12 }, (_, index) => `Senior Staff Engineer ${index}`).join(" ")
  expect(unbroken.length).toBeGreaterThan(300)
  await page.setViewportSize({ width: 1280, height: 800 })
  await dashboardWith(page, [resume("a", unbroken), resume("b", spaced), resume("c", "Short one")])

  const table = page.getByRole("table")
  await expect(table.getByRole("row")).toHaveCount(4)
  // The table fits in its scroll box, so nothing's off to the side, and every
  // row's last button ends inside it (allowing a pixel, as above).
  const box = await table.evaluate((element) => {
    const parent = element.parentElement!
    return { fits: parent.scrollWidth <= parent.clientWidth, right: parent.getBoundingClientRect().right }
  })
  expect(box.fits).toBe(true)
  for (const button of await table.getByRole("button", { name: "Delete" }).all()) {
    const shown = (await button.boundingBox())!
    expect(shown.x + shown.width).toBeLessThanOrEqual(box.right + 1)
  }

  // Each long name is cut short after two lines. Its link still has it in
  // full, for screen readers, and shows it on hover.
  for (const name of [unbroken, spaced]) {
    const link = table.getByRole("link", { name, exact: true })
    await expect(link).toHaveAttribute("title", name)
    expect(await cutShort(link)).toBe(true)
  }
  expect(await cutShort(table.getByRole("link", { name: "Short one" }))).toBe(false)

  // Asked whether to delete it, the whole name fits the dialog.
  const row = table.getByRole("row").filter({ has: page.getByRole("link", { name: unbroken, exact: true }) })
  await row.getByRole("button", { name: "Delete" }).click()
  const dialog = page.getByRole("dialog", { name: "Delete this resume?" })
  await expect(dialog).toContainText(unbroken)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(errors).toEqual([])
})

test("on a tablet, two resumes whose names differ only by a number both show it", async ({ page }) => {
  const errors = pageErrors(page)
  // Giving a resume a name that's taken adds a number, as "… 2", which only tells them apart if it shows.
  const name = "Product Manager Resume – Stripe"
  await page.setViewportSize({ width: 834, height: 1112 })
  await dashboardWith(page, [resume("a", name), resume("b", `${name} 2`)])

  const table = page.getByRole("table")
  for (const title of [name, `${name} 2`]) expect(await cutShort(table.getByRole("link", { name: title, exact: true }))).toBe(false)
  expect(errors).toEqual([])
})
