// Polish (P1–P7 in issue #58): small things written one way, and spaced and
// capitalized the usual way.

import type { SectionName } from "@/components/editor/sections"
import type { Problem, Rule } from "./engine"
import type { Place } from "./places"
import { textsOf, type ResumeView } from "./resume"
import { ACRONYMS, DEGREE_ABBREVIATIONS, LOWERCASE_NAMES, NUMBER_UNITS, SHORTHAND, US_STATES } from "./settings"
import { bulletsIn, escaped, firstWord, mostCommon, type PlacedBullet } from "./text"

const capitalized = (word: string) => word[0].toUpperCase() + word.slice(1).toLowerCase()

// Fields that hold a link or an email, where dots and commas don't need spaces.
const LINK_FIELDS = new Set(["email", "linkedin", "profileGithub", "personalWebsite", "projectGithub", "additionalLink", "publicationLink"])
const fieldOf = (place: Place) => (place.kind === "profile" || place.kind === "entry" ? place.field : undefined)

const endings: Rule = {
  id: "P1",
  category: "polish",
  level: "look",
  reads: "form",
  title: "Bullets end the same way",
  why: "Bullets that all end the same way look tidy.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length < 2) return null
    const period = (text: string) => text.trimEnd().endsWith(".")
    const usual = mostCommon(bullets.map(({ bullet }) => period(bullet.text)))
    return {
      checked: bullets.length,
      problems: bullets
        .filter(({ bullet }) => period(bullet.text) !== usual)
        .map(({ place }) =>
          usual
            ? { place, message: "No period at the end, unlike your other bullets", suggestion: "Add one, or take them off the others." }
            : { place, message: "Ends with a period, unlike your other bullets", suggestion: "Take it off, or add one to the others." },
        ),
    }
  },
}

const LOWERCASE = new Set(LOWERCASE_NAMES)

const capitalStarts: Rule = {
  id: "P2",
  category: "polish",
  level: "look",
  reads: "form",
  title: "Bullets start with a capital letter",
  why: "A capital letter starts each bullet like a sentence.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length === 0) return null
    return {
      checked: bullets.length,
      problems: bullets.flatMap(({ bullet, place }) => {
        const word = firstWord(bullet.text)
        // "iOS" and "npm" are written that way on purpose.
        if (!/^\p{Ll}/u.test(word) || word !== word.toLowerCase() || LOWERCASE.has(word)) return []
        return [{ place, message: "Starts with a lowercase letter", suggestion: `Start with “${word[0].toUpperCase()}${word.slice(1)}”.` }]
      }),
    }
  },
}

/** Something written one of two ways, where it is, and how to write it the other way. */
interface Way {
  place: Place
  way: string
  rewrite: string
}

const STATE_NAMES = new Map(US_STATES.map(([abbreviation, name]) => [name.toLowerCase(), abbreviation]))
const STATE_ABBREVIATIONS = new Map(US_STATES)

// Where places are written, besides the profile's location.
const LOCATION_FIELDS: Partial<Record<SectionName, string>> = {
  Education: "schoolLocation",
  Work: "workLocation",
  Volunteership: "volunteerLocation",
  Leadership: "leadershipLocation",
}

// "Austin, TX" or "Austin, Texas": how each place's state is written.
function statesIn(resume: ResumeView): Way[] {
  const places: { place: Place; text: string }[] = [{ place: { kind: "profile", field: "location" }, text: resume.profile.location }]
  for (const [section, field] of Object.entries(LOCATION_FIELDS) as [SectionName, string][]) {
    for (const entry of resume.sections[section]) places.push({ place: { kind: "entry", section, entry: entry.index, field }, text: entry.values[field] })
  }
  return places.flatMap(({ place, text }): Way[] => {
    const parts = text.split(",")
    if (parts.length < 2) return []
    const state = parts.at(-1)!.trim()
    const city = parts.slice(0, -1).join(",").trim()
    const name = STATE_ABBREVIATIONS.get(state)
    if (name) return [{ place, way: "abbreviated", rewrite: `${city}, ${name}` }]
    const abbreviation = STATE_NAMES.get(state.toLowerCase())
    return abbreviation ? [{ place, way: "written out", rewrite: `${city}, ${abbreviation}` }] : []
  })
}

const PLAIN_DEGREE = new Map(DEGREE_ABBREVIATIONS)
const DOTTED_DEGREE = new Map(DEGREE_ABBREVIATIONS.map(([dotted, plain]) => [plain, dotted]))

