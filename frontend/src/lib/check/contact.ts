// Contact & personal details (C1–C10 in issue #58): how a recruiter reaches
// the person, and what to leave off.

import type { ProfileKey } from "@/components/editor/sections"
import type { Problem, Rule } from "./engine"
import type { Place } from "./places"
import { textsOf } from "./resume"
import {
  LINKEDIN_RANDOM_ENDING,
  MAX_PHONE_DIGITS,
  MAX_PHONE_EXTENSION_DIGITS,
  MIN_PHONE_DIGITS,
  PERSONAL_DETAILS,
  SSN,
  STREET_WORDS,
} from "./settings"

const profile = (field: ProfileKey): Place => ({ kind: "profile", field })

// URL normalizes international domain names to ASCII. Check the labels too:
// URL accepts a few names, like -example.com, that aren't usable DNS names.
function domainName(value: string): boolean {
  const labels = value.split(".")
  return (
    value.length <= 253 &&
    labels.length > 1 &&
    labels.every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) &&
    /^(?:[a-z]{2,}|xn--[a-z\d-]+)$/i.test(labels.at(-1) ?? "")
  )
}

function webAddress(value: string): boolean {
  if (/[\s\\]/u.test(value)) return false
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    // Public IP addresses are also usable project links; URL validates their syntax.
    const ip = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.startsWith("[")
    return !url.username && !url.password && (domainName(url.hostname) || ip)
  } catch {
    return false
  }
}

