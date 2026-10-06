// Resumes are saved in the browser's localStorage, as one JSON object by id.
// That's the only copy there is, so nothing here throws: the browser can
// block storage or run out of room, and what's saved can be unreadable. None
// of that may crash the app or get saved over.

import { SECTIONS } from "@/components/editor/sections"

/** Where the resumes are saved. */
export const RESUMES_KEY = "allResumes"

/**
 * Saved data that can't be read is kept instead of being saved over, each
 * time under a key of its own: this, then the time and a random suffix.
 */
export const UNREADABLE_PREFIX = "allResumes-unreadable-"
const KEPT = new RegExp(`^${UNREADABLE_PREFIX}(\\d+)-[a-z0-9]*$`)

/** Whether a localStorage key holds saved data kept aside. */
export const isKeptAside = (key: string) => KEPT.test(key)

type Resumes = Record<string, Record<string, any>>

/**
 * Whether the latest changes are saved: "blocked" when the browser won't let
 * the site save anything, "full" when its storage is out of room, and
 * "failed" when anything else stops a save.
 */
export type SaveStatus = "saved" | "blocked" | "full" | "failed"

/** localStorage, or null when the browser won't let the site use it. */
export function getStorage(): Storage | null {
  try {
    // Reading it throws when the browser blocks sites from saving data, and
    // some apps' built-in browsers don't have it.
    return window.localStorage ?? null
  } catch {
    return null
  }
}

export interface Loaded {
  /** The saved resumes that could be read; none if nothing is saved yet. */
  resumes: Resumes
  /** Whether some of what's saved couldn't be read. It's kept aside unless the status says otherwise. */
  unreadable: boolean
  /** "saved" if saving can go ahead; otherwise why it mustn't. */
  status: SaveStatus
}

/** Reads the saved resumes, as readResumes does. */
export function loadResumes(storage: Storage | null): Loaded {
  const blocked: Loaded = { resumes: {}, unreadable: false, status: "blocked" }
  if (!storage) return blocked
  let text: string | null
  try {
    text = storage.getItem(RESUMES_KEY)
  } catch {
    return blocked
  }
  return text === null ? { resumes: {}, unreadable: false, status: "saved" } : readResumes(storage, text)
}

/**
 * Reads resumes from saved text, as loaded or as another tab saved it. If any
 * of it can't be read, all of it is kept aside first, so saving the rest
 * can't destroy it. If that fails, the status says not to save.
 */
export function readResumes(storage: Storage, text: string): Loaded {
  const { resumes, complete } = parse(text)
  if (complete) return { resumes, unreadable: false, status: "saved" }
  return { resumes, unreadable: true, status: keepAside(storage, text) ? "saved" : "failed" }
}

/**
 * Whether saving can start again after it was stopped to protect saved data
 * that couldn't be kept aside: yes once something readable has replaced it,
 * or once it can be kept aside (there may be room now).
 */
export function canSaveOver(storage: Storage): boolean {
  try {
    const text = storage.getItem(RESUMES_KEY)
    return text === null || readResumes(storage, text).status === "saved"
  } catch {
    return false
  }
}

/** The resumes in saved text that can be read, and whether that's all of it. */
function parse(text: string): { resumes: Resumes; complete: boolean } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { resumes: {}, complete: false }
  }
  if (!isObject(value)) return { resumes: {}, complete: false }
  let complete = true
  const resumes: [string, Record<string, any>][] = []
  for (const [id, resume] of Object.entries(value)) {
    if (!isObject(resume)) {
      complete = false
      continue
    }
    // The editor would show a field or entry in another shape as empty, or
    // crash on it, and the first edit would replace it. So it's left out
    // here, with the text kept aside.
    const fields: [string, unknown][] = []
    for (const [key, field] of Object.entries(resume)) {
      const readable = readField(key, field)
      if (!readable?.complete) complete = false
      if (readable) fields.push([key, readable.value])
    }
    resumes.push([id, Object.fromEntries(fields)])
  }
  // fromEntries keeps an id like "__proto__" an ordinary key. Assigning it
  // would set the object's prototype instead, and the resume would be lost.
  return { resumes: Object.fromEntries(resumes), complete }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// Fields the editor reads as lists of entries, and as objects. Older resumes
// can lack some of them, or have them empty (null); only other shapes count.
const ENTRY_LISTS = new Set(Object.values(SECTIONS).map((section) => section.dataKey))
const OBJECTS = new Set(["profileSection", "headings"])

/** A field as the editor can show it, and whether that's all of it; null if none of it. */
function readField(key: string, value: unknown): { value: unknown; complete: boolean } | null {
  if (value == null) return { value, complete: true }
  if (key === "sectionOrder" || ENTRY_LISTS.has(key)) {
    if (!Array.isArray(value)) return null
    // Entries are objects, and the section order is a list of names.
    const items = value.filter(key === "sectionOrder" ? (item) => typeof item === "string" : isObject)
    return { value: items, complete: items.length === value.length }
  }
  if (OBJECTS.has(key) && !isObject(value)) return null
  return { value, complete: true }
}

/** Saves the resumes over what was saved before, and says how that went. */
export function saveResumes(storage: Storage | null, resumes: Resumes): SaveStatus {
  if (!storage) return "blocked"
  try {
    storage.setItem(RESUMES_KEY, JSON.stringify(resumes))
    return "saved"
  } catch (error) {
    if (isQuotaError(error)) return "full"
    console.warn("Couldn't save resumes:", error)
    return "failed"
  }
}

// Older versions of Firefox give the error their own name.
const isQuotaError = (error: unknown) =>
  error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")

/** Copies saved data under a key of its own (see UNREADABLE_PREFIX). False if it couldn't. */
function keepAside(storage: Storage, text: string): boolean {
  try {
    // Another tab may have kept it already.
    if (keptKeys(storage).some((key) => storage.getItem(key) === text)) return true
    // A new key every time, so two tabs keeping different data at once can't
    // pick the same one and save over each other's copy.
    storage.setItem(`${UNREADABLE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text)
    return true
  } catch {
    return false
  }
}

/** The keys of the data kept aside, oldest first. */
function keptKeys(storage: Storage): string[] {
  const kept: [number, string][] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    const time = key?.match(KEPT)?.[1]
    if (key && time) kept.push([Number(time), key])
  }
  return kept.sort(([a, keyA], [b, keyB]) => a - b || keyA.localeCompare(keyB)).map(([, key]) => key)
}

/** The saved data kept aside because it couldn't be read, oldest first. */
export function readKeptAside(storage: Storage | null): string[] {
  if (!storage) return []
  try {
    return keptKeys(storage).flatMap((key) => storage.getItem(key) ?? [])
  } catch {
    return []
  }
}

/** Deletes the saved data kept aside. */
export function deleteKeptAside(storage: Storage | null) {
  if (!storage) return
  try {
    for (const key of keptKeys(storage)) storage.removeItem(key)
  } catch {
    // Anything not deleted is still listed by readKeptAside.
  }
}
