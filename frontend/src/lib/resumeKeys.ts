// Where resumes are saved in localStorage, and whether there are any, without
// reading them. Kept apart from lib/resumeStorage.ts, which reads and checks
// them, so pages that only link to the editor don't download that.

/** Each resume is saved under a key of its own: this, then its id. */
export const RESUME_PREFIX = "resume:"
/** The localStorage key a resume is saved under. */
export const keyOf = (id: string) => RESUME_PREFIX + id

/** The id of the resume saved under a localStorage key, or null if it isn't one. */
export const idOf = (key: string) => (key.startsWith(RESUME_PREFIX) ? key.slice(RESUME_PREFIX.length) : null)

/** Where earlier versions saved every resume, as one JSON object by id. */
export const LEGACY_KEY = "allResumes"

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

/**
 * Whether there are resumes saved in `storage`, by their keys alone. None is
 * read, so one that turns out to be unreadable counts too.
 */
export function hasSavedResumes(storage: Storage | null): boolean {
  if (!storage) return false
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key !== null && (key === LEGACY_KEY || idOf(key) !== null)) return true
    }
  } catch {
    // Storage that can't be read has nothing to open.
  }
  return false
}
