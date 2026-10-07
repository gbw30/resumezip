// Spelling & grammar (G1–G7 in issue #66). Harper, the grammar checker, reads
// each piece of typed text (grammar.ts); these rules decide what counts, so a
// resume's own names and tech words aren't taken for typos. G5 and G6 are our
// own, and read the form.

import type { GrammarLint, GrammarReading, Problem, Rule } from "./engine"
import type { Place } from "./places"
import { hasEnded } from "./readDate"
import { textsOf, type ResumeView } from "./resume"
import {
  ACRONYMS,
  ACTION_VERBS,
  DEGREE_ABBREVIATIONS,
  GRAMMAR_KINDS_OFF,
  GRAMMAR_RULES,
  LEAD_AS_NOUN,
  LOOSE_FOR_LOSE,
  LOWERCASE_NAMES,
  NAME_FIELDS,
  NOT_WORDS_FIELDS,
  NUMBER_UNITS,
  SHORTHAND,
  TECH_NAMES,
  TECH_WORDS,
  US_STATES,
} from "./settings"
import { bulletsIn, escaped, firstWord } from "./text"
import { thirdPersonOf, verbOf } from "./verbs"

const NOT_WORDS = new Set(NOT_WORDS_FIELDS)
const NAMES = new Set(NAME_FIELDS)

const fieldOf = (place: Place) => (place.kind === "profile" || place.kind === "entry" ? place.field : undefined)

/**
 * The typed text the grammar checker reads: every field and bullet except
 * links, dates and the like, and the names the resume gives things.
 */
export function grammarTexts(view: ResumeView): { place: Place; text: string }[] {
  return textsOf(view).filter(({ place }) => {
    const field = fieldOf(place)
    return field === undefined || (!NOT_WORDS.has(field) && !NAMES.has(field))
  })
}

// A word, with the dots, hyphens and symbols names have: "Node.js", "C++", "B.S.".
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’.+#&-]*/gu

const wordsIn = (text: string) =>
  (text.match(WORD) ?? []).flatMap((word) => {
    const whole = word.replace(/['’]s$/, "").replace(/[.'’-]+$/, "").toLowerCase()
    return [whole, ...whole.split(/[-/]/)]
  })

// Words that are spelled right without being in the dictionary: tech names
// and words, acronyms, degrees, places, units, shorthand (P6's), and every
// form of the action verbs.
const ALWAYS_KNOWN: ReadonlySet<string> = new Set(
  [
    ...TECH_NAMES,
    ...TECH_WORDS,
    ...ACRONYMS,
    ...LOWERCASE_NAMES,
    ...DEGREE_ABBREVIATIONS.flat(),
    ...US_STATES.flat(),
    ...NUMBER_UNITS,
    ...SHORTHAND.map(([short]) => short),
    ...ACTION_VERBS.split(",").flatMap((pair) => {
      const [base, past] = pair.trim().split(/\s+/)
      return base && past ? [base, past, thirdPersonOf(base)] : []
    }),
  ].flatMap(wordsIn),
)

/** The words this resume counts as spelled right: its own names, the words added with "Add word", and ALWAYS_KNOWN. */
export function knownWords(view: ResumeView, added: ReadonlySet<string>): ReadonlySet<string> {
  const names = [
    ...Object.entries(view.profile).filter(([field]) => NAMES.has(field)).map(([, value]) => value),
    ...Object.values(view.sections).flatMap((entries) =>
      entries.flatMap((entry) => Object.entries(entry.values).filter(([field]) => NAMES.has(field)).map(([, value]) => value)),
    ),
  ]
  return new Set([...ALWAYS_KNOWN, ...names.flatMap(wordsIn), ...[...added].flatMap(wordsIn)])
}

/**
 * Whether a word the grammar checker doesn't know is a typo. Names written
 * with capitals inside ("DuckDB", "eBPF") or all in capitals, words with
 * digits, initials, and abbreviations with dots inside ("B.S.") aren't.
 */
