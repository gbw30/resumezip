// What's left out of a resume: entries and bullets kept in the editor but not
// printed, so one resume can be tailored to a job without deleting anything.
// A left-out entry has `leftOut: true`; a left-out bullet starts with "○"
// where a printed one has "•". Older resumes have neither, so they print as
// they always have.

import { SECTIONS } from "@/components/editor/sections"

/** What a left-out bullet starts with, instead of "•". */
export const LEFT_OUT_BULLET = "○"

/** Whether a line of a bullet field is left out. */
export const isLeftOutLine = (line: unknown) => typeof line === "string" && line.trimStart().startsWith(LEFT_OUT_BULLET)

/** Whether an entry is left out. */
export const isLeftOut = (entry: unknown) =>
  typeof entry === "object" && entry !== null && (entry as { leftOut?: unknown }).leftOut === true

// A bullet field without its left-out lines. Older resumes kept bullets as a list.
const printedBullets = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((line) => !isLeftOutLine(line))
    : typeof value === "string"
      ? value
          .split("\n")
          .filter((line) => !isLeftOutLine(line))
          .join("\n")
      : value

/**
 * The resume as it's printed: without left-out entries and bullets. It's
 * what the PDF shows, and all the copy of the resume inside the PDF holds,
 * since anyone who gets the PDF can read that copy.
 */
export function printedResume(resume: Record<string, any>): Record<string, any> {
  const printed = { ...resume }
  for (const { dataKey, fields } of Object.values(SECTIONS)) {
    if (!Array.isArray(resume[dataKey])) continue
    printed[dataKey] = resume[dataKey]
      .filter((entry: unknown) => !isLeftOut(entry))
      .map((entry: unknown) => {
        if (typeof entry !== "object" || entry === null) return entry
        const { leftOut, ...kept } = entry as Record<string, unknown>
        for (const field of fields) {
          if (field.type === "bullets" && field.key in kept) kept[field.key] = printedBullets(kept[field.key])
        }
        return kept
      })
  }
  return printed
}
