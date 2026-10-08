import { describe, expect, test } from "vitest"
import type { Resume } from "@/lib/resume"
import { runChecks } from "./engine"
import { RULES } from "./rules"

const jake = {
  profileSection: {
    fullName: "Jake Ryan",
    email: "jake@gmail.com",
    phoneNumber: "(512) 555-0142",
    location: "Austin, TX",
    linkedin: "linkedin.com/in/jake-ryan",
    profileGithub: "github.com/jakeryan",
    personalWebsite: "jakeryan.dev",
  },
  workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Google", workDescription: "• Built a search index" }],
}

const withProfile = (changes: Record<string, string>) => ({ ...jake, profileSection: { ...jake.profileSection, ...changes } })

/** What one rule says about a resume. */
function check(id: string, resume: Resume) {
  const rule = RULES.find((rule) => rule.id === id)!
  const report = runChecks(resume, { rules: [rule] })
  return { status: report.results[0].status, messages: report.findings.map((finding) => finding.message), findings: report.findings }
}

test("a whole profile passes every contact rule", () => {
  for (const id of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"]) {
    expect(check(id, jake).status, id).toBe("passed")
  }
})

describe("C1 name", () => {
  test("is a fix when it's missing", () => {
    expect(check("C1", withProfile({ fullName: "  " })).findings).toEqual([
      expect.objectContaining({ level: "fix", place: { kind: "profile", field: "fullName" }, message: "Add your name" }),
    ])
  })
})

describe("C2 email", () => {
  test("flags a missing or partial address", () => {
    expect(check("C2", withProfile({ email: "" })).messages).toEqual(["Add your email address"])
    for (const email of ["jake@gmail", "jake.gmail.com", "jake@gmail.c", "jake @gmail.com", "@gmail.com"]) {
      expect(check("C2", withProfile({ email })).messages, email).toEqual(["Not a whole email address"])
    }
  })

  test("takes any whole address", () => {
    for (const email of ["jake.ryan+jobs@cs.utexas.edu", "j@mail.example.co.uk", "JAKE@GMAIL.COM"]) {
      expect(check("C2", withProfile({ email })).status, email).toBe("passed")
    }
  })
})

describe("C3 phone", () => {
  test("flags a missing number, or one without an area code", () => {
    expect(check("C3", withProfile({ phoneNumber: "" })).messages).toEqual(["Add a phone number"])
    expect(check("C3", withProfile({ phoneNumber: "555-0142" })).messages).toEqual(["Phone number looks too short"])
  })

  test("takes 10 digits or more, however they're written", () => {
    for (const phoneNumber of ["512-555-0142", "5125550142", "+1 512 555 0142", "+44 20 7946 0958", "512.555.0142 ext. 12"]) {
      expect(check("C3", withProfile({ phoneNumber })).status, phoneNumber).toBe("passed")
    }
  })
})

describe("C4 location", () => {
  test("flags it when it's missing", () => {
    expect(check("C4", withProfile({ location: "" })).messages).toEqual(["Add your city and state"])
  })
})

describe("C5 and C6 LinkedIn", () => {
  test("flags a missing link, or one that isn't a profile", () => {
    expect(check("C5", withProfile({ linkedin: "" })).messages).toEqual(["Add your LinkedIn"])
    for (const linkedin of ["linkedin.com/feed", "linkedin.com/in/", "jake-ryan", "linkedin.com/company/google"]) {
      expect(check("C5", withProfile({ linkedin })).messages, linkedin).toEqual(["Not a link to a LinkedIn profile"])
    }
  })

  test("takes a profile link written any usual way", () => {
    for (const linkedin of [
      "linkedin.com/in/jake",
      "www.linkedin.com/in/jake-ryan/",
      "https://www.linkedin.com/in/jake-ryan",
      "https://uk.linkedin.com/in/jake-ryan?trk=profile",
    ]) {
      expect(check("C5", withProfile({ linkedin })).status, linkedin).toBe("passed")
    }
  })

  test("flags the ending LinkedIn makes up, but not one the person chose", () => {
    for (const linkedin of ["linkedin.com/in/jake-ryan-8a7b6c123", "linkedin.com/in/jake-ryan-123456789/"]) {
      expect(check("C6", withProfile({ linkedin })).messages, linkedin).toEqual(["LinkedIn link ends in random letters and numbers"])
    }
    for (const linkedin of ["linkedin.com/in/jake-ryan", "linkedin.com/in/jakeryan2024", "linkedin.com/in/jake-ryan-2024", "linkedin.com/in/ryan-anderson"]) {
      expect(check("C6", withProfile({ linkedin })).status, linkedin).toBe("passed")
    }
  })

  test("leaves the ending alone when there's no profile link", () => {
    expect(check("C6", withProfile({ linkedin: "" })).status).toBe("skipped")
    expect(check("C6", withProfile({ linkedin: "linkedin.com/feed" })).status).toBe("skipped")
  })
})