export function isTypo(word: string, known: ReadonlySet<string>): boolean {
  const bare = word.replace(/['’]s$/, "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "")
  if (bare.replace(/\./g, "").length < 2) return false
  if (/\p{N}/u.test(bare) || /\p{Lu}/u.test(bare.slice(1)) || /\.\p{L}/u.test(bare)) return false
  const lower = bare.toLowerCase()
  return !known.has(lower) && !known.has(lower.replace(/\.$/, ""))
}

// The texts the grammar checker has read so far, with what it found.
function linted(resume: ResumeView, grammar: GrammarReading) {
  return grammarTexts(resume).flatMap(({ place, text }) => {
    const lints = grammar.get(text)
    return lints ? [{ place, text, lints }] : []
  })
}

const quoted = (text: string) => text.replace(/`([^`]*)`/g, "“$1”")

// What comes after a lint in its text: "API" after the "a" in "a API".
function wordAfter(text: string, lint: GrammarLint): string {
  const after = Array.from(text)
    .slice(lint.start + Array.from(lint.text).length)
    .join("")
  return after.match(/^\s+([^\s,;.]+)/)?.[1] ?? ""
}

// A rule over what Harper found: `problemsOf` says what each lint means for
// it, if anything, and `alsoIn` finds more in a text on its own.
function grammarRule(
  info: Omit<Extract<Rule, { reads: "grammar" }>, "reads" | "check">,
  problemsOf: (lint: GrammarLint, text: string, known: () => ReadonlySet<string>) => Omit<Problem, "place">[],
  alsoIn: (text: string) => Omit<Problem, "place">[] = () => [],
): Rule {
  return {
    ...info,
    reads: "grammar",
    check: ({ resume, grammar, words }) => {
      const read = linted(resume, grammar)
      if (read.length === 0) return null
      let known: ReadonlySet<string> | undefined
      const knownNow = () => (known ??= knownWords(resume, words))
      return {
        checked: read.length,
        problems: read.flatMap(({ place, text, lints }) =>
          [...lints.flatMap((lint) => problemsOf(lint, text, knownNow)), ...alsoIn(text)].map((problem) => ({ place, ...problem })),
        ),
      }
    },
  }
}

const OURS = new Set(Object.values(GRAMMAR_RULES).flat())
const KINDS_OFF = new Set(GRAMMAR_KINDS_OFF)

const typos = grammarRule(
  { id: "G1", category: "spelling", level: "fix", title: "No typos", why: "A typo is one of the first things a recruiter notices." },
  (lint, _text, known) => {
    if (!GRAMMAR_RULES.typos.includes(lint.rule) || !isTypo(lint.text, known())) return []
    const instead = lint.suggestions[0]
    return [
      {
        text: lint.text,
        message: `“${lint.text}” may be misspelled`,
        suggestion: instead ? `Try “${instead}”. If it's spelled right, add the word.` : "Check the spelling. If it's right, add the word.",
      },
    ]
  },
)

const repeated = grammarRule(
  { id: "G2", category: "spelling", level: "fix", title: "No word written twice in a row", why: "It reads as a slip, and was easy to miss while editing." },
  (lint) => {
    if (!GRAMMAR_RULES.repeated.includes(lint.rule)) return []
    return [{ text: lint.text, message: `“${lint.text.split(/\s+/)[0]}” twice in a row`, suggestion: "Delete one." }]
  },
)

const aAn = grammarRule(
  { id: "G3", category: "spelling", level: "fix", title: "“A” and “an” used right", why: "“An” goes before a vowel sound, “a” before the rest: “an API”, “a user”." },
  (lint, text) => {
    const instead = lint.suggestions[0]
    if (!GRAMMAR_RULES.aAn.includes(lint.rule) || !instead) return []
    const next = wordAfter(text, lint)
    return [{ text: `${lint.text} ${next}`.trim(), message: next ? `“${lint.text} ${next}” should be “${instead} ${next}”` : `Should be “${instead}”` }]
  },
)

