// What the resume checker counts, and how much. Rule groups add their word
// lists and thresholds here too, so tuning the checker means changing this
// file only. See README.md.

/** The rubric's categories, in the order they're shown, and what each is worth in the score (100 in all). */
export const CATEGORIES = [
  { id: "contact", name: "Contact & personal details", points: 15 },
  { id: "readable", name: "Readable by hiring software", points: 15 },
  { id: "sections", name: "Sections & entries", points: 10 },
  { id: "dates", name: "Dates", points: 10 },
  { id: "bullets", name: "Bullets", points: 20 },
  { id: "length", name: "Length & layout", points: 10 },
  { id: "spelling", name: "Spelling & grammar", points: 15 },
  { id: "polish", name: "Polish", points: 5 },
] as const

export type CategoryId = (typeof CATEGORIES)[number]["id"]

/**
 * How sure a rule is. A "fix" is clearly wrong, so it can't be dismissed; a
 * "look" is a suggestion, and can be. In the score, a fix rule counts twice
 * as much as a look rule.
 */
export const LEVELS = {
  fix: { name: "Must fix", weight: 2 },
  look: { name: "Worth a look", weight: 1 },
} as const

export type Level = keyof typeof LEVELS

/** What every template guarantees, so it's always listed with the passed checks. */
export const AUTOMATIC_PASSES = [
  "Contact details are on the page itself, not in a header or footer",
  "Text reads in one order, top to bottom",
  "No tables or text boxes",
  "No images, icons or skill bars",
  "Standard fonts",
  "Real text that can be selected and copied",
  "The PDF's title is your name",
] as const

/** How many dismissed findings, and how many added words, a resume keeps. The oldest go first. */
export const MAX_DISMISSED = 500
export const MAX_WORDS = 500

/** Longer than this isn't a word, so "Add word" ignores it. */
export const MAX_WORD_LENGTH = 60

// Contact & personal details (C1–C10).

/** A phone number has at least this many digits; a leading "+" country code is fine. */
export const MIN_PHONE_DIGITS = 10

/**
 * The end of a LinkedIn link LinkedIn made up, rather than one the person
 * chose: a hyphen, then at least this many letters and digits, with a digit
 * among them ("jake-ryan-8a7b6c123").
 */
export const LINKEDIN_RANDOM_ENDING = 6

/** Words that make a street address, after a house number: "12 Elm St". */
export const STREET_WORDS = [
  "St", "Street", "Ave", "Avenue", "Rd", "Road", "Blvd", "Boulevard", "Dr", "Drive", "Ln", "Lane", "Way",
  "Ct", "Court", "Pl", "Place", "Pkwy", "Parkway", "Hwy", "Highway", "Ter", "Terrace", "Cir", "Circle",
]

/**
 * Personal details to leave off, and how they're usually written. Nationality,
 * citizenship and clearance are never flagged: roles that need a security
 * clearance ask for them.
 */
export const PERSONAL_DETAILS = [
  {
    name: "date of birth",
    pattern: /\b(date of birth|birth ?date|D\.?O\.?B\b)|\bborn\s+((on|in)\s+)?(\d|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d)/i,
  },
  { name: "age", pattern: /\bage\s*:\s*\d|\b\d{2}\s*(years|yrs)\.?\s*old\b|\byears of age\b/i },
  { name: "gender", pattern: /\b(gender|sex)\s*:/i },
  { name: "marital status", pattern: /\bmarital status\b|\b(married|divorced|widowed)\b/i },
] as const

/** A Social Security number, as it's usually written. */
export const SSN = /\b\d{3}-\d{2}-\d{4}\b/

// Sections & entries (S1–S9).

/** A skills line with this many items or more reads as a list to skim past. */
export const MAX_SKILLS_PER_LINE = 15

/** More courses than this, and the ones that matter get lost. */
export const MAX_COURSES = 8

/** A school whose college graduation is this many school years away or more is a freshman's, who can keep high school. */
export const FRESHMAN_YEARS_LEFT = 3

/** School years start in this month (0 = January), for counting how far away graduation is. */
export const SCHOOL_YEAR_STARTS = 7

/** How a college degree is usually written ("B.S. in…", "Master of…"). */
export const COLLEGE_DEGREE =
  /\b(bachelor|master|doctor|associate|ph\.?\s?d|mba|b\.?\s?(s|a|sc|eng|s\.?e|com|f\.?a|b\.?a)|m\.?\s?(s|a|sc|eng|b\.?a|phil|f\.?a)|a\.?\s?(a|s))\b\.?/i

/** How a college's name usually reads. */
export const COLLEGE_NAME = /\b(university|college|institute|polytechnic|universidad|université|universität)\b/i

/** How a high school's name usually reads. */
export const HIGH_SCHOOL_NAME = /\bhigh school\b/i

/** "References available upon request", however it's worded. */
export const REFERENCES_ON_REQUEST = /\breferences?\b[^.]{0,30}?\brequest(ed)?\b/i
