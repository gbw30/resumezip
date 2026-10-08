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

  test("accepts mononyms, initials and names in any script", () => {
    for (const fullName of ["Sukarno", "A. B. de la Cruz", "Nguyễn Thị Minh", "王小明", "فاطمة الزهراء", "María-José O’Neill"]) {
      expect(check("C1", withProfile({ fullName })).status, fullName).toBe("passed")
    }
  })
})

describe("C2 email", () => {
  test("flags a missing or partial address", () => {
    expect(check("C2", withProfile({ email: "" })).findings).toEqual([
      expect.objectContaining({ message: "Add your email address", level: "fix" }),
    ])
    for (const email of [
      "jake@gmail",
      "jake.gmail.com",
      "jake@gmail.c",
      "jake @gmail.com",
      "@gmail.com",
      ".jake@example.com",
      "jake..ryan@example.com",
      "jake.@example.com",
      "jake@-example.com",
      "jake@example-.com",
      "jake@exam_ple.com",
      "jake@example.com/path",
    ]) {
      expect(check("C2", withProfile({ email })).messages, email).toEqual(["Not a whole email address"])
    }
  })

  test("takes any whole address", () => {
    for (const email of [
      "jake.ryan+jobs@cs.utexas.edu",
      "j@mail.example.co.uk",
      "JAKE@GMAIL.COM",
      "o'neill@example.com",
      "用户@例子.中国",
      '"jake ryan"@example.com',
    ]) {
      expect(check("C2", withProfile({ email })).status, email).toBe("passed")
    }
  })

  test("is a fix even when a phone number works", () => {
    // Hiring software and application forms reply by email, so a phone number doesn't replace it.
    for (const phoneNumber of ["+298 35 60 20", "(512) 555-0134", ""]) {
      expect(check("C2", withProfile({ email: "", phoneNumber })).findings, phoneNumber).toEqual([
        expect.objectContaining({ message: "Add your email address", level: "fix" }),
      ])
      expect(check("C2", withProfile({ email: "wrong", phoneNumber })).findings, phoneNumber).toEqual([
        expect.objectContaining({ message: "Not a whole email address", level: "fix" }),
      ])
    }
  })
})

describe("C3 phone", () => {
  test("treats a missing phone as optional and flags implausible supplied numbers", () => {
    expect(check("C3", withProfile({ phoneNumber: "" })).findings[0]).toMatchObject({
      message: "Consider adding a phone number",
      advisory: true,
    })
    for (const phoneNumber of [
      "123",
      "9".repeat(30),
      "0000000000",
      "+0 123456789",
      "call me at 5125550142",
      "+1 512 555 0142 ext. nope",
      "123456 ext. 12345678901",
    ]) {
      expect(check("C3", withProfile({ phoneNumber })).messages, phoneNumber).toEqual(["Check this phone number"])
    }
  })

  test("accepts international numbers, shorter national plans and extensions outside the number's length limit", () => {
    for (const phoneNumber of [
      "512-555-0142",
      "5125550142",
      "+1 512 555 0142",
      "+44 20 7946 0958",
      "512.555.0142 ext. 12",
      "+298 35 60 20",
      "356020",
      "+123456789012345 x123",
      "+44 20 7946 0958 extension 123",
      "5125550142#12",
    ]) {
      expect(check("C3", withProfile({ phoneNumber })).status, phoneNumber).toBe("passed")
    }
  })
})

describe("C4 location", () => {
  test("flags it when it's missing", () => {
    expect(check("C4", withProfile({ location: "" })).findings[0]).toMatchObject({
      message: "Consider adding your location or work availability",
      advisory: true,
    })
    for (const location of ["Remote", "Open to relocation", "Helsinki, Finland", "Singapore"]) {
      expect(check("C4", withProfile({ location })).status).toBe("passed")
    }
  })
})

