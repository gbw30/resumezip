// The resume as checks read it: each field as trimmed text, each bullet on
// its own without the editor's "• " or its bold and italic marks, and the
// resume's type. It's built once per run, so rules don't each pick the saved
// data apart, and none of them has to guard against older or broken shapes.
// Only what's printed is here: entries and bullets the person left out of
// the PDF (lib/leftOut.ts) aren't, so the checks don't flag them.

import { PROFILE_FIELDS, SECTION_NAMES, SECTIONS, type FieldKey, type ProfileKey, type SectionName } from "@/components/editor/sections"
import { isLeftOut, isLeftOutLine } from "@/lib/leftOut"
import type { Resume } from "@/lib/resume"
import { plainText, sectionOrder } from "@/lib/typst/resumeData"
import type { Place } from "./places"
import { readCheckState } from "./state"

/** Chosen when the resume was made (RESUME_TAGS in components/dashboard/CreateResumeModal.tsx). */
export type ResumeType = "professional" | "personal" | "academic"

/** A resume's type. Resumes without one, or with one this version doesn't know, count as Professional. */
export function resumeTypeOf(resume: Resume): ResumeType {
  const tag = resume?.resumeTag
  return tag === "academic" || tag === "personal" ? tag : "professional"
}

export interface Bullet {
  /** The field it's in, like "workDescription". */
  field: FieldKey
  /** Its line in that field, counting from 0 and blank lines included, which is where the editor finds it. */
  line: number
  /** Which bullet it is in that field, from 1, counting left-out ones too, as the editor does. */
  number: number
  /** As typed, without the "• " in front. */
  raw: string
  /** Its words as printed, without bold and italic marks. */
  text: string
}

export interface Entry {
  section: SectionName
  /**
   * Its place in the section's list in the editor, from 0. Entries that are
   * left out are skipped, so look entries up by this (`entryAt`), not by
   * their place in `ResumeView.sections`.
   */
  index: number
  /** Each field, trimmed; "" when it's empty, missing, or another section's. Bullet fields are as typed. */
  values: Record<FieldKey, string>
  /** The bullets in its bullet field, in order. */
  bullets: Bullet[]
  /** Nothing typed in it at all, as when it was added but never filled in; bullet points with no words count as nothing. */
  blank: boolean
}

export interface ResumeView {
  grammarLanguage: "english" | "other"
  type: ResumeType
  /** Each profile field, trimmed; "" when it's empty or missing. */
  profile: Record<ProfileKey, string>
  /** Each section's printed entries, in the order they're saved and printed. */
  sections: Record<SectionName, Entry[]>
  /** Each section's own title if the person renamed it, or "" for the template's. */
  headings: Record<SectionName, string>
  /** The sections in the order they're printed. */
  order: SectionName[]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

// Every field of every section, empty, so an entry's values have them all.
const NO_VALUES = Object.fromEntries(SECTION_NAMES.flatMap((name) => SECTIONS[name].fields.map((field) => [field.key, ""]))) as Record<
  FieldKey,
  string
>

// Older resumes saved bullets as a list; the editor types them one "• " line each.
const allLinesOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : []).map((line) => (typeof line === "string" ? line : ""))

// Left-out lines are blanked rather than dropped, so the rest keep their line numbers.
const linesOf = (value: unknown): string[] => allLinesOf(value).map((line) => (isLeftOutLine(line) ? "" : line))

const bulletsOf = (field: FieldKey, value: unknown): Bullet[] => {
  let number = 0
  return allLinesOf(value).flatMap((line, index) => {
    const raw = line.trim().replace(/^[•○]\s*/, "")
    if (!raw) return []
    number++
    return isLeftOutLine(line) ? [] : [{ field, line: index, number, raw, text: plainText(raw).trim() }]
  })
}

/** Reads a resume, as the editor saves it, for the checks. */
export function viewOf(resume: Resume): ResumeView {
  const profile = isObject(resume.profileSection) ? resume.profileSection : {}
  const headings = isObject(resume.headings) ? resume.headings : {}
  const sections = {} as Record<SectionName, Entry[]>
  const titles = {} as Record<SectionName, string>
  for (const name of SECTION_NAMES) {
    const { dataKey, headingKey, fields } = SECTIONS[name]
    const list: unknown = resume[dataKey]
    const saved: unknown[] = Array.isArray(list) ? list : []
    sections[name] = saved.flatMap((item, index) => {
      if (isLeftOut(item)) return []
      const entry = isObject(item) ? item : {}
      const values: Record<FieldKey, string> = {
        ...NO_VALUES,
        ...Object.fromEntries(
          fields.map((field) => [
            field.key,
            field.type === "bullets" ? linesOf(entry[field.key]).join("\n").trim() : text(entry[field.key]),
          ]),
        ),
      }
      const bullets = fields.filter((field) => field.type === "bullets").flatMap((field) => bulletsOf(field.key, entry[field.key]))
      // A bullet field with only a "•" in it, as the editor can leave one, is empty too.
      const blank = fields.every((field) =>
        field.type === "bullets" ? !bullets.some((bullet) => bullet.field === field.key) : !values[field.key],
      )
      return [{ section: name, index, values, bullets, blank }]
    })
    titles[name] = text(headings[headingKey])
  }
  return {
    type: resumeTypeOf(resume),
    grammarLanguage: readCheckState(resume).grammarLanguage ?? "english",
    profile: Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, text(profile[field.key])])) as Record<ProfileKey, string>,
    sections,
    headings: titles,
    order: sectionOrder(resume.sectionOrder),
  }
}

/** The entry at an editor place (`Entry.index`), unless it's left out or gone. */
export const entryAt = (view: ResumeView, section: SectionName, index: number): Entry | undefined =>
  view.sections[section]?.find((entry) => entry.index === index)

/**
 * Every piece of typed text and where it is, in the order it's printed:
 * profile values, renamed section titles, entry fields, and each bullet on its
 * own. Empty ones are left out. For rules that read all of it, like spelling.
 */
export function textsOf(view: ResumeView): { place: Place; text: string }[] {
  const texts: { place: Place; text: string }[] = []
  for (const field of PROFILE_FIELDS) {
    const value = view.profile[field.key]
    if (value) texts.push({ place: { kind: "profile", field: field.key }, text: value })
  }
  for (const section of view.order) {
    // A section with nothing printed in it isn't printed at all, title and all.
    const printed = view.sections[section].some((entry) => !entry.blank)
    if (view.headings[section] && printed) texts.push({ place: { kind: "heading", section }, text: view.headings[section] })
    for (const entry of view.sections[section]) {
      for (const field of SECTIONS[section].fields) {
        const place = { kind: "entry", section, entry: entry.index, field: field.key } as const
        if (field.type !== "bullets") {
          if (entry.values[field.key]) texts.push({ place, text: entry.values[field.key] })
          continue
        }
        for (const bullet of entry.bullets) {
          if (bullet.field === field.key && bullet.text) texts.push({ place: { ...place, line: bullet.line }, text: bullet.text })
        }
      }
    }
  }
  return texts
}
