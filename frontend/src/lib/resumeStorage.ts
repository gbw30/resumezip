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

/** Each resume is saved under a key of its own: this, then its id. */
export const RESUME_PREFIX = "resume:"
const keyOf = (id: string) => RESUME_PREFIX + id

/** The id of the resume saved under a localStorage key, or null if it isn't one. */
export const idOf = (key: string) => (key.startsWith(RESUME_PREFIX) ? key.slice(RESUME_PREFIX.length) : null)

/** In a resume's changed fields: all of them, as for a new resume. */
export const EVERY_FIELD = "*"

/** Where earlier versions saved every resume, as one JSON object by id. */
export const LEGACY_KEY = "allResumes"
/** A copy of what was saved there, kept once when it's moved. */
export const BACKUP_KEY = "allResumes-backup"

type Resume = Record<string, any>
type Resumes = Record<string, Resume>

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
  const resumes: [string, Resume][] = []
  for (const [id, entry] of Object.entries(value)) {
    const { resume, complete: whole } = readEntry(entry)
    if (!whole) complete = false
    if (resume) resumes.push([id, resume])
  }
  // fromEntries keeps an id like "__proto__" an ordinary key. Assigning it
  // would set the object's prototype instead, and the resume would be lost.
  return { resumes: Object.fromEntries(resumes), complete }
}

export interface SavedResumes {
  /** The saved resumes that could be read, by id. */
  resumes: Resumes
  /** The text each resume was read as, to tell later whether another tab has saved it since. */
  texts: Map<string, string>
  /** "blocked" if the browser won't let the site use storage, otherwise "saved". */
  status: SaveStatus
}

/** Reads every saved resume, moving any that earlier versions saved first (see migrateLegacy). */
export function loadSaved(storage: Storage | null): SavedResumes {
  const blocked: SavedResumes = { resumes: {}, texts: new Map(), status: "blocked" }
  if (!storage) return blocked
  try {
    migrateLegacy(storage)
    const resumes: [string, Resume][] = []
    const texts = new Map<string, string>()
    for (const id of savedIds(storage)) {
      const { resume, text } = readSaved(storage, id)
      if (resume && text !== null) {
        resumes.push([id, resume])
        texts.set(id, text)
      }
    }
    // Resumes that couldn't be moved yet, e.g. for lack of room, are still
    // read from where they are. Saving one gives it a key of its own.
    const legacy = storage.getItem(LEGACY_KEY)
    if (legacy !== null) {
      for (const [id, resume] of Object.entries(parse(legacy).resumes)) if (!texts.has(id)) resumes.push([id, resume])
    }
    return { resumes: Object.fromEntries(resumes), texts, status: "saved" }
  } catch {
    return blocked
  }
}

/**
 * One saved resume, as loaded, and the text it's saved as. Text that can't be
 * fully read is kept aside, then the key is saved again with what could be
 * read (or removed, if none could), so it isn't found again next time. If it
 * can't be kept aside, it's left as it is. Throws if storage can't be read.
 */
export function readSaved(storage: Storage, id: string): { resume: Resume | null; text: string | null } {
  const key = keyOf(id)
  const text = storage.getItem(key)
  if (text === null) return { resume: null, text: null }
  const { resume, complete } = readResume(text)
  if (complete || !keepAside(storage, text)) return { resume, text }
  try {
    if (!resume) {
      storage.removeItem(key)
      return { resume: null, text: null }
    }
    const readable = JSON.stringify(resume)
    storage.setItem(key, readable)
    return { resume, text: readable }
  } catch {
    return { resume, text }
  }
}

// The ids of the resumes saved under keys of their own.
function savedIds(storage: Storage): string[] {
  const ids: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const id = idOf(storage.key(i) ?? "")
    if (id !== null) ids.push(id)
  }
  return ids
}

/**
 * Moves the resumes that earlier versions saved under one key (LEGACY_KEY) to
 * keys of their own, and returns the ids it saved. A resume already under its
 * own key is only replaced by a newer one, as when a tab still running an
 * earlier version saves. The old text is copied once to BACKUP_KEY (or kept
 * aside, if some of it can't be read) and then removed. If anything can't be
 * moved, it's left for next time. Throws if storage can't be read.
 */
