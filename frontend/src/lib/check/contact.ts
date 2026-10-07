// Contact & personal details (C1–C10 in issue #58): how a recruiter reaches
// the person, and what to leave off.

import type { Problem, Rule } from "./engine"
import type { Place } from "./places"
import { textsOf } from "./resume"
import { LINKEDIN_RANDOM_ENDING, MIN_PHONE_DIGITS, PERSONAL_DETAILS, SSN, STREET_WORDS } from "./settings"

const profile = (field: string): Place => ({ kind: "profile", field })

// Something before an @, and a domain with a dot and a real ending after it.
const EMAIL = /^[^\s@]+@([^\s@.]+\.)+[a-z]{2,}$/i

// A web address: a domain with a dot and a real ending, then a path, if any.
const WEB_ADDRESS = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i

// A LinkedIn profile, with its name: linkedin.com/in/jake-ryan, in any country.
const LINKEDIN_PROFILE = /^(https?:\/\/)?([a-z0-9-]+\.)?linkedin\.com\/in\/([^\s/?#]+)\/?([?#]\S*)?$/i

const RANDOM_ENDING = new RegExp(`-(?=[a-z]*\\d)[a-z0-9]{${LINKEDIN_RANDOM_ENDING},}$`, "i")

const STREET = new RegExp(`\\b\\d+[a-z]?\\s+([\\w.'-]+\\s+){0,4}(${STREET_WORDS.join("|")})\\b`, "i")
const ZIP_CODE = /\b\d{5}(-\d{4})?\b/

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
  why: "Recruiters reply by email, so it has to work.",
  check: ({ resume }) => {
    const value = resume.profile.email
    const problems: Problem[] = !value
      ? [{ place: profile("email"), message: "Add your email address" }]
      : EMAIL.test(value)
        ? []
        : [{ place: profile("email"), message: "Not a whole email address", suggestion: "Write it like jake@gmail.com." }]
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
    const digits = value.replace(/\D/g, "").length
    const problems: Problem[] = !value
      ? [{ place: profile("phoneNumber"), message: "Add a phone number" }]
      : digits < MIN_PHONE_DIGITS
        ? [{ place: profile("phoneNumber"), message: "Phone number looks too short", suggestion: "Include the area code." }]
        : []
    return { checked: 1, problems }
  },
}

const location: Rule = {
  id: "C4",
  category: "contact",
  level: "look",
  reads: "form",
  title: "Where you live",
  why: "Recruiters look for where you are, to know if you can work there.",
  check: ({ resume }) => ({
    checked: 1,
    problems: resume.profile.location
      ? []
      : [{ place: profile("location"), message: "Add your city and state", suggestion: "Like Austin, TX." }],
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
      ? [{ place: profile("linkedin"), message: "Add your LinkedIn" }]
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
  reads: "form",
  title: "A LinkedIn link with your name",
  why: "A link with your name reads better than the one LinkedIn makes up.",
  check: ({ resume }) => {
    const slug = resume.profile.linkedin.match(LINKEDIN_PROFILE)?.[3]
    if (!slug) return null
    return {
      checked: 1,
      problems: RANDOM_ENDING.test(slug)
        ? [
            {
              place: profile("linkedin"),
              message: "LinkedIn link ends in random letters and numbers",
              suggestion: "Pick your own in LinkedIn under “Edit public profile & URL”.",
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
  title: "Your GitHub and website links",
  why: "A link that isn't a web address can't be opened.",
  check: ({ resume }) => {
    const fields = [
      { field: "profileGithub", example: "github.com/jake" },
      { field: "personalWebsite", example: "jake.dev" },
    ].filter(({ field }) => resume.profile[field])
    if (fields.length === 0) return null
    return {
      checked: fields.length,
      problems: fields
        .filter(({ field }) => !WEB_ADDRESS.test(resume.profile[field]))
        .map(({ field, example }) => ({ place: profile(field), message: "Not a web address", suggestion: `Write it like ${example}.` })),
    }
  },
}

const address: Rule = {
  id: "C8",
  category: "contact",
  level: "look",
  reads: "form",
  title: "No street address or ZIP code",
  why: "City and state is enough, and keeps your address private.",
  check: ({ resume }) => {
    const value = resume.profile.location
    if (!value) return null
    const found = STREET.test(value) ? "street address" : ZIP_CODE.test(value) ? "ZIP code" : null
    const problems: Problem[] = found
      ? [{ place: profile("location"), message: `Leave off your ${found}`, suggestion: "City and state is enough, like Austin, TX." }]
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
  why: "Employers can't hire based on them, so many would rather not see them.",
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
      return found ? [{ place, message: "Leave off your Social Security number", text: found[0] }] : []
    }),
  }),
}

export const CONTACT_RULES: readonly Rule[] = [name, email, phone, location, linkedin, linkedinEnding, links, address, personal, ssn]
