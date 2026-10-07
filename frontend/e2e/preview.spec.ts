import { expect, test, type Locator } from "@playwright/test"
import { pageErrors } from "./helpers"

declare global {
  interface Window {
    /** How many resumes the page has sent to the compiler, counted by a test. */
    compiles?: number
  }
}

// The preview is drawn on a canvas, with an invisible copy of its text laid
// over it so it can be selected (components/editor/PdfPreview.tsx).

/** Selects the preview's text from its first line through `last`. */
async function selectThrough(last: Locator) {
  await last.evaluate((span) => {
    const spans = span.closest(".textLayer")!.querySelectorAll("span[role=presentation]")
    const range = document.createRange()
    range.setStartBefore(spans[0])
    range.setEndAfter(span)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(range)
  })
}

const alpha = (color: string) => {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? []
  return parts.length === 4 ? parts[3] : 1
}

test("selecting and copying text in the preview", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await page.getByLabel("Full name").fill("Ada Lovelace")
  await page.getByLabel("Location").fill("Effingham, Illinois")
  await page.getByLabel("Email").fill("ada@example.com")

  const preview = page.getByRole("region", { name: "Live preview" })
  const email = preview.locator(".textLayer span[role=presentation]", { hasText: "ada@example.com" })
  await expect(email).toBeVisible()
  await selectThrough(email)

  // Selected text stays invisible and the highlight lets the page show
  // through, so it keeps the resume's own font instead of the plain one.
  const selection = await email.evaluate((span) => {
    const style = getComputedStyle(span, "::selection")
    return { color: style.color, background: style.backgroundColor }
  })
  expect(alpha(selection.color)).toBe(0)
  expect(alpha(selection.background)).toBeLessThan(1)

  // Copying gives plain text only, spelled as typed.
  const copied = await email.evaluate((span) => {
    const clipboardData = new DataTransfer()
    const event = new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true })
    span.dispatchEvent(event)
    return { types: [...clipboardData.types], text: clipboardData.getData("text/plain"), handled: event.defaultPrevented }
  })
  expect(copied.handled).toBe(true)
  expect(copied.types).toEqual(["text/plain"])
  expect(copied.text).toMatch(/Ada Lovelace/i)
  expect(copied.text).toContain("Effingham, Illinois")
  expect(copied.text).toContain("ada@example.com")

  expect(errors).toEqual([])
})

test("renaming doesn't rebuild the preview, and fast typing ends on the latest text", async ({ page }) => {
  const errors = pageErrors(page)
  await page.addInitScript(() => {
    window.compiles = 0
    const send = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message: any, options?: any) {
      if (message?.template !== undefined) window.compiles = (window.compiles ?? 0) + 1
      return send.call(this, message, options)
    }
  })
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await page.getByLabel("Full name").fill("Ada Lovelace")
  const preview = page.getByRole("region", { name: "Live preview" })
  await expect(preview.getByText(/Ada Lovelace/i).first()).toBeVisible()

  // The resume's name isn't printed, so renaming compiles nothing.
  const compiles = await page.evaluate(() => window.compiles)
  await page.getByLabel("Resume name").fill("Ada's resume")
  await page.waitForTimeout(1_000)
  expect(await page.evaluate(() => window.compiles)).toBe(compiles)

  // Typing quickly ends on what was typed last.
  await page.getByLabel("Email").pressSequentially("ada@example.com", { delay: 20 })
  await expect(preview.getByText("ada@example.com").first()).toBeVisible()

  expect(errors).toEqual([])
})
