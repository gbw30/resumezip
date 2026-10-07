// Readable by hiring software (R1–R6 in issue #58): the preview PDF read back
// the way hiring software reads a resume and compared with what was typed,
// and characters that may not come through.

import { SECTIONS, type SectionName } from "@/components/editor/sections"
import { BULLET_CHARS } from "@/lib/import/lines"
import type { Problem, Rule } from "./engine"
import type { Place } from "./places"
import { comparable, wordsOf } from "./pdf"
import { textsOf } from "./resume"
import { FINE_SYMBOLS, ODD_SYMBOLS } from "./settings"
import { bulletsIn } from "./text"

// The profile fields a recruiter needs to reach the person.
const CONTACT: { field: string; label: string }[] = [
  { field: "fullName", label: "name" },
  { field: "email", label: "email" },
  { field: "phoneNumber", label: "phone number" },
]

const digits = (text: string) => text.replace(/\D/g, "")

const contactRead: Rule = {
  id: "R1",
  category: "readable",
  level: "fix",
  reads: "pdf",
  title: "Hiring software finds your name, email and phone",
  why: "If it can't find them, a recruiter may not see how to reach you.",
  check: ({ resume, pdf }) => {
    const typed = CONTACT.filter(({ field }) => resume.profile[field])
    if (typed.length === 0) return null
    return {
      checked: typed.length,
      problems: typed
        .filter(({ field }) => {
          const read = pdf.parsed.profile[field] ?? ""
          const value = resume.profile[field]
          return field === "phoneNumber" ? digits(read) !== digits(value) : comparable(read) !== comparable(value)
        })
        .map(({ field, label }) => ({
          place: { kind: "profile", field },
          message: `Hiring software can't find your ${label} in the PDF`,
          suggestion: `Keep the field to just your ${label}.`,
        })),
    }
  },
}

const headings: Rule = {
  id: "R2",
  category: "readable",
  level: "fix",
  reads: "pdf",
  title: "Hiring software knows every section heading",
  why: "Hiring software sorts a resume by its headings, and can skip a section under one it doesn't know.",
  check: ({ resume, pdf }) => {
    const printed = resume.order.filter((section) => resume.sections[section].some((entry) => !entry.blank))
    if (printed.length === 0) return null
    const found = new Set(pdf.parsed.sections.map(({ name }) => name))
    return {
      checked: printed.length,
      problems: printed
        .filter((section) => !found.has(section))
        .map((section) => ({
          place: { kind: "heading", section },
          message: `Hiring software may not know “${resume.headings[section] || SECTIONS[section].title}” as a heading`,
          suggestion: `Use a usual one, like “${SECTIONS[section].title}”.`,
        })),
    }
  },
}

// What says what an entry is and when: the fields hiring software reads to
// know the job, school, role, project, skills, paper or award.
const KEY_FIELDS: Record<SectionName, string[]> = {
  Work: ["workRole", "companyName", "workStartDate", "workEndDate"],
  Education: ["schoolName", "degree", "schoolStartDate", "schoolEndDate"],
  Skills: ["skillName", "skillDetails"],
  Projects: ["projectName", "projectDate"],
  Publications: ["publicationTitle", "publicationDate"],
  Volunteership: ["volunteerRole", "volunteerOrg", "volunteerStartDate", "volunteerEndDate"],
  Leadership: ["leadershipRole", "leadershipOrg", "leadershipStartDate", "leadershipEndDate"],
  Awards: ["awardName", "awardDate"],
}

const labelOf = (section: SectionName, field: string) => SECTIONS[section].fields.find((def) => def.key === field)?.label.toLowerCase() ?? field