describe("C7 GitHub and website", () => {
  test("flags what isn't a web address, field by field", () => {
    const { findings } = check("C7", withProfile({ profileGithub: "jakeryan", personalWebsite: "jakeryan.dev" }))
    expect(findings).toEqual([expect.objectContaining({ place: { kind: "profile", field: "profileGithub" }, message: "Not a web address" })])
    expect(check("C7", withProfile({ personalWebsite: "my site" })).messages).toEqual(["Not a web address"])
  })

  test("takes web addresses with or without https, and skips when there are none", () => {
    expect(check("C7", withProfile({ profileGithub: "https://github.com/jake-ryan/", personalWebsite: "www.jake.io/blog" })).status).toBe("passed")
    expect(check("C7", withProfile({ profileGithub: "", personalWebsite: "" })).status).toBe("skipped")
  })
})

describe("C8 street address or ZIP code", () => {
  test("flags a street address or ZIP code", () => {
    expect(check("C8", withProfile({ location: "1234 Elm St, Austin, TX" })).messages).toEqual(["Leave off your street address"])
    expect(check("C8", withProfile({ location: "500 W 2nd Street Apt 4" })).messages).toEqual(["Leave off your street address"])
    expect(check("C8", withProfile({ location: "Austin, TX 78701" })).messages).toEqual(["Leave off your ZIP code"])
  })

  test("takes a city and state, or a city and country", () => {
    for (const location of ["Austin, TX", "New York, NY", "London, United Kingdom", "Remote"]) {
      expect(check("C8", withProfile({ location })).status, location).toBe("passed")
    }
  })
})

describe("C9 personal details", () => {
  test("flags date of birth, age, gender and marital status, wherever they are", () => {
    expect(check("C9", withProfile({ location: "Austin, TX · DOB: 04/12/2003" })).messages).toEqual(["Leave off your date of birth"])
    expect(check("C9", withProfile({ location: "Born in 2003" })).messages).toEqual(["Leave off your date of birth"])
    expect(check("C9", withProfile({ location: "Age: 22, Gender: Male" })).messages).toEqual(["Leave off your age", "Leave off your gender"])
    const skills = { ...jake, skillsSection: [{ id: 1, skillName: "Personal", skillDetails: "Married, 24 years old" }] }
    expect(check("C9", skills).messages).toEqual(["Leave off your age", "Leave off your marital status"])
  })

  test("flags the ones written on their own, as in a list", () => {
    expect(check("C9", withProfile({ location: "Austin, TX · Age 22 · Single" })).messages).toEqual([
      "Leave off your age",
      "Leave off your marital status",
    ])
    expect(check("C9", withProfile({ location: "Austin, TX, 22-year-old, Male" })).messages).toEqual([
      "Leave off your age",
      "Leave off your gender",
    ])
  })

  test("tells two details in one field apart, so each can be dismissed on its own", () => {
    const [age, gender] = check("C9", withProfile({ location: "Age: 22, Gender: Male" })).findings
    expect(age.key).not.toBe(gender.key)
  })

  test("never flags nationality, citizenship or a security clearance", () => {
    const skills = {
      ...jake,
      skillsSection: [{ id: 1, skillName: "Eligibility", skillDetails: "U.S. citizen; Nationality: American; Active TS/SCI clearance" }],
    }
    expect(check("C9", skills).status).toBe("passed")
  })

  test("doesn't flag the same words used in other ways", () => {
    const work = [
      {
        id: 1,
        workRole: "Engineer",
        companyName: "Google",
        workDescription: [
          "• Built a gender-neutral language model",
          "• Cut page load for users of every age group",
          "• Moved a 15 year old codebase to TypeScript",
          "• Migrated a 15-year-old codebase to a single-page app",
          "• Tutored students age 12 to 15",
          "• Ran user studies with male and female participants",
        ].join("\n"),
      },
    ]
    const education = [{ id: 1, schoolName: "University of Texas at Austin", involvement: "Female Founders Club" }]
    expect(check("C9", { ...jake, workExperienceSection: work, educationSection: education }).status).toBe("passed")
  })
})

describe("C10 Social Security number", () => {
  test("is a fix wherever it is", () => {
    expect(check("C10", withProfile({ location: "SSN 123-45-6789" })).findings).toEqual([
      expect.objectContaining({ level: "fix", message: "Leave off your Social Security number", text: "123-45-6789" }),
    ])
  })

  test("flags one written with spaces, or as nine digits after its name", () => {
    for (const location of ["123 45 6789", "SSN: 123456789", "Social Security No. 123456789"]) {
      expect(check("C10", withProfile({ location })).messages, location).toEqual(["Leave off your Social Security number"])
    }
  })

  test("doesn't take a phone number, a date or another nine-digit number for one", () => {
    expect(check("C10", withProfile({ phoneNumber: "512-555-0142", location: "2021-05-2023" })).status).toBe("passed")
    // LinkedIn's made-up endings and DOIs can have nine digits in a row.
    const publications = [{ id: 1, publicationTitle: "Sparse Attention", publicationLink: "10.1145/123456789" }]
    const resume = { ...withProfile({ linkedin: "linkedin.com/in/jake-ryan-123456789" }), publicationsSection: publications }
    expect(check("C10", resume).status).toBe("passed")
  })
})
