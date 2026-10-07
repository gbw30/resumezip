// Turns a paper's record, from Crossref or doi.org, into the editor's
// publication fields (see components/editor/sections.ts). Crossref's records
// and doi.org's CSL JSON share their field names, but Crossref gives lists
// where CSL gives one string, so every field is read as either.

import { ownerMatcher } from "@/lib/typst/resumeData"
import type { PaperId } from "./link"

export interface PublicationFields {
  publicationTitle: string
  publicationAuthors: string
  publicationDate: string
  publicationVenue: string
  publicationDetails: string
  publicationLink: string
}

type Json = Record<string, unknown>

const record = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {})
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "")
const first = (value: unknown) => str(list(value)[0])

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function entity(match: string, name: string) {
  if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? match
  const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
}

const TAG = /<\/?[a-z][\w:.-]*(?:\s[^<>]*)?\/?>/gi

// Tags are removed until none are left, so one split by another ("<i<b>>") goes too.
function withoutTags(value: string) {
  for (let previous = ""; value !== previous; ) {
    previous = value
    value = value.replace(TAG, "")
  }
  return value
}

// Crossref marks up some titles ("<i>Escherichia coli</i>"), escapes "&" as
// "&amp;", and keeps the line breaks of the XML it came from.
const clean = (value: string) =>
  withoutTags(value)
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, entity)
    .replace(/\s+/g, " ")
    .replace(/ ([:;,])/g, "$1")
    .trim()

function titleOf(work: Json): string {
  const title = clean(first(work.title))
  const subtitle = clean(first(work.subtitle))
  if (!subtitle || title.toLowerCase().includes(subtitle.toLowerCase())) return title
  return /[:?!.]$/.test(title) ? `${title} ${subtitle}` : `${title}: ${subtitle}`
}

// "Charles R." is "C. R.", and "Jean-Pierre" is "J.-P."
const initials = (given: string) =>
  given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((name) =>
      name
        .split("-")
        .filter(Boolean)
        .map((part) => `${[...part][0].toUpperCase()}.`)
        .join("-"),
    )
    .join(" ")

/** An author as the editor's placeholder writes them, "J. Ryan", so the templates can find the resume owner's name. */
function nameOf(author: unknown): string {
  const person = record(author)
  const family = [str(person["non-dropping-particle"]), str(person.family)].map(clean).filter(Boolean).join(" ")
  if (family) return [initials(clean(str(person.given))), clean(str(person["dropping-particle"])), family].filter(Boolean).join(" ")
  // A group ("ATLAS Collaboration"), or a name in one piece ("Ryan, Jake").
  const whole = clean(str(person.name) || str(person.literal))
  const [last, given, ...rest] = whole.split(/\s*,\s*/)
  return given && rest.length === 0 ? `${initials(given)} ${last}` : whole
}

// IEEE lists up to six authors. Past that, it gives the first and "et al."
const MOST_AUTHORS = 6

function authorsOf(work: Json, owner: string): string {
  const names = list(work.author).map(nameOf).filter(Boolean)
  if (names.length <= MOST_AUTHORS) return names.join(", ")
  // The list runs to the resume owner's name, so it's still there, in order, to print in bold.
  const shown = names.slice(0, names.findIndex(ownerMatcher(owner)) + 1 || 1)
  return shown.length > 1 ? `${shown.join(", ")}, et al.` : `${shown[0]} et al.`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const monthYear = (year: number, month: unknown) =>
  typeof month === "number" && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${year}` : String(year)

function dateOf(work: Json, paper: PaperId): string {
  // arXiv's records only give the year, but its IDs start with the year and
  // month the paper was sent in: 2202.01037, hep-th/9901001.
  const sent = paper.arxiv?.match(/(?:^|\/)(\d{2})(\d{2})/)
  if (sent) return monthYear(Number(sent[1]) + (Number(sent[1]) >= 91 ? 1900 : 2000), Number(sent[2]))
  for (const key of ["issued", "published", "published-print", "published-online"]) {
    const [year, month] = list(list(record(work[key])["date-parts"])[0])
    if (typeof year === "number" && Number.isInteger(year)) return monthYear(year, month)
  }
  return ""
}

function venueOf(work: Json, paper: PaperId): string {
  if (paper.arxiv) return "arXiv preprint"
  const type = str(work.type)
  if (type === "posted-content" || work.subtype === "preprint") {
    // bioRxiv's record names it as the institution; its publisher is openRxiv.
    const server = clean(str(record(list(work.institution)[0]).name) || str(work.publisher))
    return server ? `${server} preprint` : "Preprint"
  }
  // A chapter's book comes after its series: ["Lecture Notes in Computer Science", "Computer Vision – ECCV 2020"].
  const containers = list(work["container-title"]).map((title) => clean(str(title))).filter(Boolean)
  const venue =
    containers[containers.length - 1] ||
    clean(str(record(work.event).name) || str(work.event)) ||
    (/book|monograph/.test(type) ? clean(str(work.publisher)) : "")
  return venue.replace(/^Proceedings of (?:the )?/i, "Proc. ")
}

function detailsOf(work: Json, paper: PaperId): string {
  // An arXiv paper's DOI already says where to find it.
  if (paper.arxiv) return ""
  const volume = clean(str(work.volume))
  const issue = clean(str(work.issue))
  const pages = clean(str(work.page)).replace(/\s*[-–—]+\s*/, "–")
  const number = clean(str(work["article-number"]))
  const where = pages ? (pages.includes("–") ? `pp. ${pages}` : /^\d+$/.test(pages) ? `p. ${pages}` : `Art. no. ${pages}`) : number && `Art. no. ${number}`
  return [volume && `vol. ${volume}`, issue && `no. ${issue}`, where].filter(Boolean).join(", ")
}

/** A paper's record as the editor's publication fields. `owner` is the resume owner's name. */
export function publicationOf(work: unknown, paper: PaperId, owner: string): PublicationFields {
  const fields = record(work)
  return {
    publicationTitle: titleOf(fields),
    publicationAuthors: authorsOf(fields, owner),
    publicationDate: dateOf(fields, paper),
    publicationVenue: venueOf(fields, paper),
    publicationDetails: detailsOf(fields, paper),
    publicationLink: paper.doi,
  }
}
