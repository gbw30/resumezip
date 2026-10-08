import { describe, expect, test } from "vitest"
import type { Resume } from "@/lib/resume"
import { pronounIn } from "./bullets"
import { runChecks } from "./engine"
import { RULES } from "./rules"

const job = (bullets: string[], workEndDate = "Present", companyName = "Google") => ({
  id: 1,
  workRole: "Engineer",
  companyName,
  workStartDate: "Jan 2022",
  workEndDate,
  workDescription: bullets.map((bullet) => `• ${bullet}`).join("\n"),
})

const project = (bullets: string[]) => ({ id: 1, projectName: "Gitlytics", projectDescription: bullets.map((bullet) => `• ${bullet}`).join("\n") })

const resumeWith = (...jobs: ReturnType<typeof job>[]) => ({ profileSection: { fullName: "Jake Ryan" }, workExperienceSection: jobs })

const TODAY = new Date(2026, 9, 7)

/** What one rule says about a resume. */
function check(id: string, resume: Resume) {
  const rule = RULES.find((rule) => rule.id === id)!
  const report = runChecks(resume, { rules: [rule], today: TODAY })
  return {
    status: report.results[0].status,
    credit: report.results[0].credit,
    messages: report.findings.map((finding) => finding.message),
    findings: report.findings,
  }
}

const bulletAt = (line: number, entry = 0) => ({ kind: "entry", section: "Work", entry, field: "workDescription", line })

const good = ["Built a search index that cut query time by 40%", "Led a team of 4 engineers", "Wrote the API docs used by 30 partners"]

test("well-written bullets pass every bullet rule", () => {
  for (const id of ["B1", "B2", "B3", "B4", "B5", "B6", "B8", "B9"]) {
    expect(check(id, resumeWith(job(good))).status, id).toBe("passed")
  }
  // Still going, so nothing to put in the past tense.
  expect(check("B7", resumeWith(job(good))).status).toBe("skipped")
})

describe("B1 weak starts", () => {
  test("points at each bullet with one", () => {
    const resume = resumeWith(job(["Responsible for the build system", "Helped launch the app", "Worked on search", "Assisted the team"]))
    expect(check("B1", resume).messages).toEqual([
      "“Responsible for” is a weak start",
      "“Helped” is a weak start",
      "“Worked on” is a weak start",
      "“Assisted” is a weak start",
    ])
    expect(check("B1", resume).findings[1].place).toEqual(bulletAt(1))
  })

  test("doesn't flag words that only start the same way", () => {
    expect(check("B1", resumeWith(job(["Helpdesk tickets fell by half after the redesign", "Assistant coach for the robotics team"]))).status).toBe("passed")
  })
})

describe("B2 action verbs", () => {
  test("flags a job's bullet that doesn't start with a verb", () => {
    expect(check("B2", resumeWith(job(["The dashboard was used by 40 teams", "Built the search index", "Experienced in Python and Go"]))).findings).toEqual([
      expect.objectContaining({ place: bulletAt(0), message: "Doesn't start with an action verb" }),
      expect.objectContaining({ place: bulletAt(2) }),
    ])
  })

  test("takes any tense, British spellings, and bullets that start with a number", () => {
    const bullets = ["Lead a team of 4", "Optimised the build", "Co-founded the club", "Building a new parser", "50% fewer pages after the redesign", "$2M saved in cloud costs"]
    expect(check("B2", resumeWith(job(bullets))).status).toBe("passed")
  })

  test("leaves projects, weak starts and “I” to other rules", () => {
    const resume = { ...resumeWith(job(["Responsible for the build system", "I built the search index"])), projectsSection: [project(["Interactive map of subway delays"])] }
    expect(check("B2", resume).status).toBe("passed")
  })
})

describe("B3 bullets with a number", () => {
  test("gives partial credit below half, with one finding for the section", () => {
    const result = check("B3", resumeWith(job(["Built the search index", "Led the redesign", "Wrote the API docs", "Cut query time by 40%"])))
    expect(result.findings).toEqual([
      expect.objectContaining({ place: { kind: "section", section: "Work" }, message: "1 of 4 bullets have a number" }),
    ])
    expect(result.credit).toBe(0.5)
  })

  test("counts digits, %, $ and numbers written as words", () => {
    const bullets = ["Built the search index", "Mentor two junior engineers", "Saved $2M a year", "Led the redesign"]
    expect(check("B3", resumeWith(job(bullets))).status).toBe("passed")
  })

  test("skips a resume with too few bullets to say", () => {
    expect(check("B3", resumeWith(job(["Built the search index", "Led the redesign"]))).status).toBe("skipped")
  })
})

describe("B4 “I” and “we”", () => {
  test("flags each bullet that uses them", () => {
    const resume = resumeWith(job(["I built the search index", "Grew our user base", "Led my team", "We shipped weekly", "Built it so i could test it"]))
    expect(check("B4", resume).messages).toEqual(["Uses “I”", "Uses “our”", "Uses “my”", "Uses “We”", "Uses “i”"])
  })

  test("doesn't take other words for them", () => {
    for (const text of ["Wrote I/O drivers", "Ran a Phase I trial", "Raised funds for Save Our Seas", "Ran IT support", "Grew US sales", "Cut costs, i.e. hosting", "Taught ME 101"]) {
      expect(pronounIn(text), text).toBeNull()
    }
  })
})

