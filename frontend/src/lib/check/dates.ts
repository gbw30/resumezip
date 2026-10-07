// Dates (D1–D7 in issue #58): that each entry has them, that they make sense,
// and that they're written one way.

import type { SectionName } from "@/components/editor/sections"
import type { Problem, Rule } from "./engine"
import type { Place } from "./places"
import { compareDates, datesOf, DATE_FIELDS, monthName, type EntryDates, type ResumeDate, type Written } from "./readDate"
import type { Entry, ResumeView } from "./resume"
import { mostCommon } from "./text"

// Jobs, schools and roles: what has a start and an end.
const SPANS: SectionName[] = ["Work", "Education", "Leadership", "Volunteership"]

const at = (entry: Entry, field: string): Place => ({ kind: "entry", section: entry.section, entry: entry.index, field })

/** The dates of each entry with something in it, section by section, in the order they're printed. */
const allDates = (resume: ResumeView, sections: readonly SectionName[] = resume.order) =>
  resume.order.filter((section) => sections.includes(section)).map((section) => resume.sections[section].filter((entry) => !entry.blank).map(datesOf))

const writtenIn = (dates: EntryDates) => [dates.start, dates.end].filter((date): date is Written => date !== undefined)

const noDates: Rule = {
  id: "D1",
  category: "dates",
  level: "fix",
  reads: "form",
  title: "Every job, school and role has dates",
  why: "Recruiters read dates to see how long you did something, and how recently.",
  check: ({ resume }) => {
    const entries = allDates(resume, SPANS).flat()
    if (entries.length === 0) return null
    return {
      checked: entries.length,
      problems: entries
        .filter((dates) => dates.filled === 0)
        .map(({ entry }) => {
          const fields = DATE_FIELDS[entry.section] as { start: string }
          return { place: at(entry, fields.start), message: "No dates", suggestion: "Add when it started and ended." }
        }),
    }
  },
}

const backwards: Rule = {
  id: "D2",
  category: "dates",
  level: "fix",
  reads: "form",
  title: "Nothing ends before it starts",
  why: "Swapped dates leave a recruiter guessing which one is right.",
  check: ({ resume }) => {
    const both = allDates(resume)
      .flat()
      .filter((dates) => dates.start && dates.end)
    if (both.length === 0) return null
    return {
      checked: both.length,
      problems: both
        .filter(({ start, end }) => compareDates(end!.date, start!.date) < 0)
        .map(({ entry, end }) => ({ place: at(entry, end!.field), message: "Ends before it starts" })),
    }
  },
}

const unreadable: Rule = {
  id: "D3",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Every date can be read",
  why: "Hiring software reads dates to count your experience, and may skip one it can't read.",
  check: ({ resume }) => {
    const entries = allDates(resume).flat()
    const filled = entries.reduce((total, dates) => total + dates.filled, 0)
    if (filled === 0) return null
    return {
      checked: filled,
      problems: entries.flatMap(({ entry, unreadable }) =>
        unreadable.map(({ field }) => ({
          place: at(entry, field),
          message: "Can't read this date",
          suggestion: "Write it like “Jan 2024”, or “Present” if it hasn't ended.",
        })),
      ),
    }
  },
}

// How the resume writes months, from what most of its dates do.
interface HouseStyle {
  numbers?: boolean
  long?: boolean
  dotted?: boolean
  sept?: boolean
}

type MonthDate = Written & { date: Extract<ResumeDate, { present: false }> }

const isName = (written: MonthDate) => written.date.style.kind === "name"
const spellingOf = (written: MonthDate) => (written.date.style.kind === "name" ? written.date.style.spelling : "")
// May, June and July are written the same way short or long.
const lengthOf = (written: MonthDate) => {
  const spelling = spellingOf(written)
  const full = monthName(written.date.month!, { long: true }).toLowerCase()
  return spelling === full && spelling.length <= 4 ? undefined : spelling.length >= 5 ? "long" : "short"
}
const isShortened = (written: MonthDate) => isName(written) && spellingOf(written) !== monthName(written.date.month!, { long: true }).toLowerCase()
const isDotted = (written: MonthDate) => written.date.style.kind === "name" && written.date.style.dotted

function houseStyle(dates: MonthDate[]): HouseStyle {
  const names = dates.filter(isName)
  const shortened = names.filter(isShortened)
  const september = shortened.filter((written) => written.date.month === 9)
  return {
    numbers: mostCommon(dates.filter((written) => written.date.style.kind !== "season").map((written) => !isName(written))),
    long: mostCommon(names.map(lengthOf).filter((length) => length !== undefined).map((length) => length === "long")),
    dotted: mostCommon(shortened.map(isDotted)),
    sept: mostCommon(september.map((written) => spellingOf(written) === "sept")),
  }
}

// Whether a date's month is written the resume's usual way.
function followsHouse(written: MonthDate, house: HouseStyle): boolean {
  if (written.date.style.kind === "season") return true
  if (house.numbers !== undefined && house.numbers !== !isName(written)) return false
  if (!isName(written)) return true
  const length = lengthOf(written)
  if (house.long !== undefined && length !== undefined && house.long !== (length === "long")) return false
  if (isShortened(written) && house.dotted !== undefined && house.dotted !== isDotted(written)) return false
  if (isShortened(written) && written.date.month === 9 && house.sept !== undefined && house.sept !== (spellingOf(written) === "sept")) return false
  return true
}