describe("C5 and C6 LinkedIn", () => {
  test("flags a missing link, or one that isn't a profile", () => {
    expect(check("C5", withProfile({ linkedin: "" })).findings[0]).toMatchObject({
      message: "Consider adding a LinkedIn profile",
      advisory: true,
    })
    for (const linkedin of ["linkedin.com/feed", "linkedin.com/in/", "jake-ryan", "linkedin.com/company/google"]) {
      expect(check("C5", withProfile({ linkedin })).messages, linkedin).toEqual(["Not a link to a LinkedIn profile"])
      expect(check("C5", withProfile({ linkedin })).findings[0].advisory).not.toBe(true)
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
      expect(check("C6", withProfile({ linkedin })).findings[0], linkedin).toMatchObject({
        message: "Consider a shorter LinkedIn link",
        advisory: true,
      })
    }
    for (const linkedin of [
      "linkedin.com/in/jake-ryan",
      "linkedin.com/in/jakeryan2024",
      "linkedin.com/in/jake-ryan-2024",
      "linkedin.com/in/ryan-anderson",
    ]) {
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
    expect(findings).toEqual([
      expect.objectContaining({ place: { kind: "profile", field: "profileGithub" }, message: "Not a web address" }),
    ])
    expect(check("C7", withProfile({ personalWebsite: "my site" })).messages).toEqual(["Not a web address"])
  })

  test("takes web addresses with or without https, and skips when there are none", () => {
    expect(check("C7", withProfile({ profileGithub: "https://github.com/jake-ryan/", personalWebsite: "www.jake.io/blog" })).status).toBe(
      "passed",
    )
    expect(check("C7", withProfile({ profileGithub: "", personalWebsite: "" })).status).toBe("skipped")
  })

  test("accepts Unicode domains, ports and paths, while rejecting malformed domain labels and unsupported links", () => {
    for (const personalWebsite of [
      "https://münchen.de",
      "例子.中国/作品",
      "https://example.com:8443/work?q=1#demo",
      "https://203.0.113.12/project",
    ]) {
      expect(check("C7", withProfile({ personalWebsite })).status, personalWebsite).toBe("passed")
    }
    for (const personalWebsite of [
      "https://-example.com",
      "example-.com",
      "exam_ple.com",
      "https://example.com:99999",
      "javascript:alert(1)",
      "https://jake:password@example.com",
      "https://example.com/my project",
    ]) {
      expect(check("C7", withProfile({ personalWebsite })).messages, personalWebsite).toEqual(["Not a web address"])
    }
  })

  test("checks both project links and preserves indices when projects are left out", () => {
    const resume = {
      ...jake,
      projectsSection: [
        { id: 1, projectName: "Hidden", projectGithub: "bad", leftOut: true as const },
        { id: 2, projectName: "Portfolio", projectGithub: "github.com/jake/site", additionalLink: "portfolio" },
        { id: 3, projectName: "Library", projectGithub: "github/jake/lib", additionalLink: "https://例子.中国" },
      ],
    }
    expect(check("C7", resume).findings.map(({ place }) => place)).toEqual([
      { kind: "entry", section: "Projects", entry: 1, field: "additionalLink" },
      { kind: "entry", section: "Projects", entry: 2, field: "projectGithub" },
    ])
  })
})

describe("C8 street address or ZIP code", () => {
  test("offers unscored privacy advice for a street address, while allowing postal codes", () => {
    for (const location of ["1234 Elm St, Austin, TX", "500 W 2nd Street Apt 4"]) {
      expect(check("C8", withProfile({ location })).findings[0]).toMatchObject({
        message: "Consider leaving off your street address",
        advisory: true,
      })
    }
    expect(check("C8", withProfile({ location: "Austin, TX 78701" })).status).toBe("passed")
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
    expect(check("C9", withProfile({ location: "Age: 22, Gender: Male" })).messages).toEqual([
      "Leave off your age",
      "Leave off your gender",
    ])
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
          "• Built date of birth validation for user registration",
          "• Designed support for married parents",
          "• Supported divorced and widowed clients",
          "• Tutored 14-year-old students",
          "• Authored a publication on gender: social and technical effects",
          "• Sex-ed outreach to 200 students, with Planned Parenthood",
          "• Born-digital archive of 3,000 letters",
        ].join("\n"),
      },
    ]
    const education = [{ id: 1, schoolName: "University of Texas at Austin", involvement: "Female Founders Club" }]
    expect(check("C9", { ...jake, workExperienceSection: work, educationSection: education }).status).toBe("passed")
  })

  test("distinguishes explicit personal disclosures from descriptions of other people", () => {
    for (const location of [
      "Date of birth: January 12, 2003",
      "Born on 12 Jan 2003",
      "My age: 24",
      "I'm 24 years old",
      "Gender: non-binary",
      "Marital status: Married",
    ]) {
      expect(check("C9", withProfile({ location })).status, location).toBe("failed")
    }
  })

  test("flags a labeled detail however its value is written", () => {
    for (const [location, name] of [
      ["Date of Birth: January 1st, 1990", "date of birth"],
      ["DOB: 1st Jan 1990", "date of birth"],
      ["DOB - 01 Jan 90", "date of birth"],
      ["DOB-04/12/2003", "date of birth"],
      ["Born: 12 Jan 2003", "date of birth"],
      ["Born on March 3rd, 2003", "date of birth"],
      ["Born in May 2003", "date of birth"],
      ["Austin, TX · Gender: M", "gender"],
      ["Sex: F", "gender"],
      ["Gender: Prefer not to say", "gender"],
      ["Marital status: Separated", "marital status"],
    ]) {
      expect(check("C9", withProfile({ location })).messages, location).toEqual([`Leave off your ${name}`])
    }
  })
})

describe("C10 Social Security number", () => {
  test("is a fix wherever it is", () => {
    expect(check("C10", withProfile({ location: "SSN 123-45-6789" })).findings).toEqual([
      expect.objectContaining({ level: "fix", message: "Leave off your Social Security number", text: "123-45-6789" }),
    ])
  })

  test("flags one written with spaces, or as nine digits after its name", () => {
    for (const location of ["SSN: 123456789", "Social Security No. 123456789", "Social Security number: 123 45 6789"]) {
      expect(check("C10", withProfile({ location })).messages, location).toEqual(["Leave off your Social Security number"])
    }
  })

  test("states uncertainty when a number is formatted like an SSN but has no SSN label", () => {
    for (const location of ["123 45 6789", "Reference ID 123-45-6789"]) {
      expect(check("C10", withProfile({ location })).messages, location).toEqual(["Possible Social Security number"])
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
