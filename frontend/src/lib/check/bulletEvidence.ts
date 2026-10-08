// Conservative cues for coaching, not a semantic assessment of an accomplishment.
// Numeric identifiers do not establish scope, and qualitative results need no number.

import { BULLET_GENERIC_WORDS, BULLET_SCOPE_NOUNS, NUMBER_UNITS, NUMBER_WORDS } from "./settings"
import { escaped, opening } from "./text"
import { verbAtStart } from "./verbs"

const count = `(?:\\d[\\d,.]*(?:[kmb])?|${NUMBER_WORDS.map(escaped).join("|")})`
// "in" is too often a preposition after a year to use as an inch unit here.
const unit = NUMBER_UNITS.filter((word) => word !== "in")
  .map(escaped)
  .join("|")
const scope = BULLET_SCOPE_NOUNS.map(escaped).join("|")
const quantity = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])${count}\\s*\\+?\\s*(?:(?:${unit})|(?:[\\p{L}-]+\\s+){0,2}(?:${scope}))\\b|${count}\\s*%|[$€£]\\s*${count}`,
  "iu",
)
const changed = /\b(?:doubled|tripled|halved)\b/i

export function hasScope(text: string): boolean {
  // Strip versions, standards, dates and labeled identifiers before looking
  // for quantities. An adjacent digit alone (CSS3) never matches a quantity.
  const withoutLabels = text
    .replace(
      /\b(?:version|release|v|ISO|RFC|SOC|HTTP|WCAG|Python|Java|HTML|CSS|OAuth|Web|Windows|ticket|issue|case|ID)\s*#?\s*\d[\w.-]*/gi,
      "",
    )
    .replace(/\b\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, "")
    .replace(/\b(?:in|during|since|until|through|year)\s+(?:19|20)\d{2}\b/gi, "")
  return quantity.test(withoutLabels) || changed.test(withoutLabels)
}

export function hasOutcome(text: string): boolean {
  return (
    /\b(?:reduc(?:e[ds]?|ing)|increas(?:e[ds]?|ing)|improv(?:e[ds]?|ing)|restor(?:e[ds]?|ing)|resolv(?:e[ds]?|ing)|eliminat(?:e[ds]?|ing)|prevent(?:s|ed|ing)?|enabl(?:e[ds]?|ing)|unblock(?:s|ed|ing)?|cut(?:s|ting)?|sav(?:e[ds]?|ing)|grew|grow(?:s|ing)?|rais(?:e[ds]?|ing))\s+\S+/i.test(
      text,
    ) ||
    /\b(?:adopted (?:as|by)|used by|selected (?:as|for)|so (?:that )?\w+ could|result(?:ed|ing|s)? in|led to|allow(?:ed|s|ing) \w+ to)\b/i.test(
      text,
    )
  )
}

const genericWords = new Set(BULLET_GENERIC_WORDS)

/** Only an action followed entirely by generic filler is diagnosed as lacking detail. */
export function isGenericBullet(text: string): boolean {
  // A word that looks generic may be an intentional product or code name.
  if (/["“][^"”]+["”]|`[^`]+`|(?:^|\s)['‘][^'’]+['’](?=$|[\s.,;:!?])/u.test(text)) return false
  const action = verbAtStart(text)
  if (!action) return false
  const start = opening(text)
  const at = start.toLowerCase().indexOf(action.word.toLowerCase())
  const words =
    start
      .slice(at + action.word.length)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  return words.length === 0 || words.every((word) => genericWords.has(word) || /^\d+$/.test(word) || NUMBER_WORDS.includes(word))
}