// A date written the resume's usual way, for the suggestion. A range's first
// month keeps going without its year, as "Sep" in "Sep – Dec 2025".
function rewrite({ date, text }: MonthDate, house: HouseStyle): string {
  if (house.numbers) return `${String(date.month).padStart(2, "0")}/${date.year}`
  const year = /\d/.test(text) ? ` ${date.year}` : ""
  return `${monthName(date.month!, { long: house.long, dotted: house.dotted, sept: house.sept })}${year}`
}

const mixedFormats: Rule = {
  id: "D4",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Dates written one way",
  why: "Dates written the same way read as careful work.",
  check: ({ resume }) => {
    // Publications follow their citation style, as IEEE's “Aug. 2023”.
    const sections = allDates(
      resume,
      resume.order.filter((section) => section !== "Publications"),
    ).map((entries) => entries.flatMap(writtenIn).filter((written): written is MonthDate => !written.date.present))
    const dates = sections.flat()
    if (dates.length < 2) return null
    const problems = new Map<string, Problem>()
    const flag = (written: Written, problem: Omit<Problem, "place" | "text">) => {
      const key = `${written.entry.section}.${written.entry.index}.${written.field}|${written.text}`
      if (!problems.has(key)) problems.set(key, { place: at(written.entry, written.field), text: written.text, ...problem })
    }
    // Years on their own, or with months: one way within a section, so
    // projects can go by year while jobs have months.
    for (const written of sections) {
      const hasMonth = (date: MonthDate) => date.date.month !== undefined
      const withMonths = written.filter(hasMonth).length
      const yearsOnly = written.length - withMonths
      if (withMonths === 0 || yearsOnly === 0) continue
      for (const date of written) {
        if (yearsOnly <= withMonths && !hasMonth(date)) {
          flag(date, { message: "No month, unlike the rest of this section", suggestion: "Add the month, or use only years in this section." })
        } else if (yearsOnly > withMonths && hasMonth(date)) {
          flag(date, { message: "Has a month, unlike the rest of this section", suggestion: `Write just the year: “${date.date.year}”.` })
        }
      }
    }
    // Months, one way across the resume: names or numbers, short or long, with or without a dot.
    const months = dates.filter((written) => written.date.month !== undefined)
    const house = houseStyle(months)
    for (const written of months) {
      if (!followsHouse(written, house)) {
        flag(written, { message: "Not written like your other dates", suggestion: `Write it like “${rewrite(written, house)}”.` })
      }
    }
    return { checked: dates.length, problems: [...problems.values()] }
  },
}

const presentWords: Rule = {
  id: "D5",
  category: "dates",
  level: "look",
  reads: "form",
  title: "“Present” written one way",
  why: "One word for what you're still doing reads as careful work.",
  check: ({ resume }) => {
    const present = allDates(resume)
      .flat()
      .flatMap(writtenIn)
      .filter((written) => written.date.present)
    if (present.length < 2) return null
    const word = (written: Written) => (written.date.present ? written.date.word : "")
    const house = mostCommon(present.map((written) => word(written).toLowerCase()))
    const usual = present.find((written) => word(written).toLowerCase() === house)!
    return {
      checked: present.length,
      problems: present
        .filter((written) => word(written).toLowerCase() !== house)
        .map((written) => ({
          place: at(written.entry, written.field),
          text: written.text,
          message: `“${word(written)}” here, “${word(usual)}” elsewhere`,
          suggestion: `Use “${word(usual)}” everywhere.`,
        })),
    }
  },
}

const newestFirst: Rule = {
  id: "D6",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Newest entries first",
  why: "Recruiters expect your latest work first.",
  check: ({ resume }) => {
    let checked = 0
    const problems: Problem[] = []
    for (const entries of allDates(resume, SPANS)) {
      const dated = entries.filter((dates) => dates.start || dates.end)
      for (let i = 1; i < dated.length; i++) {
        const [above, below] = [dated[i - 1], dated[i]]
        // Only one that's newer by every date both have: overlapping roles
        // can go either way, as an upcoming internship above a campus job.
        const sides = (["start", "end"] as const).filter((side) => above[side] && below[side])
        if (sides.length === 0) continue
        checked++
        const order = sides.map((side) => compareDates(below[side]!.date, above[side]!.date))
        if (order.some((difference) => difference > 0) && order.every((difference) => difference >= 0)) {
          const date = below.end ?? below.start!
          problems.push({ place: at(below.entry, date.field), message: "Newer than the entry above", suggestion: "List the newest first." })
        }
      }
    }
    return checked ? { checked, problems } : null
  },
}

const apostropheYears: Rule = {
  id: "D7",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Whole years, without an apostrophe",
  why: "A whole year is clearer, to people and to hiring software.",
  check: ({ resume }) => {
    const dates = allDates(resume).flat().flatMap(writtenIn)
    if (dates.length === 0) return null
    return {
      checked: dates.length,
      problems: dates.flatMap((written) => {
        const year = written.text.match(/['’‘]\d{2}\b/)?.[0]
        if (written.date.present || !written.date.shortYear || !year) return []
        return [
          {
            place: at(written.entry, written.field),
            text: written.text,
            message: `Year written as “${year}”`,
            suggestion: `Write the whole year: “${written.date.year}”.`,
          },
        ]
      }),
    }
  },
}

export const DATE_RULES: readonly Rule[] = [noDates, backwards, unreadable, mixedFormats, presentWords, newestFirst, apostropheYears]
