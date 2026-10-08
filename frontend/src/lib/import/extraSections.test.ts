import { describe, expect, test, vi } from "vitest"
import { extraGroupKey, parseResume, toResumeContent, unplacedKey } from "./parse"
import { readFile } from "./read"
import { wordFile } from "./testFiles"
import type { Line } from "./lines"

const line = (text: string, heading = false, bullet = false): Line => ({
  text, heading, bullet, parts: [{ text, x: 72, runs: [{ start: 0, end: text.length, bold: heading, italic: false }] }],
  left: 72, x: 72, size: heading ? 13 : 11, bold: heading, italic: false, links: [],
})
const parse = (...rows: (string | [string, boolean, boolean?])[]) => parseResume(rows.map((row) => typeof row === "string" ? line(row) : line(...row)))

describe("flexible section import review", () => {
  test("parsing gives stable heading occurrence addresses without generating editor UUIDs", () => {
    const uuid = vi.spyOn(crypto, "randomUUID")
    try {
      const rows: Line[] = [line("Mara Lin"), line("Summary", true), line("Engineer building useful tools."), line("Summary", true), line("Mentor and teacher.")]
      const first = parseResume(rows)
      expect(parseResume(rows).occurrences).toEqual(first.occurrences)
      expect(first.extraGroups?.map((group) => group.id)).toEqual(["heading:1", "heading:3"])
      expect(first.extraGroups?.map((group) => group.sourceLines)).toEqual([[1, 2], [3, 4]])
      expect(uuid).not.toHaveBeenCalled()
    } finally {
      uuid.mockRestore()
    }
  })

  test("selected summary groups consolidate in source order using the first selected heading and position", () => {
    const parsed = parse("Mara Lin", ["Summary", true], "First paragraph.", ["Work", true], "Engineer | Acme Inc", ["Professional Summary", true], "Second paragraph.")
    const all = toResumeContent(parsed)
    expect(all.extraSections.summary).toEqual({ kind: "summary", heading: "Summary", text: "First paragraph.\n\nSecond paragraph." })
    expect(all.sectionOrder.slice(0, 2)).toEqual(["extra:summary", "Work"])
    const second = toResumeContent(parsed, new Set([extraGroupKey(parsed.extraGroups![0].id)]))
    expect(second.extraSections.summary.heading).toBe("Professional Summary")
    expect(second.extraSections.summary.text).toBe("Second paragraph.")
    expect(second.sectionOrder.slice(0, 2)).toEqual(["Work", "extra:summary"])
  })

  test("summary prose keeps a literal circle and bullet summaries remain reviewable", () => {
    const prose = parse("Mara Lin", ["Summary", true], "○ This is literal prose.")
    expect(toResumeContent(prose).extraSections.summary.text).toBe("○ This is literal prose.")
    const bullets = parse("Mara Lin", ["Summary", true], ["Strong collaborator", false, true])
    expect(bullets.extraGroups).toEqual([])
    expect(bullets.unplaced[0].text).toEqual(["Strong collaborator"])
  })

  test("credential labels are interpreted conservatively and uncertain fragments survive", () => {
    const parsed = parse("Mara Lin", ["Certifications", true], "Cloud Engineer | Issuer: Example Co | Issued: May 2024 | Expires: 2027 | Credential ID: ABC-123 | https://example.com/verify", "Safety Training | uncertain detail", ["Certificates", true], "First Aid")
    expect(parsed.extraGroups).toHaveLength(2)
    expect(parsed.unplaced[0].text).toEqual(["uncertain detail"])
    const content = toResumeContent(parsed)
    expect(content.extraSections.certifications.entries).toHaveLength(3)
    expect(content.extraSections.certifications.entries[0]).toMatchObject({
      name: "Cloud Engineer", issuer: "Example Co", issued: "May 2024", expires: "2027", credentialId: "ABC-123", link: "https://example.com/verify",
    })
    expect(new Set(content.extraSections.certifications.entries.map((entry: { id: string }) => entry.id)).size).toBe(3)
  })

  test("mixed Awards and Certifications await a deliberate choice without being split or duplicated", () => {
    const parsed = parse("Mara Lin", ["Awards & Certifications", true], "Community Award, Example Org", "Cloud Certificate, Example Co")
    expect(parsed.sections).toEqual([])
    expect(parsed.extraGroups).toEqual([])
    expect(parsed.unplaced[0].text).toEqual(["Community Award, Example Org", "Cloud Certificate, Example Co"])
    expect(toResumeContent(parsed).extraSections).toBeUndefined()
    const id = unplacedKey(parsed.unplaced[0], 0)
    const content = toResumeContent(parsed, new Set(), { keepAs: { [id]: "text" } })
    expect(Object.values(content.extraSections)).toEqual([{ kind: "text", heading: "Awards & Certifications", text: "Community Award, Example Org\nCloud Certificate, Example Co" }])
    expect(content.awardsSection).toEqual([])
  })

  test.each(["Certifications", "Awards & Certifications", "Certifications & Awards"])("checker parsing preserves the original Awards semantics for %s", (heading) => {
    const rows = [line("Mara Lin"), line(heading, true), line("Community Award, Example Org 2024")]
    const checked = parseResume(rows, { purpose: "check" })
    expect(checked.sections.map((section) => section.name)).toEqual(["Awards"])
    expect(checked.sections[0].entries[0].fields.awardName).toBe("Community Award")
    expect(checked.unplaced).toEqual([])
    expect(checked.extraGroups).toEqual([])
    const imported = parseResume(rows)
    expect(imported.sections).toEqual([])
    expect(imported.extraGroups?.length || imported.unplaced.length).toBeGreaterThan(0)
  })

  test("repeated unsupported headings remain independently selectable with durable UUIDs only at confirmation", () => {
    const parsed = parse("Mara Lin", ["Presentations", true], "First talk", ["Presentations", true], "Second talk")
    expect(parsed.unplaced.map((group) => group.heading)).toEqual(["Presentations", "Presentations"])
    expect(parsed.unplaced[0].id).not.toBe(parsed.unplaced[1].id)
    expect(toResumeContent(parsed).extraSections).toBeUndefined()
    const keepAs = Object.fromEntries(parsed.unplaced.map((group, index) => [unplacedKey(group, index), index === 0 ? "text" : "list"])) as Record<string, "text" | "list">
    const content = toResumeContent(parsed, new Set(), { keepAs })
    expect(Object.keys(content.extraSections)).toHaveLength(2)
    expect(Object.values(content.extraSections)).toEqual([
      { kind: "text", heading: "Presentations", text: "First talk" },
      { kind: "list", heading: "Presentations", bullets: "• Second talk" },
    ])
    expect(content.sectionOrder.slice(0, 2)).toEqual(Object.keys(content.extraSections).map((key) => `extra:${key}`))
  })

  test("Word parsing preserves recognized groups and uncertain leftover words for review", async () => {
    const paragraphs = ["Mara Lin", "SUMMARY", "Engineer building useful tools.", "CERTIFICATIONS", "Cloud Engineer | Issuer: Example Co", "PRESENTATIONS", "Talk on accessible software"]
    const result = await readFile({ kind: "docx", data: new Uint8Array(wordFile(paragraphs)).buffer })
    expect("parsed" in result).toBe(true)
    if (!("parsed" in result)) return
    expect(result.parsed.extraGroups?.map((group) => group.kind)).toEqual(["summary", "certifications"])
    expect(result.parsed.unplaced.flatMap((group) => group.text)).toContain("Talk on accessible software")
  })
})
