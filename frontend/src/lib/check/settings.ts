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

// Around a detail written as an item on its own, as in "Age 22 · Single ·
// Austin, TX": the start of the text or a separator before it, and the end or
// a separator after it. Some details are only flagged that way, so a
// "single-page app" or a "15-year-old codebase" isn't.
const START = String.raw`(?:^|[,;|·•(]\s*)`
const END = String.raw`\s*(?:$|[,;|·•)])`

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
  {
    name: "age",
    pattern: new RegExp(
      String.raw`\bage\s*:\s*\d|\b\d{2}\s*(years|yrs)\.?\s*old\b|\byears of age\b|${START}age\s+\d{2}\b|\b\d{2}[- ](year|yr)[- ]old${END}`,
      "i",
    ),
  },
  { name: "gender", pattern: new RegExp(String.raw`\b(gender|sex)\s*:|${START}(male|female)${END}`, "i") },
  { name: "marital status", pattern: new RegExp(String.raw`\bmarital status\b|\b(married|divorced|widowed)\b|${START}single${END}`, "i") },
] as const

/**
 * A Social Security number, as it's usually written: 123-45-6789 or
 * 123 45 6789, or nine digits right after "SSN" or "Social Security". Nine
 * digits on their own aren't flagged, as LinkedIn's made-up link endings and
 * other IDs have them too.
 */
export const SSN = /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b(ssn|social security(\s+(number|no\.?))?)\s*[:#]?\s*\d{9}\b/i

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

// Dates (D1–D7).

/** Words for a date that hasn't come yet: an entry that's still going. */
export const PRESENT_WORDS = ["Present", "Current", "Now", "Ongoing", "Today"]

/** Words before a date that aren't part of it: "Expected May 2027", "Class of 2027". */
export const DATE_PREFIXES = ["Expected", "Anticipated", "Exp.", "Est.", "Estimated", "Graduated", "Graduating", "Graduation", "Class of"]

// Bullets (B1–B9).

/** Starts that describe a duty instead of what was done. */
export const WEAK_STARTS = [
  "Responsible for", "Helped", "Help", "Helping", "Assisted", "Assist", "Assisting", "Worked on", "Work on", "Working on",
  "Participated in", "Tasked with", "Involved in", "In charge of", "Duties included",
]

/**
 * Action verbs, each as its present and past forms ("build built"): present
 * for what's still going, past for what has ended. Regular verbs in the past
 * ("Optimized") are known without being listed; they're here for their
 * present form and for suggesting other verbs.
 */
export const ACTION_VERBS = `
  accelerate accelerated, achieve achieved, acquire acquired, adapt adapted, add added, address addressed, adopt adopted,
  administer administered, advise advised, advocate advocated, align aligned, allocate allocated, analyze analyzed,
  answer answered, apply applied, architect architected, arrange arranged, assemble assembled, assess assessed,
  audit audited, author authored, automate automated, balance balanced, begin began, benchmark benchmarked,
  boost boosted, brainstorm brainstormed, bring brought, build built, calculate calculated, champion championed,
  chair chaired, clarify clarified, clean cleaned, coach coached, code coded, collaborate collaborated,
  collect collected, communicate communicated, compile compiled, complete completed, compose composed,
  compute computed, conduct conducted, configure configured, consolidate consolidated, construct constructed,
  consult consulted, contribute contributed, convert converted, coordinate coordinated, create created,
  curate curated, cut cut, debug debugged, decrease decreased, define defined, delegate delegated, deliver delivered,
  demonstrate demonstrated, deploy deployed, design designed, detect detected, determine determined,
  develop developed, devise devised, diagnose diagnosed, direct directed, discover discovered, distill distilled,
  document documented, double doubled, draft drafted, drive drove, edit edited, educate educated,
  eliminate eliminated, embed embedded, employ employed, enable enabled, engineer engineered, enhance enhanced, establish established,
  evaluate evaluated, examine examined, execute executed, expand expanded, expedite expedited, explore explored,
  extend extended, extract extracted, facilitate facilitated, find found, fix fixed, forecast forecast,
  formulate formulated, gather gathered, generate generated, give gave, grow grew, guide guided, halve halved,
  handle handled, head headed, hire hired, hold held, host hosted, identify identified, implement implemented,
  import imported, improve improved, increase increased, initiate initiated, inspect inspected, install installed,
  instruct instructed, integrate integrated, interview interviewed, introduce introduced, invent invented,
  investigate investigated, keep kept, label labeled, launch launched, lead led, lower lowered, maintain maintained,
  make made, manage managed, map mapped, measure measured, meet met, mentor mentored, merge merged, migrate migrated,
  model modeled, modernize modernized, monitor monitored, move moved, negotiate negotiated, onboard onboarded,
  operate operated, optimize optimized, orchestrate orchestrated, organize organized, overhaul overhauled,
  oversee oversaw, own owned, partner partnered, perform performed, pilot piloted, pioneer pioneered, plan planned,
  prepare prepared, present presented, price priced, prioritize prioritized, process processed, produce produced,
  profile profiled, program programmed, promote promoted, propose proposed, prototype prototyped, provide provided,
  publish published, raise raised, rank ranked, rebuild rebuilt, recommend recommended, recruit recruited,
  redesign redesigned, reduce reduced, refactor refactored, refine refined, release released, remove removed,
  render rendered, replace replaced, replicate replicated, report reported, represent represented,
  research researched, resolve resolved, restructure restructured, review reviewed, revise revised,
  rewrite rewrote, route routed, run ran, save saved, scale scaled, schedule scheduled, score scored,
  scrape scraped, screen screened, script scripted, secure secured, segment segmented, sell sold, send sent, serve served, set set,
  ship shipped, simplify simplified, solve solved, sort sorted, speak spoke, spearhead spearheaded,
  standardize standardized, start started, streamline streamlined, strengthen strengthened, study studied,
  supervise supervised, support supported, survey surveyed, synthesize synthesized, take took, teach taught,
  test tested, track tracked, train trained, transform transformed, translate translated, triple tripled,
  troubleshoot troubleshot, tune tuned, tutor tutored, unify unified, update updated, upgrade upgraded, use used,
  validate validated, verify verified, visualize visualized, volunteer volunteered, win won, write wrote
`

/** Other verbs to suggest when one starts too many bullets. */
export const VERB_SYNONYMS: Record<string, string[]> = {
  analyze: ["assess", "evaluate", "investigate"],
  automate: ["streamline", "simplify", "script"],
  build: ["create", "develop", "engineer"],
  collaborate: ["partner", "coordinate", "align"],
  conduct: ["run", "perform", "lead"],
  coordinate: ["organize", "manage", "plan"],
  create: ["build", "design", "launch"],
  deploy: ["launch", "release", "ship"],
  design: ["architect", "plan", "prototype"],
  develop: ["build", "create", "engineer"],
  implement: ["build", "deploy", "integrate"],
  improve: ["boost", "enhance", "streamline"],
  increase: ["grow", "raise", "boost"],
  lead: ["direct", "head", "guide"],
  maintain: ["support", "run", "update"],
  manage: ["coordinate", "oversee", "direct"],
  mentor: ["coach", "guide", "train"],
  optimize: ["improve", "tune", "refine"],
  organize: ["coordinate", "plan", "arrange"],
  reduce: ["cut", "lower", "decrease"],
  research: ["investigate", "study", "explore"],
  support: ["enable", "maintain", "serve"],
  test: ["validate", "verify", "evaluate"],
  train: ["coach", "mentor", "teach"],
  use: ["apply", "adopt", "employ"],
  write: ["author", "draft", "document"],
}

/** "Buzzwords": words anyone could claim, that say little on their own. */
export const BUZZWORDS = [
  "results-driven", "results-oriented", "detail-oriented", "team player", "self-starter", "go-getter", "hard-working",
  "hardworking", "passionate", "synergy", "synergies", "think outside the box", "proven track record", "best-in-class",
  "world-class", "cutting-edge", "rockstar", "ninja", "guru",
]

/** Vague words that stand in for saying which or how many. */
export const VAGUE_WORDS = ["various", "numerous", "a variety of", "etc.", "etc", "and so on", "and more"]

/** Words that count as a number in a bullet, as digits do. */
export const NUMBER_WORDS = [
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "dozen", "dozens",
  "hundred", "hundreds", "thousand", "thousands", "million", "millions", "billion", "billions", "doubled", "tripled", "halved",
]

/** About this share of bullets should have a number; fewer gets partial credit. */
export const BULLETS_WITH_NUMBERS = 0.5

/** Fewer bullets than this, and the share with a number says little. */
export const MIN_BULLETS_FOR_NUMBERS = 3

/** A job with more bullets than this buries the best of them. */
export const MAX_BULLETS = 6

/** The same first word on this many bullets or more reads as repetitive. */
export const SAME_START = 3

// Polish (P1–P7).

/** US states and their abbreviations, to find one written both ways. */
export const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
]

