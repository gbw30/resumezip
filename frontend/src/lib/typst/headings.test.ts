// A section has one name: the editor shows it, and every template prints it
// as the section's heading unless the person writes their own.

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"
import { SECTIONS } from "@/components/editor/sections"
import type { TemplateData } from "./resumeData"

const TEMPLATES = path.resolve("src/lib/typst/templates")

/** The editor's name for each heading the templates read. */
const EDITOR_NAMES: Record<keyof TemplateData["headings"], string> = {
  education: SECTIONS.Education.title,
  work: SECTIONS.Work.title,
  projects: SECTIONS.Projects.title,
  publications: SECTIONS.Publications.title,
  skills: SECTIONS.Skills.title,
  leadership: SECTIONS.Leadership.title,
  volunteer: SECTIONS.Volunteership.title,
  awards: SECTIONS.Awards.title,
}

const templates = readdirSync(TEMPLATES).filter((file) => file !== "common.typ")

test.each(templates)("%s prints each section's heading as the editor names it", (file) => {
  const source = readFileSync(path.join(TEMPLATES, file), "utf8")
  // heading-or(hd.awards, "Awards & Certifications"): the person's heading, or this.
  const defaults = Object.fromEntries([...source.matchAll(/heading-or\(hd\.(\w+), "([^"]*)"\)/g)].map(([, key, text]) => [key, text]))
  expect(defaults).toEqual(EDITOR_NAMES)
})
