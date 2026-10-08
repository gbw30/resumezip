import { expect, test, type Page } from "@playwright/test"
import { pageErrors } from "./helpers"

declare global {
  interface Window {
    /** Set by a test to make the PDF compiler fail. */
    brokenCompiler?: boolean
  }
}

/** What the editor and dashboard show when a download fails. */
const downloadFailed = (page: Page) => page.getByRole("alert").filter({ hasText: "Download failed" })

/** Clicks a button and checks it gives a PDF. */
async function downloads(page: Page, button: ReturnType<Page["getByRole"]>) {
  const downloading = page.waitForEvent("download")
  await button.click()
  expect((await downloading).suggestedFilename()).toMatch(/\.pdf$/)
}

/**
 * Downloads again, straight after a download that worked, and has it fail:
 * the button stops saying "Downloaded" as the new try starts, so it's never
 * shown beside the failure. (If the page is slow, the confirmation may have
 * gone by itself first, and this only checks the failure is shown.)
 */
async function failsAfterDownloading(page: Page, button: ReturnType<Page["getByRole"]>) {
  await page.evaluate(() => (window.brokenCompiler = true))
  await button.click()
  await expect(downloadFailed(page)).toBeVisible()
  // Read once, not waited for: waiting would pass once the old confirmation timed out.
  expect(await page.getByRole("button", { name: "Downloaded" }).count()).toBe(0)
  await page.evaluate(() => (window.brokenCompiler = false))
}

test("a failed download says so, and trying again downloads the PDF", async ({ page }) => {
  const errors = pageErrors(page)
  // While brokenCompiler is set, the compiler's worker fails each resume it's
  // given, as if it had crashed. pdf.js's worker is left alone.
  await page.addInitScript(() => {
    const RealWorker = window.Worker
    window.Worker = class extends RealWorker {
      postMessage(message: any, options?: any) {
        if (!window.brokenCompiler || message?.template === undefined) return super.postMessage(message, options)
        setTimeout(() => this.onerror?.call(this, new ErrorEvent("error", { message: "Typst crashed" })))
      }
    }
  })

  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await page.getByLabel("Resume name").fill("Ada's resume")
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await expect(
    page
      .getByRole("region", { name: "Live preview" })
      .getByText(/Ada Lovelace/i)
      .first(),
  ).toBeVisible()

  // The editor.
  await page.evaluate(() => (window.brokenCompiler = true))
  const downloadPdf = page.getByRole("button", { name: "Download PDF" })
  await downloadPdf.click()
  await expect(downloadFailed(page)).toContainText("Couldn't make your PDF. Something went wrong.")
  await expect(downloadPdf).toBeEnabled()

  // Failing again says so.
  await downloadFailed(page).getByRole("button", { name: "Try again" }).click()
  await expect(downloadFailed(page)).toContainText("Still couldn't make your PDF.")

  await page.evaluate(() => (window.brokenCompiler = false))
  await downloads(page, downloadFailed(page).getByRole("button", { name: "Try again" }))
  await expect(downloadFailed(page)).toHaveCount(0)
  await failsAfterDownloading(page, page.getByRole("button", { name: /^Download(ed| PDF)$/ }))

  // The dashboard.
  await page.getByRole("link", { name: "Your resumes" }).click()
  await page.evaluate(() => (window.brokenCompiler = true))
  const download = page.getByRole("button", { name: "Download", exact: true })
  await download.click()
  await expect(downloadFailed(page)).toContainText("Couldn't make the PDF of “Ada's resume”.")
  await expect(download).toBeEnabled()

  await page.evaluate(() => (window.brokenCompiler = false))
  await downloads(page, downloadFailed(page).getByRole("button", { name: "Try again" }))
  await expect(downloadFailed(page)).toHaveCount(0)
  await failsAfterDownloading(page, page.getByRole("button", { name: /^Download(ed)?$/ }))

  // Only the failures, logged by the editor and dashboard.
  expect(errors.filter((error) => !/^(Error downloading resume:|Failed to build PDF:)/.test(error))).toEqual([])
})
