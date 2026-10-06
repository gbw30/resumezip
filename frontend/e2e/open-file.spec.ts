import { expect, test } from "@playwright/test"
import { pageErrors } from "./helpers"

// A one-page PDF with a line of text per entry, as another app would make it.
function textPdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td ${lines.map((line) => `(${line}) Tj 0 -16 Td`).join(" ")} ET`
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

test("opening a PDF works after pdf.js failed to download once", async ({ page }) => {
  const errors = pageErrors(page)
  const file = { name: "Mara Lin.pdf", mimeType: "application/pdf", buffer: textPdf(["Mara Lin", "mara@example.com"]) }

  // pdf.js downloads when the first PDF is opened. Its chunk's name changes
  // with every build, so it's found by a message only pdf.js has.
  let failed = false
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (failed) return route.continue()
    const response = await route.fetch()
    if ((await response.text()).includes("Setting up fake worker")) {
      failed = true
      return route.abort("internetdisconnected")
    }
    return route.fulfill({ response })
  })

  await page.goto("/create/dashboard")
  await page.locator('input[type="file"]').setInputFiles(file)
  const error = page.getByRole("dialog", { name: "Couldn't open that file" })
  await expect(error).toContainText("Something went wrong reading this file.")
  expect(failed).toBe(true)

  // The connection is back. Trying again opens the PDF, without reloading the page.
  const choosing = page.waitForEvent("filechooser")
  await error.getByRole("button", { name: "Choose another file" }).click()
  await (await choosing).setFiles(file)
  await expect(page.getByRole("dialog", { name: "Here's what we found" })).toBeVisible()

  // Only the failed download, and the dashboard logging it.
  expect(errors.filter((error) => !/^(Failed to load resource|Couldn't open file:)/.test(error))).toEqual([])
})
