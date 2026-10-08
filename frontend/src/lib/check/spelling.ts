// Spelling & grammar (G1–G7 in issue #66). Harper, the grammar checker, reads
// each piece of typed text (grammar.ts); these rules decide what counts, so a
// resume's own names and tech words aren't taken for typos. G5 and G6 are our
// own, and read the form.

import type { GrammarLint, GrammarReading, Problem, Rule } from "./engine"
import { fieldOf, LINK_FIELDS, type Place } from "./places"
import { DATE_FIELDS, hasEnded } from "./readDate"
import { textsOf, type ResumeView } from "./resume"
import {
  ACRONYMS,
  ACTION_VERBS,
  DEGREE_ABBREVIATIONS,
  FINE_TWICE,
  GRAMMAR_KINDS_OFF,
  GRAMMAR_RULES,
  LEAD_OBJECTS,
  LOOSE_FOR_LOSE,
  LOWERCASE_NAMES,
  MIN_SKILL_SLIP,
  MIN_TECH_SLIP,
  NAME_FIELDS,
  NUMBER_UNITS,
  RESUME_WORDS,
  SHORTHAND,
  SKILL_FIELDS,
  TECH_NAMES,
  TECH_WORDS,
  US_STATES,
} from "./settings"
import { bulletsIn, firstWord, oneSlipApart, typedSlip } from "./text"
import { thirdPersonOf, verbOf } from "./verbs"

// Fields that aren't words, so spelling and grammar skip them: links, emails,
// phone numbers, dates and GPAs.
const NOT_WORDS = new Set([
  ...LINK_FIELDS,
  ...Object.values(DATE_FIELDS).flatMap((fields) => ("single" in fields ? [fields.single] : [fields.start, fields.end])),
  "phoneNumber",
  "gpa",
])
const NAMES: ReadonlySet<string> = new Set(NAME_FIELDS)
const SKILLS: ReadonlySet<string> = new Set(SKILL_FIELDS)

/**
 * The typed text the grammar checker reads: every field and bullet except
 * links, dates and the like, and the names the resume gives things, but for
 * the skills.
 */
export function grammarTexts(view: ResumeView): { place: Place; text: string }[] {
  // Each rule asks, and so does the editor, so it's worked out once a check.
  let texts = textsFor.get(view)
  if (!texts) {
    texts = textsOf(view).filter(({ place }) => {
      const field = fieldOf(place)
      return field === undefined || (!NOT_WORDS.has(field) && (!NAMES.has(field) || SKILLS.has(field)))
    })
    textsFor.set(view, texts)
  }
  return texts
}

const textsFor = new WeakMap<ResumeView, { place: Place; text: string }[]>()

// A word, with the dots, hyphens and symbols names have: "Node.js", "C++", "B.S.".
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’.+#&-]*/gu