describe("B5 buzzwords and vague words", () => {
  test("flags them, saying which", () => {
    const resume = resumeWith(job(["Results-driven engineer who shipped fast", "Worked with various teams", "Built tools, scripts, etc."]))
    expect(check("B5", resume).messages).toEqual(["“Results-driven” says little on its own", "“various” is vague", "“etc.” is vague"])
  })

  test("doesn't flag technical words that look like them", () => {
    const bullets = ["Used dynamic programming to cut costs", "Built an Internet of Things gateway", "Led a variety show", "Made the build faster and more reliable"]
    expect(check("B5", resumeWith(job(bullets))).status).toBe("passed")
  })
})

describe("B6 the same first verb", () => {
  test("flags the third bullet on, whatever the tense, with other verbs to try", () => {
    const resume = resumeWith(job(["Built the index", "Build the parser", "Built the cache", "Built the queue", "Led the team"]))
    expect(check("B6", resume).findings).toEqual([
      expect.objectContaining({ place: bulletAt(2), message: "“Built” starts 4 bullets", suggestion: "Try “Created”, “Developed” or “Engineered”." }),
      expect.objectContaining({ place: bulletAt(3) }),
    ])
  })

  test("counts verbs only", () => {
    const bullets = ["The index", "The parser", "The cache", "Building a queue", "Building a cache", "Building a log", "Built X", "Led Y", "Wrote Z"]
    expect(check("B6", resumeWith(job(bullets))).status).toBe("passed")
  })
})

describe("B7 present tense on what has ended", () => {
  test("flags a present-tense verb on an ended job, with its past tense", () => {
    expect(check("B7", resumeWith(job(["Lead a team of 4", "Teaches a weekly class", "Built the index"], "Dec 2023"))).findings).toEqual([
      expect.objectContaining({ place: bulletAt(0), message: "“Lead” is present tense, but this has ended", suggestion: "Try “Led”." }),
      expect.objectContaining({ place: bulletAt(1), suggestion: "Try “Taught”." }),
    ])
  })

  test("counts a season to its last month: fall runs to December", () => {
    expect(check("B7", resumeWith(job(["Lead a team of 4"], "Fall 2026"))).status).toBe("skipped")
    expect(check("B7", resumeWith(job(["Lead a team of 4"], "Spring 2026"))).messages).toEqual(["“Lead” is present tense, but this has ended"])
  })

  test("leaves jobs that haven't ended, verbs the same in both tenses, and projects", () => {
    expect(check("B7", resumeWith(job(["Lead a team of 4"], "Present"))).status).toBe("skipped")
    expect(check("B7", resumeWith(job(["Lead a team of 4"], "2026"))).status).toBe("skipped")
    expect(check("B7", resumeWith(job(["Cut costs by 40%", "Set up CI"], "Dec 2023"))).status).toBe("passed")
    const resume = { ...resumeWith(job(["Built the index"], "Dec 2023")), projectsSection: [{ ...project(["Scrapes 9,000 listings"]), projectDate: "2021" }] }
    expect(check("B7", resume).status).toBe("passed")
  })
})

describe("B8 how many bullets", () => {
  test("flags a job with none, and one with more than 6 at the first one too many", () => {
    const seven = ["One", "Two", "Three", "Four", "Five", "Six", "Seven"].map((word) => `Built ${word}`)
    const resume = resumeWith(job([]), { ...job(seven), id: 2 }, { ...job(seven.slice(0, 6)), id: 3 })
    expect(check("B8", resume).findings).toEqual([
      expect.objectContaining({ place: { kind: "entry", section: "Work", entry: 0, field: "workDescription" }, message: "No bullets" }),
      expect.objectContaining({ place: bulletAt(6, 1), message: "7 bullets" }),
    ])
  })
})

describe("B9 repeated bullets", () => {
  test("lets each copy of a bullet written three times be dismissed on its own", () => {
    const findings = check("B9", resumeWith(job(["Built the index", "Built the index", "Built the index"]))).findings
    expect(findings.map((finding) => finding.place)).toEqual([bulletAt(1), bulletAt(2)])
    expect(findings[0].key).not.toBe(findings[1].key)
  })

  test("flags a long bullet a letter or two from another, but not short ones or different symbols", () => {
    const near = ["Managed customer account records for the sales team", "Managed customer accounts records for the sales team"]
    expect(check("B9", resumeWith(job(near))).findings).toEqual([
      expect.objectContaining({ place: bulletAt(1), message: "Almost the same as another bullet" }),
    ])
    expect(check("B9", resumeWith(job(["Built C++ tools", "Built C tools", "Led 5 engineers", "Led 6 engineers"]))).status).toBe("passed")
  })

  test("flags a bullet that's the same as one before it, case and punctuation aside", () => {
    const resume = resumeWith(job(["Built the search index."]), { ...job(["Led the team", "built the Search Index"]), id: 2 })
    expect(check("B9", resume).findings).toEqual([
      expect.objectContaining({ place: bulletAt(1, 1), message: "Same as another bullet" }),
    ])
  })
})
