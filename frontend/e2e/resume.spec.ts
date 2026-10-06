import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

test("a new visitor writes a resume, sees it, downloads it and opens it again", async ({ page, browser }, testInfo) => {
  const errors = pageErrors(page)

  // A first visit goes straight to a new resume.
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)

  // The preview shows what's typed. Jake's prints the name in small caps.
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByLabel("Email").fill("ada@example.com")
  const preview = page.getByRole("region", { name: "Live preview" })
  await expect(preview.getByText(/Ada Lovelace/i).first()).toBeVisible()
  await expect(preview.getByText("ada@example.com").first()).toBeVisible()

  // The editor passes the same accessibility checks as the other pages. The
  // preview's pages are left out: pdf.js draws the PDF's email link with no
  // name a screen reader can read, which only dropping its link and text
  // layers would fix.
  expect(await seriousAccessibilityProblems(page, [".react-pdf__Page"])).toEqual([])

  // Download gives a PDF.
  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download PDF" }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const pdf = testInfo.outputPath("resume.pdf")
  await download.saveAs(pdf)
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe("%PDF-")

  // It's saved in the browser.
  await page.reload()
  await expect(page.getByLabel("Full name")).toHaveValue("Ada Lovelace")

  // The PDF opens again in another browser, with the resume as it was.
  const elsewhere = await browser.newContext()
  const other = await elsewhere.newPage()
  const otherErrors = pageErrors(other)
  await other.goto("/create/dashboard")
  await other.locator('input[type="file"]').setInputFiles(pdf)
  await expect(other).toHaveURL(/\/create\/new\//)
  await expect(other.getByLabel("Full name")).toHaveValue("Ada Lovelace")
  await expect(other.getByLabel("Email")).toHaveValue("ada@example.com")
  await elsewhere.close()

  expect(errors).toEqual([])
  expect(otherErrors).toEqual([])
})
