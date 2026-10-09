import { expect, test } from "vitest"
import { readBack, render, samples } from "./testRender"
import { toResumeContent, unplacedKey } from "./parse"
import type { Resume } from "@/lib/resume"
import type { ExtraSection } from "@/lib/resumeSections"

const first = "11111111-1111-4111-8111-111111111111"
const second = "22222222-2222-4222-8222-222222222222"
const normal = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase()

test("heuristic PDFs retain optional content and repeated unsupported groups across every template", async () => {
  for (const sample of samples) {
    const input: Resume = {
      selectedTemplate: sample.selectedTemplate,
      profileSection: { fullName: "Mara Lin" },
      extraSections: {
        summary: { kind: "summary", heading: "Summary", text: "Engineer building useful tools for curious people." },
        [first]: { kind: "text", heading: "Presentations", text: "First talk on accessible software." },
        [second]: { kind: "list", heading: "Presentations", bullets: "• Second talk on reliable systems." },
      },
      sectionOrder: ["extra:summary", `extra:${first}`, `extra:${second}`],
    }
    const { parsed } = await readBack(await render(input))
    const groups = parsed.extraGroups ?? []
    expect(
      groups.map((group) => group.kind),
      sample.selectedTemplate,
    ).toEqual(["summary"])
    const presentations = parsed.unplaced.filter((group) => /^presentations$/i.test(group.heading))
    expect(presentations, sample.selectedTemplate).toHaveLength(2)
    expect(presentations[0].id).not.toBe(presentations[1].id)
    const keepAs = Object.fromEntries(parsed.unplaced.map((group, index) => [unplacedKey(group, index), "text" as const]))
    const kept = toResumeContent(parsed, new Set(), { keepAs })
    const sections: ExtraSection[] = Object.values(kept.extraSections ?? {})
    const body = sections.map((section) => (section.kind === "list" ? section.bullets : section.text)).join(" ")
    for (const expected of [
      "Engineer building useful tools for curious people.",
      "First talk on accessible software.",
      "Second talk on reliable systems.",
    ]) {
      expect(normal(body), `${sample.selectedTemplate}: ${expected}`).toContain(normal(expected))
    }
    expect(normal(body).match(/first talk on accessible software/g)).toHaveLength(1)
    expect(normal(body).match(/second talk on reliable systems/g)).toHaveLength(1)
  }
})
