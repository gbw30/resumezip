import { expect, test, type Page } from "@playwright/test"
import { pageErrors } from "./helpers"

// The first preview waits for the PDF compiler to download. A stand-in page
// shows meanwhile (components/editor/PrintingPage.tsx), and the dashboard
// starts the download before the editor opens (lib/typst/compile.ts), as
// does reaching for "Start writing" (components/site/StartWriting.tsx).

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

test("a resume downloads only its template's fonts, and another template's once it's chosen", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The page sees its workers' requests in Chromium")
  const errors = pageErrors(page)
  // The fonts the compiler downloads, by file name without the hash the app serves them under.
  const fonts: string[] = []
  page.on("request", (request) => {
    const font = request.url().match(/\/([\w-]+)\.[0-9a-f]+\.(otf|ttf)$/)
    if (font) fonts.push(font[1])
  })
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().click()
  await page.getByLabel("Full name").fill("Ada Lovelace")
  const preview = page.getByRole("region", { name: "Live preview" })
  await expect(preview.getByText(/Ada Lovelace/i).first()).toBeVisible()
  // Jake's, the default, is set in New Computer Modern.
  expect([...fonts].sort()).toEqual(["NewCM10-Bold", "NewCM10-BoldItalic", "NewCM10-Italic", "NewCM10-Regular"])
  // The page as drawn, to tell when another template's has replaced it.
  const drawn = () =>
    preview
      .locator("canvas")
      .first()
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  const jakes = await drawn()

  // Harvard is set in EB Garamond.
  await page.getByRole("button", { name: /^Template/ }).click()
  await page
    .getByRole("dialog", { name: "Choose a template" })
    .getByRole("button", { name: /Harvard/ })
    .click()
  await expect.poll(() => fonts.filter((font) => font.startsWith("EBGaramond")).length).toBe(4)
  await expect.poll(drawn).not.toBe(jakes)
  await expect(preview.getByText(/Ada Lovelace/i).first()).toBeVisible()
  await expect(page.getByText(/Couldn.t update the preview/)).toHaveCount(0)
  expect(fonts.filter((font) => !/^(NewCM10|EBGaramond)-/.test(font))).toEqual([])
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

test("the compiler starts downloading as a mouse rests on Start writing, not while the home page is read", async ({ page }) => {
  const errors = pageErrors(page)
  const workers = compilerWorkers(page)
  await page.goto("/")
  // Looking over the templates' pictures doesn't start it.
  const pictures = page.getByRole("region", { name: "Templates" }).getByRole("link", { name: / template/ })
  for (const picture of await pictures.all()) await picture.hover()
  await page.waitForTimeout(1_000)
  expect(workers).toEqual([])

  const startWriting = page.getByRole("link", { name: "Start writing" }).first()
  await startWriting.hover()
  await expect.poll(() => workers.length).toBe(1)
  await startWriting.click()
  await expect(page.getByRole("region", { name: "Live preview" }).locator("canvas")).toBeVisible()
  // The editor uses the compiler that started.
  expect(workers).toHaveLength(1)
  expect(errors).toEqual([])
})

test("pressing a template's picture starts the compiler before the click", async ({ page }) => {
  const errors = pageErrors(page)
  const workers = compilerWorkers(page)
  await page.goto("/templates")
  await page.getByRole("link", { name: /^Harvard template/ }).hover()
  await page.waitForTimeout(500)
  expect(workers).toEqual([])

  await page.mouse.down()
  await expect.poll(() => workers.length).toBe(1)
  await page.mouse.up()
  await expect(page.getByRole("region", { name: "Live preview" }).locator("canvas")).toBeVisible()
  expect(workers).toHaveLength(1)
  expect(errors).toEqual([])
})

test("visitors saving data don't download the compiler ahead, on the home page or the dashboard", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" } })
  })
  const workers = compilerWorkers(page)
  await page.goto("/")
  await page.getByRole("link", { name: "Start writing" }).first().hover()
  await page.waitForTimeout(1_000)
  expect(workers).toEqual([])

  await saveResume(page)
  await page.goto("/create/dashboard")
  await expect(page.getByRole("link", { name: resume.resumeTitle }).first()).toBeVisible()
  await page.waitForTimeout(3_000)
  expect(workers).toEqual([])

  // Opening a resume still makes its preview.
  await page.getByRole("link", { name: resume.resumeTitle }).first().click()
  await expect(page.getByRole("region", { name: "Live preview" }).locator("canvas")).toBeVisible()
})
