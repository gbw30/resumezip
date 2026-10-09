import { SECTION_NAMES, SECTIONS, type SectionName } from "@/components/editor/sections"
import type { Resume } from "@/lib/resume"

export interface Certification {
  id: string
  name: string
  issuer: string
  issued: string
  expires: string
  credentialId: string
  link: string
  leftOut?: boolean
}

interface ExtraBase {
  heading: string
  leftOut?: boolean
}
export type ExtraSection =
  | (ExtraBase & { kind: "summary" | "text"; text: string })
  | (ExtraBase & { kind: "list"; bullets: string })
  | (ExtraBase & { kind: "certifications"; entries: Certification[] })
export type ExtraKind = ExtraSection["kind"]
export type ExtraSections = Record<string, ExtraSection>
export type SectionRef = SectionName | `extra:${string}`
export type ExtraPatch = { heading?: string; leftOut?: boolean; text?: string; bullets?: string }
export type CredentialPatch = Partial<Omit<Certification, "id">>

export const CERTIFICATION_FIELDS = ["name", "issuer", "issued", "expires", "credentialId", "link"] as const
export const isUUID = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
export const extraKey = (ref: string): string | null => (ref.startsWith("extra:") ? ref.slice(6) : null)
export const extraRef = (key: string): SectionRef => `extra:${key}`
export const sectionIncluded = (section: { leftOut?: boolean }) => section.leftOut !== true
export const credentialIncluded = sectionIncluded
export const extraHeading = (section: ExtraSection) =>
  section.heading.trim() || (section.kind === "summary" ? "Summary" : section.kind === "certifications" ? "Certifications" : "New section")

/** Decode only the new domain. Invalid members are salvaged separately from the original raw save. */
export function readExtraSections(value: unknown, { local = false } = {}): { sections: ExtraSections; complete: boolean } {
  if (!object(value)) return { sections: {}, complete: false }
  let complete = true
  const members: [string, ExtraSection][] = []
  for (const [key, raw] of Object.entries(value)) {
    const section = readExtraSection(key, raw)
    if (section) {
      members.push([key, section])
      // Future local fields must be recoverable before a narrower editor saves.
      // Portable files instead pass through an explicit public allowlist.
      if (local && object(raw)) {
        const allowed = new Set([
          "kind",
          "heading",
          "leftOut",
          section.kind === "certifications" ? "entries" : section.kind === "list" ? "bullets" : "text",
        ])
        if (Object.keys(raw).some((field) => !allowed.has(field))) complete = false
        if (
          section.kind === "certifications" &&
          (raw.entries as unknown[]).some(
            (entry) => object(entry) && Object.keys(entry).some((field) => !["id", "leftOut", ...CERTIFICATION_FIELDS].includes(field)),
          )
        )
          complete = false
      }
    } else complete = false
  }
  return { sections: Object.fromEntries(members), complete }
}

function readExtraSection(key: string, value: unknown): ExtraSection | null {
  if (!object(value)) return null
  const kind = value.kind
  if (
    key === "summary"
      ? kind !== "summary"
      : key === "certifications"
        ? kind !== "certifications"
        : !isUUID(key) || (kind !== "text" && kind !== "list")
  )
    return null
  if (
    (value.heading !== undefined && typeof value.heading !== "string") ||
    (value.leftOut !== undefined && typeof value.leftOut !== "boolean")
  )
    return null
  const base = { heading: (value.heading ?? "") as string, ...(value.leftOut !== undefined && { leftOut: value.leftOut as boolean }) }
  if (kind === "summary" || kind === "text") {
    if (value.text !== undefined && typeof value.text !== "string") return null
    return { ...base, kind, text: (value.text ?? "") as string }
  }
  if (kind === "list") {
    if (value.bullets !== undefined && typeof value.bullets !== "string") return null
    return { ...base, kind, bullets: (value.bullets ?? "") as string }
  }
  if (!Array.isArray(value.entries)) return null
  const ids = new Set<string>()
  const entries: Certification[] = []
  for (const raw of value.entries) {
    if (!object(raw) || !isUUID(raw.id) || ids.has(raw.id) || (raw.leftOut !== undefined && typeof raw.leftOut !== "boolean")) return null
    if (CERTIFICATION_FIELDS.some((field) => raw[field] !== undefined && typeof raw[field] !== "string")) return null
    ids.add(raw.id)
    entries.push({
      id: raw.id,
      ...Object.fromEntries(CERTIFICATION_FIELDS.map((field) => [field, raw[field] ?? ""])),
      ...(raw.leftOut !== undefined && { leftOut: raw.leftOut }),
    } as Certification)
  }
  return { ...base, kind: "certifications", entries }
}

// Saved data, so both are read as unknown and checked here.
export function extrasOf(resume: { extraSections?: unknown }): ExtraSections {
  return resume.extraSections === undefined ? {} : readExtraSections(resume.extraSections).sections
}

/** A view only: opening a resume never repairs order, creates content or generates identities. */
export function resolveSections(resume: { sectionOrder?: unknown; extraSections?: unknown }): SectionRef[] {
  const extras = extrasOf(resume)
  const valid = (value: unknown): value is SectionRef =>
    typeof value === "string" &&
    (SECTION_NAMES.includes(value as SectionName) || (extraKey(value) !== null && Object.hasOwn(extras, extraKey(value)!)))
  const order: SectionRef[] = []
  const seen = new Set<SectionRef>()
  const add = (ref: SectionRef) => {
    if (!seen.has(ref)) {
      seen.add(ref)
      order.push(ref)
    }
  }
  for (const ref of Array.isArray(resume.sectionOrder) ? resume.sectionOrder : []) if (valid(ref)) add(ref)
  for (const name of SECTION_NAMES) add(name)
  for (const key of Object.keys(extras)) add(extraRef(key))
  return order
}

export function sectionTitle(resume: Resume, ref: SectionRef): string {
  const key = extraKey(ref)
  if (key !== null) {
    const section = extrasOf(resume)[key]
    return section ? extraHeading(section) : "New section"
  }
  const section = SECTIONS[ref as SectionName]
  const heading = resume.headings?.[section.headingKey]
  return typeof heading === "string" && heading.trim() ? heading : section.title
}

export function extraHasBody(section: ExtraSection): boolean {
  if (!sectionIncluded(section)) return false
  if (section.kind === "certifications")
    return section.entries.some((entry) => credentialIncluded(entry) && CERTIFICATION_FIELDS.some((field) => entry[field].trim()))
  if (section.kind === "list")
    return section.bullets.split("\n").some((line) => !line.trimStart().startsWith("○") && line.replace(/^\s*•\s*/, "").trim())
  return !!section.text.trim()
}

export function newExtraSection(kind: ExtraKind): ExtraSection {
  const heading = kind === "summary" ? "Summary" : kind === "certifications" ? "Certifications" : "New section"
  if (kind === "certifications") return { kind, heading, entries: [] }
  if (kind === "list") return { kind, heading, bullets: "" }
  return { kind, heading, text: "" }
}

export const newCertification = (): Certification => ({
  id: crypto.randomUUID(),
  name: "",
  issuer: "",
  issued: "",
  expires: "",
  credentialId: "",
  link: "",
})