const mixUps = grammarRule(
  { id: "G4", category: "spelling", level: "fix", title: "No mixed-up words, like its and it's", why: "Its/it's, their/there, then/than and lose/loose are easy to swap, and change what a sentence says." },
  (lint) => {
    const instead = lint.suggestions[0]
    if (!GRAMMAR_RULES.mixUps.includes(lint.rule) || !instead) return []
    return [{ text: lint.text, message: `“${lint.text}” should be “${instead}” here` }]
  },
  // "loose" where "lose" is meant, which Harper doesn't find on its own.
  (text) => [...text.matchAll(LOOSE_FOR_LOSE)].map((match) => ({ text: match[1], message: `“${match[1]}” should be “lose” here` })),
)

// "lead" after "and", "then" or a comma, joined to what came before:
// "Designed and lead the migration". A noun after it makes it a noun
// ("and lead generation").
const LEAD = new RegExp(String.raw`(?:\band|\bthen|,)\s+(lead)\b(?!\s+(?:${LEAD_AS_NOUN.map(escaped).join("|")})\b)`, "gi")

const ledNotLead: Rule = {
  id: "G5",
  category: "spelling",
  level: "fix",
  reads: "form",
  title: "“Led”, not “lead”, for what's done",
  why: "The past tense of “lead” is “led”; “lead” is the metal, or the present.",
  check: ({ resume, today }) => {
    // Bullets about the past: in an entry that has ended, or starting with a verb in the past tense.
    const past = bulletsIn(resume).filter(({ entry, bullet }) => hasEnded(entry, today) || verbOf(firstWord(bullet.text))?.tense === "past")
    if (past.length === 0) return null
    return {
      checked: past.length,
      problems: past.flatMap(({ place, bullet }) =>
        [...bullet.text.matchAll(LEAD)].map(() => ({ place, text: "lead", message: "“lead” should be “led” here", suggestion: "The past tense of “lead” is “led”." })),
      ),
    }
  },
}

// Each tech name by how it's spelled in lower case, and without its dots
// ("nodejs" for "Node.js").
const TECH = new Map(TECH_NAMES.flatMap((name) => [[name.toLowerCase(), name], [name.toLowerCase().replace(/\./g, ""), name]]))

// A name, as written: letters and digits, with dots, "+", "#" and hyphens inside.
const NAME_TOKEN = /[\p{L}\p{N}+#][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]|[\p{L}\p{N}]/gu

const techNames: Rule = {
  id: "G6",
  category: "spelling",
  level: "look",
  reads: "form",
  title: "Tech names written the way their makers write them",
  why: "“Javascript” or “Github” suggests you don't use them much.",
  check: ({ resume }) => {
    const texts = textsOf(resume).filter(({ place }) => !NOT_WORDS.has(fieldOf(place) ?? ""))
    if (texts.length === 0) return null
    return {
      checked: texts.length,
      problems: texts.flatMap(({ place, text }) =>
        [...text.matchAll(NAME_TOKEN)].flatMap((match) => {
          const token = match[0]
          const name = TECH.get(token.toLowerCase())
          // Part of a handle or a link: "@github", "github/acme".
          const before = text[match.index - 1] ?? ""
          const after = text[match.index + token.length] ?? ""
          if (!name || name === token || /[@/]/.test(before) || /[@/]/.test(after)) return []
          return [{ place, text: token, message: `“${token}” is written “${name}”` }]
        }),
      ),
    }
  },
}

const otherGrammar = grammarRule(
  { id: "G7", category: "spelling", level: "look", title: "No other grammar mistakes", why: "The grammar checker found something that may be wrong." },
  (lint) => {
    if (OURS.has(lint.rule) || KINDS_OFF.has(lint.kind)) return []
    const instead = lint.suggestions[0]
    return [{ text: lint.text, message: quoted(lint.message), ...(instead && { suggestion: `Try “${instead}”.` }) }]
  },
)

export const SPELLING_RULES: readonly Rule[] = [typos, repeated, aAn, mixUps, ledNotLead, techNames, otherGrammar]
