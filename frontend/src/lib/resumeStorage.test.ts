import { afterEach, describe, expect, test, vi } from "vitest"
import {
  canSaveOver,
  deleteKeptAside,
  getStorage,
  isKeptAside,
  loadResumes,
  readKeptAside,
  readResumes,
  RESUMES_KEY,
  saveResumes,
} from "./resumeStorage"

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
    expect(loadResumes(storage)).toEqual({ resumes: { a: ada, g: grace }, unreadable: false, status: "saved" })
  })

  test("keep an id that's special in JavaScript, like __proto__, as an ordinary resume", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: '{"__proto__": {"id": "__proto__", "resumeTitle": "Ada"}}' })
    const loaded = loadResumes(storage)
    expect(loaded.unreadable).toBe(false)
    expect(Object.keys(loaded.resumes)).toEqual(["__proto__"])

    saveResumes(storage, loaded.resumes)
    expect(Object.keys(loadResumes(storage).resumes)).toEqual(["__proto__"])
  })

  test("start empty when nothing is saved yet", () => {
    expect(loadResumes(memoryStorage())).toEqual({ resumes: {}, unreadable: false, status: "saved" })
  })
})

describe("saved data that can't be read", () => {
  const unreadable = [
    ["cut-off JSON", '{"a": {"resumeTitle": "Ada'],
    ["not JSON", "hello"],
    ["null", "null"],
    ["a list", "[]"],
    ["a number", "42"],
    ["entries that aren't resumes", '{"a": null}'],
  ]

  test.each(unreadable)("is kept aside before anything is saved over it (%s)", (_, text) => {
    const storage = memoryStorage({ [RESUMES_KEY]: text })
    expect(loadResumes(storage)).toEqual({ resumes: {}, unreadable: true, status: "saved" })
    expect(readKeptAside(storage)).toEqual([text])

    expect(saveResumes(storage, { a: ada })).toBe("saved")
    expect(readKeptAside(storage)).toEqual([text])
  })

  test("is kept whole, while the resumes in it that can be read are loaded", () => {
    const text = JSON.stringify({ a: ada, b: null, c: "junk" })
    const storage = memoryStorage({ [RESUMES_KEY]: text })
    expect(loadResumes(storage)).toEqual({ resumes: { a: ada }, unreadable: true, status: "saved" })
    expect(readKeptAside(storage)).toEqual([text])
  })

  test.each<[string, string, unknown]>([
    ["a section that isn't a list", "educationSection", { schoolName: "MIT" }],
    ["a profile that isn't an object", "profileSection", "Ada Lovelace"],
    ["a section order that isn't a list", "sectionOrder", "Work"],
  ])("in a field the editor can't show is kept aside, and the resume loads without it (%s)", (_, field, value) => {
    const text = JSON.stringify({ a: { ...ada, [field]: value } })
    const storage = memoryStorage({ [RESUMES_KEY]: text })
    const loaded = loadResumes(storage)
    expect(loaded.unreadable).toBe(true)
    expect(loaded.resumes.a).not.toHaveProperty(field)
    expect(loaded.resumes.a.resumeTitle).toBe("Ada")
    expect(readKeptAside(storage)).toEqual([text])

    // Once saved without it, it isn't kept aside again.
    saveResumes(storage, loaded.resumes)
    expect(loadResumes(storage).unreadable).toBe(false)
    expect(readKeptAside(storage)).toEqual([text])
  })

  test("in list entries the editor can't show is kept aside, and the rest of the list loads", () => {
    const text = JSON.stringify({
      a: { ...ada, educationSection: [{ schoolName: "MIT" }, null, "junk"], sectionOrder: ["Work", 7, "Education"] },
    })
    const storage = memoryStorage({ [RESUMES_KEY]: text })
    const loaded = loadResumes(storage)
    expect(loaded.unreadable).toBe(true)
    expect(loaded.resumes.a.educationSection).toEqual([{ schoolName: "MIT" }])
    expect(loaded.resumes.a.sectionOrder).toEqual(["Work", "Education"])
    expect(readKeptAside(storage)).toEqual([text])
  })

  test("doesn't include older resumes that lack newer fields, or have them empty", () => {
    const old = { id: "o", resumeTitle: "Old", profileSection: { fullName: "Ada" }, educationSection: null, headings: null }
    const storage = memoryStorage({ [RESUMES_KEY]: JSON.stringify({ o: old }) })
    expect(loadResumes(storage)).toEqual({ resumes: { o: old }, unreadable: false, status: "saved" })
    expect(readKeptAside(storage)).toEqual([])
  })

  test("is kept once, however often it's read", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: "hello" })
    loadResumes(storage)
    loadResumes(storage)
    expect(readKeptAside(storage)).toEqual(["hello"])
  })

  test("found later is kept as well, without replacing what was kept before", () => {
    let now = 1_000
    vi.spyOn(Date, "now").mockImplementation(() => now++)
    const storage = memoryStorage({ [RESUMES_KEY]: "first" })
    loadResumes(storage)
    storage.setItem(RESUMES_KEY, "second")
    loadResumes(storage)
    storage.setItem(RESUMES_KEY, "third")
    loadResumes(storage)
    expect(readKeptAside(storage)).toEqual(["first", "second", "third"])
  })

  test("kept by two tabs at the same moment gets two keys, so neither copy is lost", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    const storage = memoryStorage()
    readResumes(storage, "one tab's")
    readResumes(storage, "another tab's")
    expect(readKeptAside(storage).sort()).toEqual(["another tab's", "one tab's"])
  })

  test("is kept under keys that can be told apart from the resumes", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: "hello" })
    loadResumes(storage)
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? "")
    expect(keys.filter(isKeptAside)).toHaveLength(1)
    expect(isKeptAside(RESUMES_KEY)).toBe(false)
  })

  test("saved by another tab is kept aside too", () => {
    const storage = memoryStorage()
    expect(readResumes(storage, "hello")).toEqual({ resumes: {}, unreadable: true, status: "saved" })
    expect(readKeptAside(storage)).toEqual(["hello"])
  })

  test("is left where it is, and saving stops, if it can't be kept aside", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: "hello" })
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw quotaError()
    })
    expect(loadResumes(storage)).toEqual({ resumes: {}, unreadable: true, status: "failed" })
    expect(storage.getItem(RESUMES_KEY)).toBe("hello")
    expect(readKeptAside(storage)).toEqual([])
  })

  test("that couldn't be kept aside can be saved over once there's room to keep it", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: "hello" })
    const setItem = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw quotaError()
    })
    expect(loadResumes(storage).status).toBe("failed")
    expect(canSaveOver(storage)).toBe(false)

    setItem.mockRestore()
    expect(canSaveOver(storage)).toBe(true)
    expect(readKeptAside(storage)).toEqual(["hello"])
  })

  test("that couldn't be kept aside can be saved over once something readable replaces it", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: JSON.stringify({ a: ada }) })
    expect(canSaveOver(storage)).toBe(true)
    expect(canSaveOver(memoryStorage())).toBe(true)
    expect(readKeptAside(storage)).toEqual([])
  })

  test("can be deleted once it's been kept aside", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: "first" })
    loadResumes(storage)
    storage.setItem(RESUMES_KEY, "second")
    loadResumes(storage)
    deleteKeptAside(storage)
    expect(readKeptAside(storage)).toEqual([])
    expect(storage.length).toBe(1)
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
    expect(loadResumes(null)).toEqual({ resumes: {}, unreadable: false, status: "blocked" })
    expect(saveResumes(null, { a: ada })).toBe("blocked")
    expect(readKeptAside(null)).toEqual([])
    expect(() => deleteKeptAside(null)).not.toThrow()
  })

  test("loading says it's blocked when reading throws", () => {
    const storage = memoryStorage({ [RESUMES_KEY]: JSON.stringify({ a: ada }) })
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw deniedError()
    })
    expect(loadResumes(storage)).toEqual({ resumes: {}, unreadable: false, status: "blocked" })
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