export function migrateLegacy(storage: Storage): string[] {
  const text = storage.getItem(LEGACY_KEY)
  if (text === null) return []
  const { resumes, complete } = parse(text)
  if (!complete && !keepAside(storage, text)) return []
  const saved: string[] = []
  let moved = true
  for (const [id, resume] of Object.entries(resumes)) {
    const current = storage.getItem(keyOf(id))
    if (current !== null) {
      const existing = readResume(current)
      if (existing.complete && existing.resume && time(existing.resume.updatedAt) >= time(resume.updatedAt)) continue
      if (!existing.complete && !keepAside(storage, current)) {
        moved = false
        continue
      }
    }
    try {
      storage.setItem(keyOf(id), JSON.stringify(resume))
      saved.push(id)
    } catch {
      moved = false
    }
  }
  if (!moved) return saved
  if (complete && storage.getItem(BACKUP_KEY) === null) {
    try {
      storage.setItem(BACKUP_KEY, text)
    } catch {
      // Only a precaution: every resume is under its own key by now.
    }
  }
  // Unless a tab on an earlier version saved again meanwhile.
  if (storage.getItem(LEGACY_KEY) === text) storage.removeItem(LEGACY_KEY)
  return saved
}

/** A resume saved under its own key: what the editor can show of it, and whether that's all of it. */
export function readResume(text: string): { resume: Resume | null; complete: boolean } {
  try {
    return readEntry(JSON.parse(text))
  } catch {
    return { resume: null, complete: false }
  }
}

/**
 * A resume as the editor can show it, and whether that's all of it; null if
 * it isn't a resume at all. The editor would show a field or entry in another
 * shape as empty, or crash on it, and the first edit would replace it. So it's
 * left out here, and whoever saves over it keeps the text aside first.
 */
function readEntry(value: unknown): { resume: Resume | null; complete: boolean } {
  if (!isObject(value)) return { resume: null, complete: false }
  let complete = true
  const fields: [string, unknown][] = []
  for (const [key, field] of Object.entries(value)) {
    const readable = readField(key, field)
    if (!readable?.complete) complete = false
    if (readable) fields.push([key, readable.value])
  }
  return { resume: Object.fromEntries(fields), complete }
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
    return failure(error)
  }
}

export interface Saved {
  status: SaveStatus
  /** Once saved, the text saved, and the resume as saved (with another tab's changes, if it made any). */
  text?: string
  resume?: Resume
}

/**
 * Saves one resume, and says how that went. If another tab saved it since
 * this tab last read or saved it (`seen`), what that tab saved is kept, with
 * the fields this tab changed on top. Saved text that can't be fully read is
 * kept aside before it's saved over; if that fails, nothing is saved.
 */
export function saveResume(
  storage: Storage | null,
  id: string,
  resume: Resume,
  changed: ReadonlySet<string>,
  seen: string | null,
): Saved {
  if (!storage) return { status: "blocked" }
  const key = keyOf(id)
  let current: string | null
  try {
    current = storage.getItem(key)
  } catch {
    return { status: "blocked" }
  }
  let saving = resume
  if (current !== null) {
    const theirs = readResume(current)
    if (!theirs.complete && !keepAside(storage, current)) return { status: "failed" }
    if (current !== seen && theirs.resume) saving = mergeResume(theirs.resume, resume, changed)
  }
  const text = JSON.stringify(saving)
  try {
    storage.setItem(key, text)
    return { status: "saved", text, resume: saving }
  } catch (error) {
    return { status: failure(error) }
  }
}

/** Removes a saved resume, and says how that went. */
export function removeResume(storage: Storage | null, id: string): SaveStatus {
  if (!storage) return "blocked"
  try {
    storage.removeItem(keyOf(id))
    return "saved"
  } catch (error) {
    return failure(error)
  }
}

/**
 * Another tab's version of a resume, with the fields this tab changed taken
 * from its own, and the later of the two edit times. Changing the same field
 * in two tabs at once keeps the one saved last.
 */
export function mergeResume(theirs: Resume, ours: Resume, changed: ReadonlySet<string>): Resume {
  if (changed.has(EVERY_FIELD)) return ours
  const fields = Object.entries(theirs).filter(([field]) => !changed.has(field))
  for (const field of changed) if (Object.hasOwn(ours, field)) fields.push([field, ours[field]])
  return { ...Object.fromEntries(fields), updatedAt: later(theirs.updatedAt, ours.updatedAt) }
}

// When a resume was last edited, for comparing; unknown times come first.
const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN
  return Number.isNaN(parsed) ? -Infinity : parsed
}
const later = (a: unknown, b: unknown) => (time(a) >= time(b) ? a : b)

function failure(error: unknown): SaveStatus {
  if (isQuotaError(error)) return "full"
  console.warn("Couldn't save resumes:", error)
  return "failed"
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
