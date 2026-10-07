import { expect, test } from "@playwright/test"
import { pageErrors } from "./helpers"

// Spelling and grammar (issue #66): the grammar checker loads once Check is
// opened, runs in the browser, and "Add word" clears a word everywhere on the
// resume.

test("a typo is found once Check is open, and Add word clears it everywhere, without the text leaving the browser", async ({ page }) => {
  const errors = pageErrors(page)
  const sent: string[] = []
  page.on("request", (request) => sent.push(`${request.url()} ${request.postData() ?? ""}`))

  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^\d+ Experience$/ }).click()
  await page.getByRole("button", { name: "Add experience" }).click()
  await page.getByLabel("Company").fill("Analytical Engines")
  await page.getByLabel(/^What you did/).fill("Wrote the Zorbly notes on the engine\nTaught Zorbly methods to the the society")

  await page.getByRole("tablist", { name: "Write or check" }).getByRole("tab", { name: /^Check/ }).click()
  const panel = page.getByRole("tabpanel", { name: /^Check/ })
  const typos = panel.getByRole("button", { name: /“Zorbly” may be misspelled/ })
  await expect(typos).toHaveCount(2)
  await expect(panel.getByRole("button", { name: /“the” twice in a row/ })).toBeVisible()
  await expect(panel.getByText("Checking spelling and grammar…")).toBeHidden()

  // Choosing it opens the bullet; Add word clears it in both.
  await typos.first().click()
  await expect(page.getByLabel(/^What you did/)).toBeFocused()
  await panel.getByRole("button", { name: "Add word “Zorbly”" }).first().click()
  await expect(typos).toHaveCount(0)
  await expect(panel.getByRole("button", { name: /“the” twice in a row/ })).toBeVisible()

  // Nothing typed was sent anywhere: the grammar checker is downloaded, not called.
  expect(sent.filter((request) => request.includes("Zorbly"))).toEqual([])
  expect(errors).toEqual([])
})