// "B.S." or "BS": how each degree's abbreviation is written.
function degreesIn(resume: ResumeView): Way[] {
  return resume.sections.Education.flatMap((entry): Way[] => {
    const degree = entry.values.degree
    const token = degree.match(/^[A-Za-z.]+/)?.[0] ?? ""
    const place: Place = { kind: "entry", section: "Education", entry: entry.index, field: "degree" }
    const plain = PLAIN_DEGREE.get(token)
    if (plain) return [{ place, way: "abbreviated with dots", rewrite: plain + degree.slice(token.length) }]
    const dotted = DOTTED_DEGREE.get(token)
    return dotted ? [{ place, way: "abbreviated without dots", rewrite: dotted + degree.slice(token.length) }] : []
  })
}

const oneWay: Rule = {
  id: "P3",
  category: "polish",
  level: "look",
  reads: "form",
  title: "States and degrees written one way",
  why: "Writing the same kind of thing one way looks careful.",
  check: ({ resume }) => {
    const groups = [
      { ways: statesIn(resume), what: "State", others: "your other places" },
      { ways: degreesIn(resume), what: "Degree", others: "your other degrees" },
    ]
    if (groups.every(({ ways }) => ways.length < 2)) return null
    const problems: Problem[] = []
    for (const { ways, what, others } of groups) {
      const usual = mostCommon(ways.map(({ way }) => way))
      for (const { place, way, rewrite } of ways) {
        if (way !== usual) problems.push({ place, message: `${what} ${way}, unlike ${others}`, suggestion: `Write it “${rewrite}”.` })
      }
    }
    return { checked: groups.reduce((total, { ways }) => total + ways.length, 0), problems }
  },
}

const SPACING: { pattern: RegExp; message: string; suggestion: (found: RegExpExecArray) => string }[] = [
  { pattern: /\S {2,}\S/, message: "Two spaces in a row", suggestion: () => "Use one space." },
  { pattern: /(\S+) +([,.;:])(?=\s|$)/, message: "A space before punctuation", suggestion: (found) => `Write “${found[1]}${found[2]}”.` },
  { pattern: /([\p{L}\p{N})]+),(\p{L}+)/u, message: "No space after a comma", suggestion: (found) => `Write “${found[1]}, ${found[2]}”.` },
  // "users.Built", but not "Node.js", "ASP.NET" or "U.S.".
  { pattern: /(\p{Ll}{2,})\.(\p{Lu}\p{Ll}+)/u, message: "No space after a period", suggestion: (found) => `Write “${found[1]}. ${found[2]}”.` },
]

const spacing: Rule = {
  id: "P4",
  category: "polish",
  level: "look",
  reads: "form",
  title: "Clean spacing",
  why: "Stray or missing spaces look careless in print.",
  check: ({ resume }) => {
    const texts = textsOf(resume).filter(({ place }) => !LINK_FIELDS.has(fieldOf(place) ?? ""))
    if (texts.length === 0) return null
    return {
      checked: texts.length,
      problems: texts.flatMap(({ place, text }) => {
        for (const { pattern, message, suggestion } of SPACING) {
          const found = pattern.exec(text)
          if (found) return [{ place, message, suggestion: suggestion(found) }]
        }
        return []
      }),
    }
  },
}

const KNOWN_CAPITALS = new Set(ACRONYMS)

const allCaps: Rule = {
  id: "P5",
  category: "polish",
  level: "look",
  reads: "form",
  title: "No words in capitals that aren't acronyms",
  why: "Capitals read as shouting, except in acronyms.",
  check: ({ resume }) => {
    // Not the profile (a name can be in capitals on purpose), or the lists of
    // tools and courses, which are full of names written in capitals.
    const texts = textsOf(resume).filter(
      ({ place }) =>
        place.kind === "entry" && place.section !== "Skills" && place.field !== "coursework" && !LINK_FIELDS.has(place.field ?? ""),
    )
    if (texts.length === 0) return null
    return {
      checked: texts.length,
      problems: texts.flatMap(({ place, text }) => {
        const found = [...text.matchAll(/\b[A-Z]{5,}\b/g)].find(([word]) => !KNOWN_CAPITALS.has(word) && !/^[IVXLCDM]+$/.test(word))
        if (!found) return []
        const word = found[0]
        const rewrite = found.index === 0 ? capitalized(word) : word.toLowerCase()
        return [{ place, message: `“${word}” in capitals`, suggestion: `Unless it's an acronym, write it “${rewrite}”.` }]
      }),
    }
  },
}

