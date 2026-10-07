// Bullets (B1–B9 in issue #58): how each one starts, what's in it, and how
// many a job has. Every finding points at the bullet it's about.

import type { SectionName } from "@/components/editor/sections"
import type { Problem, Rule } from "./engine"
import { compareDates, datesOf, latestOf, type ResumeDate } from "./readDate"
import type { Entry } from "./resume"
import {
  BULLETS_WITH_NUMBERS,
  BUZZWORDS,
  MAX_BULLETS,
  MIN_BULLETS_FOR_NUMBERS,
  NEAR_DUPLICATE_LENGTH,
  NUMBER_WORDS,
  SAME_START,
  VAGUE_WORDS,
  WEAK_STARTS,
} from "./settings"
import { bulletsIn, escaped, firstWord, mostCommon, opening } from "./text"
import { alternativesTo, inTenseOf, verbOf } from "./verbs"

// Jobs and roles, whose bullets say what the person did. A project's bullets
// often say what the project is instead ("Interactive map of…"), so they're
// left out of the rules about verbs.
const ROLES: SectionName[] = ["Work", "Leadership", "Volunteership"]

const WEAK = new RegExp(`^(${WEAK_STARTS.map(escaped).join("|")})\\b`, "i")

/** "I", "me", "my", "we" or "our" in a bullet, as written; null if there's none. */
export function pronounIn(text: string): string | null {
  for (const match of text.matchAll(/\b(I|i|me|my|we|our|Me|My|We|Our)\b/g)) {
    const word = match[0]
    const before = text.slice(0, match.index)
    const after = text.slice(match.index + word.length)
    // "I/O", "i.e.", "I-V curve": part of something else.
    if (/^[/&.-]\w/.test(after)) continue
    // "Phase I", "Level I": a numeral after a capitalized word, other than the first.
    if (word === "I" && /\S\s+\p{Lu}\p{L}*\s+$/u.test(before)) continue
    // "Save Our Seas": a capital in the middle of a sentence is part of a name.
    if (/^\p{Lu}/u.test(word) && word !== "I" && before.trim() !== "" && !/[.!?]\s*$/.test(before)) continue
    return word
  }
  return null
}

const weakStarts: Rule = {
  id: "B1",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "No weak starts like “Responsible for”",
  why: "They describe a duty, not what you did.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length === 0) return null
    return {
      checked: bullets.length,
      problems: bullets.flatMap(({ bullet, place }) => {
        const found = WEAK.exec(opening(bullet.text))
        return found ? [{ place, message: `“${found[1]}” is a weak start`, suggestion: "Start with what you did, like “Led” or “Built”." }] : []
      }),
    }
  },
}

const actionVerbs: Rule = {
  id: "B2",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "Bullets start with an action verb",
  why: "Starting with a verb puts what you did first.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume, ROLES)
    if (bullets.length === 0) return null
    return {
      checked: bullets.length,
      problems: bullets.flatMap(({ bullet, place }) => {
        const text = opening(bullet.text)
        // A number first ("50% faster…") is fine; weak starts and "I" have rules of their own.
        if (!text || /^\p{N}/u.test(text) || WEAK.test(text) || pronounIn(firstWord(text)) !== null) return []
        return verbOf(firstWord(text)) ? [] : [{ place, message: "Doesn't start with an action verb", suggestion: "Start with what you did, like “Built” or “Led”." }]
      }),
    }
  },
}

const NUMBER = new RegExp(String.raw`\p{N}|[%$€£]|\b(?:${NUMBER_WORDS.join("|")})\b`, "iu")

const numbers: Rule = {
  id: "B3",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "About half your bullets have a number",
  why: "Numbers show how big your work was: how much, how many, how fast.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length < MIN_BULLETS_FOR_NUMBERS) return null
    const without = bullets.filter(({ bullet }) => !NUMBER.test(bullet.text))
    const share = (bullets.length - without.length) / bullets.length
    if (share >= BULLETS_WITH_NUMBERS) return { checked: bullets.length, problems: [] }
    // One finding for the resume, in the section with the most bullets to add one to.
    const section = mostCommon(without.map(({ entry }) => entry.section))!
    return {
      checked: bullets.length,
      credit: share / BULLETS_WITH_NUMBERS,
      problems: [
        {
          place: { kind: "section", section },
          message: `${bullets.length - without.length} of ${bullets.length} bullets have a number`,
          suggestion: "Add how much, how many or how fast where you can. About half is a good aim.",
        },
      ],
    }
  },
}

const pronouns: Rule = {
  id: "B4",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "No “I”, “me”, “my”, “we” or “our”",
  why: "A resume is about you, so it leaves them out.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length === 0) return null
    return {
      checked: bullets.length,
      problems: bullets.flatMap(({ bullet, place }) => {
        const word = pronounIn(bullet.text)
        return word ? [{ place, message: `Uses “${word}”`, suggestion: "Leave it out: “Built…” rather than “I built…”." }] : []
      }),
    }
  },
}

const BUZZ = new RegExp(String.raw`(?<![\w-])(${BUZZWORDS.map(escaped).join("|")})(?![\w-])`, "i")
const VAGUE = new RegExp(String.raw`(?<![\w-])(${VAGUE_WORDS.map(escaped).join("|")})(?![\w-])`, "i")

const buzzwords: Rule = {
  id: "B5",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "No buzzwords or vague words",
  why: "Words anyone could claim say less than what you did.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length === 0) return null
    return {
      checked: bullets.length,
      problems: bullets.flatMap(({ bullet, place }): Problem[] => {
        const buzz = BUZZ.exec(bullet.text)
        if (buzz) return [{ place, message: `“${buzz[1]}” says little on its own`, suggestion: "Show it with what you did instead." }]
        const vague = VAGUE.exec(bullet.text)
        return vague ? [{ place, message: `“${vague[1]}” is vague`, suggestion: "Say which ones, or how many." }] : []
      }),
    }
  },
}

