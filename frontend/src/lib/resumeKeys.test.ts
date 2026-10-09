import { describe, expect, test, vi } from "vitest"
import { memoryStorage } from "./memoryStorage"
import { hasSavedResumes, keyOf, LEGACY_KEY } from "./resumeKeys"
import { BACKUP_KEY, UNREADABLE_PREFIX } from "./resumeStorage"

describe("whether there are saved resumes", () => {
  test("is yes for a resume under its own key, without reading it", () => {
    const storage = memoryStorage({ "storage-persist-asked": "1", [keyOf("a")]: "not json" })
    const getItem = vi.spyOn(storage, "getItem")
    expect(hasSavedResumes(storage)).toBe(true)
    expect(getItem).not.toHaveBeenCalled()
  })

  test("is yes for resumes an earlier version saved under one key", () => {
    expect(hasSavedResumes(memoryStorage({ [LEGACY_KEY]: "{}" }))).toBe(true)
  })

  test("is no for other data, even copies of saved resumes", () => {
    expect(hasSavedResumes(memoryStorage())).toBe(false)
    const storage = memoryStorage({ [BACKUP_KEY]: "{}", [`${UNREADABLE_PREFIX}1-abc`]: "not json", "storage-persist-asked": "1" })
    expect(hasSavedResumes(storage)).toBe(false)
  })

  test("is no when the browser won't let the site use storage, or it can't be read", () => {
    expect(hasSavedResumes(null)).toBe(false)
    const storage = memoryStorage({ [keyOf("a")]: "{}" })
    vi.spyOn(storage, "key").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError")
    })
    expect(hasSavedResumes(storage)).toBe(false)
  })
})