// How each kind of shorthand is found: "&" only between words in a sentence
// ("design & build", not "AT&T" or "Procter & Gamble"), "hr" and "yr" only in
// lower case ("HR" is a department).
function shorthandPattern(short: string): RegExp {
  if (short === "&") return / & (?=\p{Ll})/u
  if (/^(yrs?|hrs?)$/.test(short)) return new RegExp(String.raw`\b${short}\b`)
  if (short.includes("/")) return new RegExp(String.raw`(?<![\p{L}\p{N}/])${escaped(short)}(?!/)`, "iu")
  return new RegExp(String.raw`(?<!\p{L})${escaped(short)}(?!\p{L})`, "iu")
}
const SHORTHANDS = SHORTHAND.map(([short, word]) => ({ word, pattern: shorthandPattern(short) }))

const shorthand: Rule = {
  id: "P6",
  category: "polish",
  level: "look",
  reads: "form",
  title: "No shorthand like “w/” or “mgmt”",
  why: "Shorthand reads as a note to yourself, not a finished resume.",
  check: ({ resume }) => {
    // Bullets, and fields like a role or a skill ("Project Mgr"); not links.
    const texts = textsOf(resume).filter(({ place }) => !LINK_FIELDS.has(fieldOf(place) ?? ""))
    if (texts.length === 0) return null
    return {
      checked: texts.length,
      problems: texts.flatMap(({ place, text }) => {
        for (const { word, pattern } of SHORTHANDS) {
          const found = pattern.exec(text)?.[0].trim()
          if (!found) continue
          const full = /^\p{Lu}/u.test(found) ? word[0].toUpperCase() + word.slice(1) : word
          return [{ place, message: `“${found}” is shorthand`, suggestion: `Write “${full}”.` }]
        }
        return []
      }),
    }
  },
}

const WORDS_FOR = ["two", "three", "four", "five", "six", "seven", "eight", "nine"]
// Before a counted thing ("5 engineers"), but not a unit or a size ("9 ms", "4 million").
const COUNTED = String.raw`(?= (?!(?:${NUMBER_UNITS.join("|")})\b)\p{Ll})`
// A count from 2 to 9, written as a digit or a word, and a percentage written
// with "%" or "percent".
const NUMBER_WAYS = [
  {
    digit: new RegExp(String.raw`(?<![\p{L}\p{N}$€£.,/-])[2-9]${COUNTED}`, "u"),
    word: new RegExp(String.raw`\b(?:${WORDS_FOR.join("|")})\b${COUNTED}`, "iu"),
    asWord: (digit: string) => WORDS_FOR[Number(digit) - 2],
    asDigit: (word: string) => String(WORDS_FOR.indexOf(word.toLowerCase()) + 2),
    elsewhere: { digit: "digits", word: "words" },
  },
  {
    digit: /\p{N}[\p{N}.,]*\s*%/u,
    word: /\p{N}[\p{N}.,]*\s*percent\b/iu,
    asWord: (digit: string) => digit.replace(/\s*%/, " percent"),
    asDigit: (word: string) => word.replace(/\s*percent/i, "%"),
    elsewhere: { digit: "“%”", word: "“percent”" },
  },
]

const numbersOneWay: Rule = {
  id: "P7",
  category: "polish",
  level: "look",
  reads: "form",
  title: "Numbers written one way",
  why: "Numbers written the same way read as careful work.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length < 2) return null
    const problems = new Map<string, Problem>()
    for (const ways of NUMBER_WAYS) {
      // Each bullet that has one way and not the other.
      const written = bullets.flatMap((placed): (PlacedBullet & { way: "digit" | "word"; found: string })[] => {
        const digit = ways.digit.exec(placed.bullet.text)?.[0]
        const word = ways.word.exec(placed.bullet.text)?.[0]
        if (digit && !word) return [{ ...placed, way: "digit", found: digit }]
        return word && !digit ? [{ ...placed, way: "word", found: word }] : []
      })
      const usual = mostCommon(written.map(({ way }) => way))
      for (const { place, bullet, way, found } of written) {
        const key = `${fieldOf(place)}|${bullet.line}|${place.kind === "entry" ? `${place.section}.${place.entry}` : ""}`
        if (way === usual || problems.has(key)) continue
        problems.set(key, {
          place,
          message: `“${found.trim()}” here, ${ways.elsewhere[usual!]} elsewhere`,
          suggestion: `Write “${way === "word" ? ways.asDigit(found) : ways.asWord(found)}”.`,
        })
      }
    }
    return { checked: bullets.length, problems: [...problems.values()] }
  },
}

export const POLISH_RULES: readonly Rule[] = [endings, capitalStarts, oneWay, spacing, allCaps, shorthand, numbersOneWay]