/** Degree abbreviations with dots and without, to find both on one resume. MBA goes either way, so it isn't here. */
export const DEGREE_ABBREVIATIONS: [string, string][] = [
  ["B.S.", "BS"], ["B.A.", "BA"], ["B.Sc.", "BSc"], ["B.S.E.", "BSE"], ["B.Eng.", "BEng"], ["B.B.A.", "BBA"],
  ["B.F.A.", "BFA"], ["M.S.", "MS"], ["M.A.", "MA"], ["M.Sc.", "MSc"], ["M.Eng.", "MEng"], ["M.F.A.", "MFA"],
  ["M.P.H.", "MPH"], ["Ph.D.", "PhD"], ["J.D.", "JD"], ["A.A.", "AA"], ["A.S.", "AS"],
]

/** Acronyms and names of 5 or more letters that are written in capitals. */
export const ACRONYMS = [
  "ABAQUS", "AECOM", "ANSYS", "ASCII", "AUTOSAR", "BASIC", "CATIA", "CISSP", "COBOL", "COMSOL", "CRISPR", "EBITDA",
  "ELISA", "FERPA", "FINRA", "FISMA", "FORTRAN", "HIPAA", "HTTPS", "IELTS", "LIDAR", "MATLAB", "NASDAQ", "NASTRAN",
  "NGINX", "NVIDIA", "OAUTH", "PMBOK", "POSIX", "PSPICE", "README", "SCADA", "SIGGRAPH", "SOLID", "SPICE", "STATA",
  "TOEFL", "UNESCO", "UNICEF",
]

/** Names written in lower case on purpose, which can start a bullet. */
export const LOWERCASE_NAMES = [
  "bash", "conda", "curl", "dbt", "eslint", "ffmpeg", "jest", "kubectl", "matplotlib", "npm", "numpy", "pandas", "pip",
  "pnpm", "pytest", "scikit-learn", "seaborn", "tmux", "vim", "vite", "webpack", "wget", "yarn", "zsh",
]

/** Shorthand and slang, and the word to write instead. */
export const SHORTHAND: [string, string][] = [
  ["w/o", "without"], ["w/", "with"], ["b/c", "because"], ["mgmt", "management"], ["mgr", "manager"],
  ["approx.", "about"], ["approx", "about"], ["govt", "government"], ["thru", "through"], ["esp.", "especially"],
  ["yrs", "years"], ["yr", "year"], ["hrs", "hours"], ["hr", "hour"], ["&", "and"],
]