const sameStart: Rule = {
  id: "B6",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "Varied opening verbs",
  why: "Different verbs read better, and say more about what you did.",
  check: ({ resume }) => {
    const starts = bulletsIn(resume).flatMap((placed) => {
      const word = firstWord(placed.bullet.text)
      const verb = verbOf(word)
      return verb && verb.tense !== "ing" ? [{ ...placed, word, verb }] : []
    })
    if (starts.length < SAME_START) return null
    const totals = new Map<string, number>()
    for (const { verb } of starts) totals.set(verb.base, (totals.get(verb.base) ?? 0) + 1)
    const seen = new Map<string, number>()
    const problems: Problem[] = []
    for (const { place, word, verb } of starts) {
      const count = (seen.get(verb.base) ?? 0) + 1
      seen.set(verb.base, count)
      // The first two are fine; from the third on, each gets other verbs to try.
      if (count < SAME_START) continue
      const others = alternativesTo(verb)
      problems.push({
        place,
        message: `“${word}” starts ${totals.get(verb.base)} bullets`,
        suggestion: others.length ? `Try ${others.map((other) => `“${other}”`).join(", ").replace(/, ([^,]*)$/, " or $1")}.` : "Try a different verb.",
      })
    }
    return { checked: starts.length, problems }
  },
}

const pastTense: Rule = {
  id: "B7",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "Past tense for what has ended",
  why: "The present tense says you still do it.",
  check: ({ resume, today }) => {
    const now: ResumeDate = { present: false, year: today.getFullYear(), month: today.getMonth() + 1, style: { kind: "number" }, shortYear: false }
    const ended = new Map<Entry, boolean>()
    const hasEnded = (entry: Entry) => {
      if (!ended.has(entry)) {
        const end = datesOf(entry).end?.date
        ended.set(entry, end !== undefined && !end.present && compareDates(latestOf(end), now) < 0)
      }
      return ended.get(entry)!
    }
    const bullets = bulletsIn(resume, ROLES).filter(({ entry }) => hasEnded(entry))
    if (bullets.length === 0) return null
    return {
      checked: bullets.length,
      problems: bullets.flatMap(({ bullet, place }) => {
        const word = firstWord(bullet.text)
        const verb = verbOf(word)
        if (verb?.tense !== "present" || !verb.past) return []
        return [{ place, message: `“${word}” is present tense, but this has ended`, suggestion: `Try “${inTenseOf(verb.base, { ...verb, tense: "past" })}”.` }]
      }),
    }
  },
}

const bulletCount: Rule = {
  id: "B8",
  category: "bullets",
  level: "look",
  reads: "form",
  title: `Every job has bullets, and no more than ${MAX_BULLETS}`,
  why: `Three to ${MAX_BULLETS} bullets give a job enough detail without burying the best of it.`,
  check: ({ resume }) => {
    const jobs = resume.sections.Work.filter((entry) => !entry.blank)
    if (jobs.length === 0) return null
    return {
      checked: jobs.length,
      problems: jobs.flatMap((entry): Problem[] => {
        if (entry.bullets.length === 0) {
          return [{ place: { kind: "entry", section: "Work", entry: entry.index, field: "workDescription" }, message: "No bullets", suggestion: "Add 3 or more lines on what you did." }]
        }
        if (entry.bullets.length <= MAX_BULLETS) return []
        const extra = entry.bullets[MAX_BULLETS]
        return [
          {
            place: { kind: "entry", section: "Work", entry: entry.index, field: extra.field, line: extra.line },
            message: `${entry.bullets.length} bullets`,
            suggestion: `Keep the ${MAX_BULLETS} that matter most.`,
          },
        ]
      }),
    }
  },
}

// A bullet as compared with others: lower case, without punctuation, but
// with the symbols that change what it says ("C++", "C#", "40%").
const comparable = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,;:!?"“”‘’'()[\]{}–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

// How many letters two texts differ by (adding, removing or changing one),
// or `limit + 1` once it's more than `limit`.
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    // No row gets better than the best in the one above it.
    if (Math.min(...current) > limit) return limit + 1
    previous = current
  }
  return previous[b.length]
}

const repeated: Rule = {
  id: "B9",
  category: "bullets",
  level: "look",
  reads: "form",
  title: "No bullet twice",
  why: "A repeated bullet takes room and looks like a slip.",
  check: ({ resume }) => {
    const bullets = bulletsIn(resume)
    if (bullets.length < 2) return null
    const seen: string[] = []
    const problems: Problem[] = []
    for (const { bullet, place } of bullets) {
      const text = comparable(bullet.text)
      if (!text) continue
      // A letter or two apart in a long bullet, as "account" and "accounts", is a copy.
      const limit = Math.floor(text.length / NEAR_DUPLICATE_LENGTH)
      const closest = Math.min(...seen.map((other) => distance(text, other, limit)), limit + 1)
      if (closest <= limit) {
        problems.push({ place, message: closest === 0 ? "Same as another bullet" : "Almost the same as another bullet", suggestion: "Change or delete one of them." })
      }
      seen.push(text)
    }
    return { checked: bullets.length, problems }
  },
}

export const BULLET_RULES: readonly Rule[] = [weakStarts, actionVerbs, numbers, pronouns, buzzwords, sameStart, pastTense, bulletCount, repeated]
