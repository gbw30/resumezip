// Resumes are saved in the browser's localStorage, as one JSON object by id.
// That's the only copy there is, so nothing here throws: the browser can
// block storage or run out of room, and what's saved can be unreadable. None
// of that may crash the app or get saved over.

/** Where the resumes are saved. */
export const RESUMES_KEY = "allResumes"

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
  /** The saved resumes; none if nothing is saved or it couldn't be read. */
  resumes: Resumes
  /** "saved" if saving can go ahead; otherwise why it mustn't. */
  status: SaveStatus
}

/**
 * Reads the saved resumes. Saved data that can't be read is left as it is,
 * with a status that says not to save, so it isn't replaced.
 */
export function loadResumes(storage: Storage | null): Loaded {
  if (!storage) return { resumes: {}, status: "blocked" }
  let text: string | null
  try {
    text = storage.getItem(RESUMES_KEY)
  } catch {
    return { resumes: {}, status: "blocked" }
  }
  if (text === null) return { resumes: {}, status: "saved" }
  const resumes = parse(text)
  return resumes ? { resumes, status: "saved" } : { resumes: {}, status: "failed" }
}

/** The resumes in saved text, or null if it isn't an object of resumes. */
function parse(text: string): Resumes | null {
  try {
    const value: unknown = JSON.parse(text)
    return isObject(value) && Object.values(value).every(isObject) ? (value as Resumes) : null
  } catch {
    return null
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

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
