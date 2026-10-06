import { afterEach, describe, expect, test, vi } from "vitest"
import { getStorage, loadResumes, RESUMES_KEY, saveResumes } from "./resumeStorage"

/** A stand-in for localStorage, starting with `items`. */
function memoryStorage(items: Record<string, string> = {}) {
  const map = new Map(Object.entries(items))
  return {
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as Storage
}

const ada = { id: "a", resumeTitle: "Ada", profileSection: { fullName: "Ada Lovelace" } }
const grace = { id: "g", resumeTitle: "Grace", profileSection: { fullName: "Grace Hopper" } }

const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError")
const deniedError = () => new DOMException("Access is denied for this document.", "SecurityError")

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("saved resumes", () => {
  test("are read back as they were saved, as after a reload", () => {
    const storage = memoryStorage()
    expect(saveResumes(storage, { a: ada, g: grace })).toBe("saved")
    expect(loadResumes(storage)).toEqual({ resumes: { a: ada, g: grace }, status: "saved" })
  })

  test("start empty when nothing is saved yet", () => {
    expect(loadResumes(memoryStorage())).toEqual({ resumes: {}, status: "saved" })
  })
})

describe("saved data that can't be read", () => {
  test.each([
    ["cut-off JSON", '{"a": {"resumeTitle": "Ada'],
    ["not JSON", "hello"],
    ["null", "null"],
    ["a list", "[]"],
    ["a number", "42"],
    ["entries that aren't resumes", '{"a": null}'],
  ])("is left as it was, and nothing is saved over it (%s)", (_, text) => {
    const storage = memoryStorage({ [RESUMES_KEY]: text })
    expect(loadResumes(storage)).toEqual({ resumes: {}, status: "failed" })
    expect(storage.getItem(RESUMES_KEY)).toBe(text)
  })
})

describe("when the browser won't let the site save anything", () => {
  test("getStorage gives null instead of throwing", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw deniedError()
      },
    })
    expect(getStorage()).toBeNull()
  })

  test("getStorage gives null in browsers without localStorage", () => {
    vi.stubGlobal("window", { localStorage: null })
    expect(getStorage()).toBeNull()
  })

  test("getStorage gives localStorage when it can be used", () => {
    const storage = memoryStorage()
    vi.stubGlobal("window", { localStorage: storage })
    expect(getStorage()).toBe(storage)
  })

  test("loading and saving say it's blocked", () => {
    expect(loadResumes(null)).toEqual({ resumes: {}, status: "blocked" })
    expect(saveResumes(null, { a: ada })).toBe("blocked")
  })

  test("loading says it's blocked when reading throws", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: JSON.stringify({ a: ada }) })
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw deniedError()
    })
    expect(loadResumes(storage)).toEqual({ resumes: {}, status: "blocked" })
  })
})

describe("a save that doesn't work", () => {
  test("says when storage is full, and leaves what was saved before", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: JSON.stringify({ a: ada }) })
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw quotaError()
    })
    expect(saveResumes(storage, { a: ada, g: grace })).toBe("full")
    expect(loadResumes(storage).resumes).toEqual({ a: ada })
  })

  test("says it failed for any other error", () => {
    const storage = memoryStorage()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("disk error")
    })
    expect(saveResumes(storage, { a: ada })).toBe("failed")
  })

  test("works again once storage does", () => {
    const storage = memoryStorage()
    vi.spyOn(storage, "setItem").mockImplementationOnce(() => {
      throw quotaError()
    })
    expect(saveResumes(storage, { a: ada })).toBe("full")
    expect(saveResumes(storage, { a: ada })).toBe("saved")
    expect(loadResumes(storage).resumes).toEqual({ a: ada })
  })
})