function emailAddress(value: string): boolean {
  const split = value.lastIndexOf("@")
  if (split < 1 || /[\r\n]/.test(value)) return false
  const local = value.slice(0, split)
  const domain = value.slice(split + 1)
  // Dot-atoms (including international letters) and quoted local parts are
  // both valid; consecutive dots or punctuation masquerading as a domain aren't.
  const atom = /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+)*$/u
  const quoted = /^"(?:[^"\\\r\n]|\\[^\r\n])+"$/
  if ((!atom.test(local) && !quoted.test(local)) || !domain || /[\s/@:#?\\]/u.test(domain)) return false
  try {
    return domainName(new URL(`https://${domain}`).hostname)
  } catch {
    return false
  }
}

// This is a plausibility check, not verification that a number is assigned.
// Extensions don't count toward the international number's 15-digit limit.
function phoneNumber(value: string): boolean {
  const match = value.match(/^(.*?)(?:\s*(?:ext\.?|extension|x|#)\s*(\d+))?$/i)
  if (!match) return false
  const [, number, extension] = match
  if (!/^\+?[\d\s().-]+$/.test(number) || (extension?.length ?? 0) > MAX_PHONE_EXTENSION_DIGITS) return false
  const digits = number.replace(/\D/g, "")
  if (/^0+$/.test(digits) || (number.startsWith("+") && digits.startsWith("0"))) return false
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS
}

// A LinkedIn profile, with its name: linkedin.com/in/jake-ryan, in any country.
const LINKEDIN_PROFILE = /^(https?:\/\/)?([a-z0-9-]+\.)?linkedin\.com\/in\/([^\s/?#]+)\/?([?#]\S*)?$/i

const RANDOM_ENDING = new RegExp(`-(?=[a-z]*\\d)[a-z0-9]{${LINKEDIN_RANDOM_ENDING},}$`, "i")

const STREET = new RegExp(`\\b\\d+[a-z]?\\s+([\\w.'-]+\\s+){0,4}(${STREET_WORDS.join("|")})\\b`, "i")

const name: Rule = {
  id: "C1",
  category: "contact",
  level: "fix",
  reads: "form",
  title: "Your name",
  why: "It's the first thing a recruiter reads, and how they file your resume.",
  check: ({ resume }) => ({
    checked: 1,
    problems: resume.profile.fullName ? [] : [{ place: profile("fullName"), message: "Add your name" }],
  }),
}

const email: Rule = {
  id: "C2",
  category: "contact",
  level: "fix",
  reads: "form",
  title: "Your email address",
  why: "Recruiters need a usable way to reach you; an email address should be complete.",
  check: ({ resume }) => {
    const value = resume.profile.email
    const reachableByPhone = phoneNumber(resume.profile.phoneNumber)
    const problems: Problem[] = emailAddress(value)
      ? []
      : !value && reachableByPhone
        ? [{ place: profile("email"), message: "Consider adding an email address", level: "look", advisory: true }]
        : [
            {
              place: profile("email"),
              message: reachableByPhone ? "Not a whole email address" : "Add a usable email address or phone number",
              suggestion: value
                ? "Check the email spelling and domain, like jake@gmail.com."
                : "Include at least one way a recruiter can contact you.",
              text: value,
            },
          ]
    return { checked: 1, problems }
  },
}

const phone: Rule = {
  id: "C3",
  category: "contact",
  level: "look",
  reads: "form",
  title: "Your phone number",
  why: "Many recruiters call to set up the first interview.",
  check: ({ resume }) => {
    const value = resume.profile.phoneNumber
    const problems: Problem[] = !value
      ? [{ place: profile("phoneNumber"), message: "Consider adding a phone number", advisory: true }]
      : !phoneNumber(value)
        ? [
            {
              place: profile("phoneNumber"),
              message: "Check this phone number",
              suggestion:
                "Use a complete number, including its country code for international applications. Put any extension after “ext.”.",
            },
          ]
        : []
    return { checked: 1, problems }
  },
}

const location: Rule = {
  id: "C4",
  category: "contact",
  level: "look",
  advisory: true,
  reads: "form",
  title: "Your location or work availability",
  why: "Location can help when a role has geographic requirements.",
  check: ({ resume }) => ({
    checked: 1,
    problems: resume.profile.location
      ? []
      : [
          {
            place: profile("location"),
            message: "Consider adding your location or work availability",
            suggestion: "A city and region or country, “Remote”, or a relocation note can help when relevant to the job.",
          },
        ],
  }),
}

const linkedin: Rule = {
  id: "C5",
  category: "contact",
  level: "look",
  reads: "form",
  title: "Your LinkedIn profile",
  why: "Recruiters often look you up on LinkedIn.",
  check: ({ resume }) => {
    const value = resume.profile.linkedin
    const problems: Problem[] = !value
      ? [
          {
            place: profile("linkedin"),
            message: "Consider adding a LinkedIn profile",
            advisory: true,
            suggestion: "Include one if it is relevant and the application allows links.",
          },
        ]
      : LINKEDIN_PROFILE.test(value)
        ? []
        : [
            {
              place: profile("linkedin"),
              message: "Not a link to a LinkedIn profile",
              suggestion: "Copy it from your profile page, like linkedin.com/in/jake-ryan.",
            },
          ]
    return { checked: 1, problems }
  },
}

const linkedinEnding: Rule = {
  id: "C6",
  category: "contact",
  level: "look",
  advisory: true,
  reads: "form",
  title: "A LinkedIn link with your name",
  why: "A shorter custom link can be easier to read; the existing link can still work.",
  check: ({ resume }) => {
    const slug = resume.profile.linkedin.match(LINKEDIN_PROFILE)?.[3]
    if (!slug) return null
    return {
      checked: 1,
      problems: RANDOM_ENDING.test(slug)
        ? [
            {
              place: profile("linkedin"),
              message: "Consider a shorter LinkedIn link",
              suggestion: "If you want, choose an available URL under LinkedIn’s “Edit public profile & URL”.",
            },
          ]
        : [],
    }
  },
}

const links: Rule = {
  id: "C7",
  category: "contact",
  level: "look",
  reads: "form",
  title: "Your profile and project links",
  why: "A link that isn't a web address can't be opened.",
  check: ({ resume }) => {
    const fields: { place: Place; value: string; example: string }[] = [
      { place: profile("profileGithub"), value: resume.profile.profileGithub, example: "github.com/jake" },
      { place: profile("personalWebsite"), value: resume.profile.personalWebsite, example: "jake.dev" },
      ...resume.sections.Projects.flatMap((entry) =>
        (["projectGithub", "additionalLink"] as const).map((field) => ({
          place: { kind: "entry", section: "Projects", entry: entry.index, field } as const,
          value: entry.values[field],
          example: field === "projectGithub" ? "github.com/jake/project" : "project.example.com",
        })),
      ),
    ].filter(({ value }) => value)
    if (fields.length === 0) return null
    return {
      checked: fields.length,
      problems: fields
        .filter(({ value }) => !webAddress(value))
        .map(({ place, example }) => ({ place, message: "Not a web address", suggestion: `Write it like ${example}.` })),
    }
  },
}

const address: Rule = {
  id: "C8",
  category: "contact",
  level: "look",
  advisory: true,
  reads: "form",
  title: "Street address privacy",
  why: "A general location usually gives enough context without sharing your home address.",
  check: ({ resume }) => {
    const value = resume.profile.location
    if (!value) return null
    const problems: Problem[] = STREET.test(value)
      ? [
          {
            place: profile("location"),
            message: "Consider leaving off your street address",
            suggestion: "A city and region or country is usually enough, unless the application requests your full address.",
          },
        ]
      : []
    return { checked: 1, problems }
  },
}

const personal: Rule = {
  id: "C9",
  category: "contact",
  level: "look",
  reads: "form",
  title: "No age, date of birth, gender or marital status",
  why: "Personal disclosures are usually unnecessary; follow the conventions and requirements of the job's country.",
  check: ({ resume }) => ({
    checked: 1,
    // What matched is the text, so two details in one field are told apart.
    problems: textsOf(resume).flatMap(({ place, text }) =>
      PERSONAL_DETAILS.flatMap(({ name, pattern }) => {
        const found = pattern.exec(text)
        return found ? [{ place, message: `Leave off your ${name}`, text: found[0] }] : []
      }),
    ),
  }),
}

const ssn: Rule = {
  id: "C10",
  category: "contact",
  level: "fix",
  reads: "form",
  title: "No Social Security number",
  why: "A resume gets passed around, so it's an easy way to have your identity stolen.",
  check: ({ resume }) => ({
    checked: 1,
    problems: textsOf(resume).flatMap(({ place, text }) => {
      const found = SSN.exec(text)
      if (!found) return []
      const labeled =
        /\b(?:ssn|social security(?:\s+(?:number|no\.?))?)\s*[:#]?\s*$/i.test(text.slice(0, found.index)) || /^\D/i.test(found[0])
      return [
        {
          place,
          message: labeled ? "Leave off your Social Security number" : "Possible Social Security number",
          suggestion: labeled
            ? "Remove this sensitive identifier from your resume."
            : "If this is a Social Security number, remove it. Otherwise, label what the number represents.",
          text: found[0],
        },
      ]
    }),
  }),
}

export const CONTACT_RULES: readonly Rule[] = [name, email, phone, location, linkedin, linkedinEnding, links, address, personal, ssn]
