import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { dialectOf } from "./dialect"
import { HARPER_FILE, HARPER_INTEGRITY, HARPER_VERSION } from "./harper"
import { harperLints } from "./testHarper"

// After updating harper.js, update HARPER_VERSION and HARPER_INTEGRITY to match.
test("Harper loaded from jsDelivr is the installed one", () => {
  const dir = path.resolve("node_modules/harper.js")
  expect(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version).toBe(HARPER_VERSION)
  const file = readFileSync(path.join(dir, HARPER_FILE))
  expect(HARPER_INTEGRITY).toBe(`sha256-${createHash("sha256").update(file).digest("base64")}`)
})

test("the English follows the browser's language", () => {
  expect(dialectOf(["en-US", "en"])).toBe("american")
  expect(dialectOf(["en-GB"])).toBe("british")
  expect(dialectOf(["fr-FR", "en-AU"])).toBe("australian")
  expect(dialectOf(["en-CA"])).toBe("canadian")
  expect(dialectOf(["en-IN"])).toBe("indian")
  expect(dialectOf(["de-DE"])).toBe("american")
  expect(dialectOf([])).toBe("american")
})

describe("checking text with Harper", () => {
  const rulesIn = async (text: string) => (await harperLints([text]))[0].map((lint) => `${lint.rule} ${lint.text}`)

  test("finds typos, with what to write instead", async () => {
    const [lints] = await harperLints(["Recieved an award"])
    expect(lints).toEqual([
      expect.objectContaining({
        rule: "SpellCheck",
        kind: "Spelling",
        text: "Recieved",
        start: 0,
        suggestions: expect.arrayContaining(["Received"]),
      }),
    ])
  })

  test("lets through forms of words it knows, though its dictionary leaves them out", async () => {
    expect(await rulesIn("Prototyped a parser")).toEqual([])
    expect(await rulesIn("Distilled the findings")).toEqual([])
    expect(await rulesIn("Prototypd a parser")).toEqual(["SpellCheck Prototypd"])
    // Unless the form itself is misspelled, though the word it's built on isn't.
    expect(await rulesIn("Occuring weekly, it was begining to help")).toEqual(["SpellCheck Occuring", "SpellCheck begining"])
    expect(await rulesIn("Transfered and comitted the code")).toEqual(["SpellCheck Transfered", "SpellCheck comitted"])
  })

  test("finds repeated words, a and an, and mix-ups", async () => {
    expect(await rulesIn("Built the the index")).toEqual(["RepeatedWords the the"])
    expect(await rulesIn("Hired an university student")).toEqual(["AnA an"])
    expect(await rulesIn("Faster then the old one")).toEqual(["ThenThan then"])
  })

  test("leaves out the rules that are wrong for resumes", async () => {
    expect(await rulesIn("Kept a shared roadmap of requests in 5 ms")).toEqual([])
    expect(await rulesIn("Cleaned data sets for the team")).toEqual([])
  })

  test("checks each text on its own, keeping their order", async () => {
    const lints = await harperLints(["Recieved", "Fine words", "the the"])
    expect(lints.map((found) => found.map((lint) => lint.rule))).toEqual([["SpellCheck"], [], ["RepeatedWords"]])
  })

  test("lets through a word spelled right in any English, whichever it reads", async () => {
    expect((await harperLints(["Optimised the honours programme at the centre, and travelled"]))[0]).toEqual([])
    expect((await harperLints(["Optimized the honors program at the center, and traveled"], "british"))[0]).toEqual([])
    expect((await harperLints(["Raised 3 lakh rupees"]))[0]).toEqual([])
    expect(await rulesIn("Controled the budget")).toEqual(["SpellCheck Controled"])
  })

  test("doesn't take a misspelled -ies form for one built on its word", async () => {
    expect(await rulesIn("Identifys and simplifys workflows")).toEqual(["SpellCheck Identifys", "SpellCheck simplifys"])
  })

  test("says where each finding starts as JavaScript counts", async () => {
    const [[lint]] = await harperLints(["😀😀 Shipped a app"])
    expect(lint).toEqual(expect.objectContaining({ rule: "AnA", text: "a", start: "😀😀 Shipped ".length }))
  })
})
