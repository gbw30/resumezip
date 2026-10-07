import { expect, test, type Page } from "@playwright/test"
import { pageErrors } from "./helpers"

// The first preview waits for the PDF compiler to download. A stand-in page
// shows meanwhile (components/editor/PrintingPage.tsx), and the dashboard
// starts the download before the editor opens (lib/typst/compile.ts).

const resume = {
  id: "first-preview",
  resumeTitle: "First preview",
  resumeTag: "personal",
  updatedAt: "2026-10-06T12:00:00.000Z",
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace" },
}

/** Saves a resume in the browser before the page loads, as an earlier visit would have. */
const saveResume = (page: Page) =>
  page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    },
    { key: `resume:${resume.id}`, value: JSON.stringify(resume) },
  )

/** The compiler workers the page starts, noted as they start. (The preview's pdf.js has a worker too.) */
function compilerWorkers(page: Page): string[] {
  const urls: string[] = []
  page.on("worker", (worker) => {
    if (!worker.url().includes("pdf.worker")) urls.push(worker.url())
  })
  return urls
}

test("the editor shows a stand-in page until the first preview, and downloads only the app's fonts", async ({ page }) => {
  const errors = pageErrors(page)
  const requested: string[] = []
  page.on("request", (request) => requested.push(request.url()))
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()

  const preview = page.getByRole("region", { name: "Live preview" })
  await expect(preview.getByRole("status", { name: "Loading preview" })).toBeVisible()
  await expect(preview.locator("canvas")).toBeVisible()
  await expect(preview.getByRole("status", { name: "Loading preview" })).toHaveCount(0)
  // Typst's own fonts, from its CDN, aren't used by any template.
  expect(requested.filter((url) => url.includes("typst-assets"))).toEqual([])
  expect(errors).toEqual([])
})

test("the dashboard starts the compiler, and the editor uses the same one", async ({ page, browserName }) => {
  const errors = pageErrors(page)
  await saveResume(page)
  const workers = compilerWorkers(page)
  const downloads: string[] = []
  page.on("request", (request) => {
    if (request.url().endsWith(".wasm")) downloads.push(request.url())
  })
  // The download itself is checked in Chromium, where the page sees its workers' requests.
  const seesDownloads = browserName === "chromium"
  await page.goto("/create/dashboard")
  await expect.poll(() => workers.length).toBe(1)
  if (seesDownloads) await expect.poll(() => downloads.length).toBeGreaterThan(0)
  const downloadedAhead = downloads.length

  await page.getByRole("link", { name: resume.resumeTitle }).first().click()
  await expect(page.getByRole("region", { name: "Live preview" }).locator("canvas")).toBeVisible()
  expect(workers).toHaveLength(1)
  // The editor doesn't download the compiler again.
  expect(downloads).toHaveLength(downloadedAhead)
  expect(errors).toEqual([])
})

test("visitors saving data don't download the compiler on the dashboard", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" } })
  })
  await saveResume(page)
  const workers = compilerWorkers(page)
  await page.goto("/create/dashboard")
  await expect(page.getByRole("link", { name: resume.resumeTitle }).first()).toBeVisible()
  await page.waitForTimeout(3_000)
  expect(workers).toEqual([])

  // Opening a resume still makes its preview.
  await page.getByRole("link", { name: resume.resumeTitle }).first().click()
  await expect(page.getByRole("region", { name: "Live preview" }).locator("canvas")).toBeVisible()
})
