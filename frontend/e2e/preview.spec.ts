import { expect, test, type Locator } from "@playwright/test"
import { pageErrors } from "./helpers"

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
