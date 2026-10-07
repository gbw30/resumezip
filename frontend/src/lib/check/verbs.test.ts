import { describe, expect, test } from "vitest"
import { firstWord } from "./text"
import { alternativesTo, inTenseOf, thirdPersonOf, verbOf } from "./verbs"

const tense = (word: string) => verbOf(word)?.tense ?? null

describe("reading a verb", () => {
  test("knows listed verbs in the present, the past and with an -s", () => {
    expect(verbOf("Build")).toEqual({ base: "build", past: "built", tense: "present", thirdPerson: false })
    expect(verbOf("Built")).toEqual({ base: "build", past: "built", tense: "past", thirdPerson: false })
    expect(verbOf("Builds")).toEqual({ base: "build", past: "built", tense: "present", thirdPerson: true })
    expect(tense("Lead")).toBe("present")
    expect(tense("Led")).toBe("past")
    expect(tense("Teaches")).toBe("present")
    expect(tense("Studies")).toBe("present")
  })

  test("calls a verb that's the same in both tenses either", () => {
    for (const word of ["Cut", "Set", "Forecast"]) expect(tense(word), word).toBe("either")
  })

  test("knows any word ending in -ed or -ing, listed or not", () => {
    expect(verbOf("Spearheaded")).toMatchObject({ tense: "past" })
    expect(verbOf("Containerized")).toEqual({ base: "containerized", tense: "past", thirdPerson: false })
    expect(tense("Building")).toBe("ing")
  })

  test("reads British spellings and the verb after a hyphen", () => {
    expect(verbOf("Optimised")).toMatchObject({ base: "optimize", tense: "past" })
    expect(verbOf("Analyse")).toMatchObject({ base: "analyze", tense: "present" })
    expect(verbOf("Advise")).toMatchObject({ base: "advise", tense: "present" })
    expect(tense("Co-founded")).toBe("past")
    expect(tense("Re-wrote")).toBe("past")
  })

  test("isn't fooled by words that aren't verbs", () => {
    for (const word of ["The", "Dashboard", "Python", "Key", "A", "Responsible", "Successfully", "Open-source", "Need"]) {
      expect(verbOf(word), word).toBeNull()
    }
  })
})

describe("suggesting other verbs", () => {
  test("in the same tense and form", () => {
    expect(alternativesTo(verbOf("Built")!)).toEqual(["Created", "Developed", "Engineered"])
    expect(alternativesTo(verbOf("Lead")!)).toEqual(["Direct", "Head", "Guide"])
    expect(alternativesTo(verbOf("Leads")!)).toEqual(["Directs", "Heads", "Guides"])
    expect(alternativesTo(verbOf("Spearheaded")!)).toEqual([])
    expect(inTenseOf("cut", verbOf("Led")!)).toBe("Cut")
  })

  test("forms the -s of a verb", () => {
    expect(["build", "teach", "fix", "study", "deploy"].map(thirdPersonOf)).toEqual(["builds", "teaches", "fixes", "studies", "deploys"])
  })
})

describe("a bullet's first word", () => {
  test("skips quotes and dashes before it, and keeps hyphens inside it", () => {
    expect(firstWord("Co-founded a club")).toBe("Co-founded")
    expect(firstWord("“Led” the team")).toBe("Led")
    expect(firstWord("- Built a site")).toBe("Built")
    expect(firstWord("50% faster builds")).toBe("50")
    expect(firstWord("")).toBe("")
  })
})