// Each word whole and in its pieces, as the grammar checker reads them: it
// splits "Node.js" into "Node" and "js", and "Ph.D." into "Ph" and "D".
const wordsIn = (text: string) =>
  (text.match(WORD) ?? []).flatMap((word) => {
    const whole = word
      .replace(/['’]s$/, "")
      .replace(/[.'’-]+$/, "")
      .toLowerCase()
    return [whole, ...whole.split(/[-/.]/)]
  })

// Words that are spelled right without being in the dictionary: tech names
// and words, Latin honors, acronyms, degrees, places, units, shorthand (P6's),
// and every form of the action verbs.
const ALWAYS_KNOWN: ReadonlySet<string> = new Set(
  [
    ...TECH_NAMES,
    // As G6 knows them without their dots ("nodejs"), so they're G6's, not typos.
    ...TECH_NAMES.map((name) => name.replace(/\./g, "")),
    ...TECH_WORDS,
    ...RESUME_WORDS,
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

/**
 * The words this resume counts as spelled right: its own names, the words
 * added with "Add word", and ALWAYS_KNOWN. Without `skills`, the skills'
 * words aren't among them, so the skills themselves can be checked.
 */
export function knownWords(view: ResumeView, added: ReadonlySet<string>, skills = true): ReadonlySet<string> {
  const isName = (field: string) => NAMES.has(field) && (skills || !SKILLS.has(field))
  const names = [
    ...Object.entries(view.profile)
      .filter(([field]) => isName(field))
      .map(([, value]) => value),
    ...Object.values(view.sections).flatMap((entries) =>
      entries.flatMap((entry) =>
        Object.entries(entry.values)
          .filter(([field]) => isName(field))
          .map(([, value]) => value),
      ),
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

// Tech names long enough to tell a slip in them from another word, in lower case.
const TECH_SLIPS = TECH_NAMES.filter((name) => name.length >= MIN_TECH_SLIP).map((name) => [name.toLowerCase(), name] as const)

/**
 * The tech name a word is one slip from, if it is: "TypeScript" for
 * "TypeScirpt". The name itself, however it's written, is G6's, and a word
 * that's known isn't a slip.
 */
function slipOfTechName(word: string, isKnown: (word: string) => boolean): string | undefined {
  const lower = word.toLowerCase()
  if (lower.length < MIN_TECH_SLIP || /\p{N}/u.test(lower) || TECH.has(lower) || isKnown(lower)) return undefined
  return TECH_SLIPS.find(([name]) => oneSlipApart(lower, name))?.[1]
}

// The texts the grammar checker has read so far, with what it found, and
// whether some it hasn't read yet; the skills too, with `skills`.
function linted(resume: ResumeView, grammar: GrammarReading, skills: boolean) {
  const texts = grammarTexts(resume).filter(({ place }) => skills || !SKILLS.has(fieldOf(place) ?? ""))
  const read = texts.flatMap(({ place, text }) => {
    const lints = grammar.get(text)
    return lints ? [{ place, text, lints }] : []
  })
  return { read, partial: read.length < texts.length }
}

const quoted = (text: string) => text.replace(/`([^`]*)`/g, "“$1”")

// What comes after a lint in its text: "API" after the "a" in "a API".
const wordAfter = (text: string, lint: GrammarLint) => text.slice(lint.start + lint.text.length).match(/^\s+([^\s,;.]+)/)?.[1] ?? ""

// A rule over what Harper found: `problemsOf` says what each lint means for
// it, if anything, and `alsoIn` finds more in a text on its own. The skills
// are lists, not sentences, so only a rule that `readsSkills` gets them.
function grammarRule(
  info: Omit<Extract<Rule, { reads: "grammar" }>, "reads" | "check">,
  problemsOf: (lint: GrammarLint, text: string, known: () => ReadonlySet<string>, inSkills: boolean) => Omit<Problem, "place">[],
  {
    alsoIn = () => [],
    readsSkills = false,
  }: { alsoIn?: (text: string, lints: readonly GrammarLint[]) => Omit<Problem, "place">[]; readsSkills?: boolean } = {},
): Rule {
  return {
    ...info,
    reads: "grammar",
    check: ({ resume, grammar, words }) => {
      const { read, partial } = linted(resume, grammar, readsSkills)
      if (read.length === 0) return null
      let known: ReadonlySet<string> | undefined
      let knownBeside: ReadonlySet<string> | undefined
      const knownNow = () => (known ??= knownWords(resume, words))
      // In the skills, their own words aren't known, or nothing there would be checked.
      const knownBesideSkills = () => (knownBeside ??= knownWords(resume, words, false))
      return {
        checked: read.length,
        problems: read.flatMap(({ place, text, lints }) => {
          const inSkills = SKILLS.has(fieldOf(place) ?? "")
          const knownHere = inSkills ? knownBesideSkills : knownNow
          return [...lints.flatMap((lint) => problemsOf(lint, text, knownHere, inSkills)), ...alsoIn(text, lints)].map((problem) => ({
            place,
            ...problem,
          }))
        }),
        ...(partial && { partial }),
      }
    },
  }
}

const OURS = new Set(Object.values(GRAMMAR_RULES).flat())
const KINDS_OFF = new Set(GRAMMAR_KINDS_OFF)

const typos = grammarRule(
  { id: "G1", category: "spelling", level: "fix", title: "No typos", why: "A typo is one of the first things a recruiter notices." },
  (lint, _text, known, inSkills) => {
    if (!GRAMMAR_RULES.typos.includes(lint.rule)) return []
    // A slip in a tech name ("TypeScirpt") is a typo, though capitals inside make it look like a name.
    const name = slipOfTechName(lint.text, (word) => known().has(word))
    if (!name && !isTypo(lint.text, known())) return []
    // The skills are mostly names Harper doesn't know ("Redux", "Kanban"), so
    // there a word is only a typo when it's a slip in typing one it offers.
    const instead = name ?? (inSkills ? slipInSkills(lint) : lint.suggestions[0])
    if (inSkills && !instead) return []
    return [
      {
        text: lint.text,
        message: `“${lint.text}” may be misspelled`,
        suggestion: instead ? `Try “${instead}”. If it's spelled right, add the word.` : "Check the spelling. If it's right, add the word.",
      },
    ]
  },
  { readsSkills: true },
)

// The word Harper offers that a word in the skills is a slip in typing, if
// it's long enough to tell from a name: "Communication" for "Comunication".
const slipInSkills = (lint: GrammarLint) =>
  lint.text.length >= MIN_SKILL_SLIP ? lint.suggestions.find((suggestion) => typedSlip(lint.text, suggestion)) : undefined

const repeated = grammarRule(
  {
    id: "G2",
    category: "spelling",
    level: "fix",
    title: "No word written twice in a row",
    why: "It reads as a slip, and was easy to miss while editing.",
  },
  (lint) => {
    const words = lint.text.split(/\s+/)
    // A name ("Walla Walla", "Bora Bora"), or a word that can be right twice ("had had").
    if (
      !GRAMMAR_RULES.repeated.includes(lint.rule) ||
      words.every((word) => /^\p{Lu}/u.test(word)) ||
      FINE_TWICE.includes(words[0].toLowerCase())
    )
      return []
    return [{ text: lint.text, message: `“${words[0]}” twice in a row`, suggestion: "Delete one." }]
  },
)

// An acronym starting with a letter whose name starts with a vowel sound: "F" is "eff", "S" is "ess".
const LETTER_BY_LETTER = /^[AEFHILMNORSX][A-Z0-9]*$/

const aAn = grammarRule(
  {
    id: "G3",
    category: "spelling",
    level: "fix",
    title: "“A” and “an” used right",
    why: "“An” goes before a vowel sound, “a” before the rest: “an API”, “a user”.",
  },
  (lint, text) => {
    const instead = lint.suggestions[0]
    if (!GRAMMAR_RULES.aAn.includes(lint.rule) || !instead) return []
    const next = wordAfter(text, lint)
    // Before an acronym said letter by letter from one with a vowel sound
    // ("an SEO audit", "an FAQ"), "an" is right; Harper can take it for a word.
    if (instead.toLowerCase() === "a" && LETTER_BY_LETTER.test(next)) return []
    return [
      {
        text: `${lint.text} ${next}`.trim(),
        message: next ? `“${lint.text} ${next}” should be “${instead} ${next}”` : `Should be “${instead}”`,
      },
    ]
  },
)

const mixUps = grammarRule(
  {
    id: "G4",
    category: "spelling",
    level: "fix",
    title: "No mixed-up words, like its and it's",
    why: "Its/it's, their/there, then/than and lose/loose are easy to swap, and change what a sentence says.",
  },
  (lint) => {
    const instead = lint.suggestions[0]
    if (!GRAMMAR_RULES.mixUps.includes(lint.rule) || !instead) return []
    return [{ text: lint.text, message: `“${lint.text}” should be “${instead}” here` }]
  },
  {
    // "loose" where "lose" is meant, which Harper doesn't find on its own,
    // unless it already has.
    alsoIn: (text, lints) =>
      [...text.matchAll(LOOSE_FOR_LOSE)].flatMap((match) => {
        const at = match.index + match[0].length - match[1].length
        const found = lints.some(
          (lint) => GRAMMAR_RULES.mixUps.includes(lint.rule) && lint.start <= at && at < lint.start + lint.text.length,
        )
        return found ? [] : [{ text: match[1], message: `“${match[1]}” should be “lose” here` }]
      }),
  },
)

// "lead" after "and", "then" or a comma, joined to what came before.
const LEAD = /(?:\band|\bthen|,)\s+(lead)\b/gi
const OBJECTS = new Set(LEAD_OBJECTS)

// Whether a "lead" is the verb: what was led follows it ("and lead the
// migration", "and lead 4 engineers"), or another verb in the past does
// ("Planned, lead and shipped"). Otherwise it may be the metal or a sales
// lead: "arsenic and lead", "conversion and lead quality".
function leadIsVerb(after: string): boolean {
  const next = after.match(/^\s+([\p{L}\p{N}'’-]+)/u)?.[1].toLowerCase()
  if (next && (OBJECTS.has(next) || /^\p{N}/u.test(next))) return true
  const verb = after.match(/^\s*,?\s*(?:and\s+|,\s*)([\p{L}'’-]+)/u)?.[1]
  return verb !== undefined && verbOf(verb)?.tense === "past"
}

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
        [...bullet.text.matchAll(LEAD)]
          .filter((match) => leadIsVerb(bullet.text.slice(match.index + match[0].length)))
          .map(() => ({ place, text: "lead", message: "“lead” should be “led” here", suggestion: "The past tense of “lead” is “led”." })),
      ),
    }
  },
}

// Each tech name by how it's spelled in lower case, and without its dots
// ("nodejs" for "Node.js").
const TECH = new Map(
  TECH_NAMES.flatMap((name) => [
    [name.toLowerCase(), name],
    [name.toLowerCase().replace(/\./g, ""), name],
  ]),
)

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
  {
    id: "G7",
    category: "spelling",
    level: "look",
    title: "No other grammar mistakes",
    why: "The grammar checker found something that may be wrong.",
  },
  (lint) => {
    if (OURS.has(lint.rule) || KINDS_OFF.has(lint.kind)) return []
    const instead = lint.suggestions[0]
    return [{ text: lint.text, message: quoted(lint.message), ...(instead && { suggestion: `Try “${instead}”.` }) }]
  },
)

export const SPELLING_RULES: readonly Rule[] = [typos, repeated, aAn, mixUps, ledNotLead, techNames, otherGrammar]
