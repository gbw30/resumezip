// Reads the verb a bullet starts with: which verb, and in what tense, so
// rules can ask for action verbs, varied ones, and the past tense for what
// has ended. The verbs are listed in settings.ts.

import { ACTION_VERBS, VERB_SYNONYMS } from "./settings"

/** A verb at the start of a bullet. */
export interface Verb {
  /** Its present form, in lower case ("build"), or the word itself for a past-tense verb that isn't listed. */
  base: string
  /** Its past form ("built"), when it's listed. */
  past?: string
  /**
   * The tense the word is in: "Build" and "Builds" are present, "Built" is
   * past, "Cut" can be either, and "Building" is neither.
   */
  tense: "present" | "past" | "either" | "ing"
  /** Written as "Builds", rather than "Build". */
  thirdPerson: boolean
}

const PAIRS = ACTION_VERBS.split(",")
  .map((pair) => pair.trim().split(/\s+/))
  .filter((pair) => pair.length === 2)
const PAST_OF = new Map(PAIRS.map(([base, past]) => [base, past]))
const BASE_OF_PAST = new Map(PAIRS.map(([base, past]) => [past, base]))

/** A verb's form for "he" or "she": "builds", "teaches", "studies". */
export function thirdPersonOf(base: string): string {
  if (/(s|x|z|ch|sh)$/.test(base)) return `${base}es`
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`
  return `${base}s`
}
const BASE_OF_THIRD = new Map(PAIRS.map(([base]) => [thirdPersonOf(base), base]))

function known(word: string): Verb | null {
  const past = PAST_OF.get(word)
  if (past !== undefined) return { base: word, past, tense: past === word ? "either" : "present", thirdPerson: false }
  const base = BASE_OF_PAST.get(word) ?? BASE_OF_THIRD.get(word)
  if (base === undefined) return null
  return BASE_OF_PAST.has(word)
    ? { base, past: word, tense: "past", thirdPerson: false }
    : { base, past: PAST_OF.get(base), tense: "present", thirdPerson: true }
}

/**
 * The verb a word is, if it is one: a listed verb in any form, or any word
 * ending in "-ed" or "-ing". British spellings ("optimise") count, and in
 * "Co-founded" the verb is after the hyphen.
 */
export function verbOf(word: string): Verb | null {
  const lower = word.toLowerCase().split("-").at(-1)!
  if (lower.length < 2) return null
  const american = lower.replace(/is(e|ed|es|ing)$/, "iz$1").replace(/ys(e|ed|es|ing)$/, "yz$1")
  const listed = known(lower) ?? known(american)
  if (listed) return listed
  if (lower.length >= 5 && lower.endsWith("ed")) return { base: lower, tense: "past", thirdPerson: false }
  if (lower.length >= 5 && lower.endsWith("ing")) return { base: lower, tense: "ing", thirdPerson: false }
  return null
}

const capital = (word: string) => word[0].toUpperCase() + word.slice(1)

/** A verb in the same tense and form as another, capitalized: "Built" → "Created". */
export function inTenseOf(base: string, like: Verb): string {
  const past = PAST_OF.get(base) ?? `${base.replace(/e$/, "")}ed`
  if (like.tense === "past") return capital(past)
  return capital(like.thirdPerson ? thirdPersonOf(base) : base)
}

/** Other verbs to use instead, in the same tense: "Built" → "Created", "Developed", "Engineered". */
export const alternativesTo = (verb: Verb) => (VERB_SYNONYMS[verb.base] ?? []).map((other) => inTenseOf(other, verb))