const entriesRead: Rule = {
  id: "R3",
  category: "readable",
  level: "look",
  reads: "pdf",
  title: "Hiring software reads each entry as typed",
  why: "If a role, company, date or skill lands in another entry, or nowhere, your resume reads wrong.",
  check: ({ resume, pdf }) => {
    let checked = 0
    const problems: Problem[] = []
    for (const section of resume.order) {
      const keys = KEY_FIELDS[section]
      const typed = resume.sections[section].filter((entry) => !entry.blank)
      const found = pdf.parsed.sections.find(({ name }) => name === section)
      // A section that isn't found at all is R2's.
      if (typed.length === 0 || !found) continue
      if (found.entries.length !== typed.length) {
        checked++
        problems.push({
          place: { kind: "section", section },
          message: `Hiring software reads ${found.entries.length} ${found.entries.length === 1 ? "entry" : "entries"} here, not ${typed.length}`,
          suggestion: "An entry may be running into the next one. Check each has its own role, place and dates.",
        })
        continue
      }
      // Each typed value's words only have to be somewhere in its entry, as
      // read, as whole words: the reader can mix up neighbouring fields that
      // hiring software tells apart, as a role read as the company.
      const fields = SECTIONS[section].fields.filter((field) => field.type !== "bullets")
      typed.forEach((entry, i) => {
        const read = new Set(wordsOf(fields.map((field) => found.entries[i].fields[field.key] ?? "").join(" ")))
        for (const key of keys) {
          const words = wordsOf(entry.values[key])
          if (words.length === 0) continue
          checked++
          if (words.every((word) => read.has(word))) continue
          problems.push({
            place: { kind: "entry", section, entry: entry.index, field: key },
            message: `Hiring software doesn't read the ${labelOf(section, key)} with this entry`,
            suggestion: "Keep the field to just what it's for: no dates, places or extra commas.",
          })
        }
      })
    }
    return checked ? { checked, problems } : null
  },
}

const short = (text: string) => (text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text)

const unplaced: Rule = {
  id: "R4",
  category: "readable",
  level: "look",
  reads: "pdf",
  title: "Hiring software can place all your text",
  why: "Text it can't place under a section may be left out of what it reads.",
  check: ({ resume, pdf }) => {
    const texts = textsOf(resume).map(({ place, text }) => ({ place, text: comparable(text) }))
    return {
      checked: 1,
      problems: pdf.parsed.unplaced.map((group): Problem => {
        // Pointing at the field it came from, when it can be found; text with
        // no letters or digits can't be, so it points at its page.
        const line = comparable(group.text[0] ?? "")
        const typed = line ? texts.find(({ text }) => text.includes(line) || (text.length >= 8 && line.includes(text))) : undefined
        const page: Place = { kind: "page", page: pdf.parsed.lines[group.lines[0]]?.page }
        return {
          place: typed?.place ?? page,
          text: group.text.join(" "),
          message: `Hiring software can't tell where “${short(group.text[0] ?? "")}” belongs`,
          suggestion: "Check it's in the field it's for, without a date or place typed into it.",
        }
      }),
    }
  },
}

// A bullet character typed at the start of a bullet: a symbol, or a dash or
// asterisk before a space, as the resume reader reads them.
const TYPED_BULLET = new RegExp(String.raw`^(?:[${BULLET_CHARS}]|[-–—*](?=\s))`)

const symbols: Rule = {
  id: "R5",
  category: "readable",
  level: "look",
  reads: "form",
  title: "No symbols or emoji that may not come through",
  why: "Hiring software may drop them, or show a box instead.",
  check: ({ resume }) => {
    const texts = textsOf(resume)
    if (texts.length === 0) return null
    return {
      checked: texts.length,
      problems: texts.flatMap(({ place, text }) => {
        // A bullet character typed at the start of a bullet is R6's.
        const body = place.kind === "entry" && place.line !== undefined ? text.replace(TYPED_BULLET, "") : text
        const found = [...body].find((char) => ODD_SYMBOLS.test(char) && !FINE_SYMBOLS.includes(char))
        return found ? [{ place, message: `“${found}” may not come through`, suggestion: "Leave it out, or say it in words." }] : []
      }),
    }
  },
}

const typedBullets: Rule = {
  id: "R6",
  category: "readable",
  level: "fix",
  reads: "form",
  title: "No bullet characters typed into bullets",
  why: "The template adds the bullet, so a typed one shows twice.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length === 0) return null
    return {
      checked: bullets.length,
      problems: bullets.flatMap(({ bullet, place }) => {
        const found = TYPED_BULLET.exec(bullet.raw)?.[0]
        return found ? [{ place, message: `Starts with “${found}”, so it shows two bullets`, suggestion: "Delete it: the template adds the bullet." }] : []
      }),
    }
  },
}

export const READABLE_RULES: readonly Rule[] = [contactRead, headings, entriesRead, unplaced, symbols, typedBullets]
