import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

// Safari logs this when a page is left while the PDF compiler or its fonts
// are still downloading, which the dashboard and editor start early. The
// visitor never sees it.
const LEFT_MID_DOWNLOAD = /^Fetch API cannot load \S+\.(wasm|otf|ttf) due to access control checks\.$/

/**
 * Collects the errors a page throws or logs, for a test to check at the end.
 * Logged errors end with where they came from, e.g. "… (at http://…/page)".
 */
export function pageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error" && !LEFT_MID_DOWNLOAD.test(message.text())) {
      errors.push(`${message.text()} (at ${message.location().url})`)
    }
  })
  return errors
}

/**
 * The page's serious and critical problems under WCAG 2.1 A and AA, as
 * readable lines, leaving out the parts matching `exclude`.
 */
export async function seriousAccessibilityProblems(page: Page, exclude: string[] = []): Promise<string[]> {
  let axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  for (const selector of exclude) axe = axe.exclude(selector)
  const { violations } = await axe.analyze()
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`)
}
