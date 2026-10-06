import { afterEach, describe, expect, test, vi } from "vitest"
import {
  BACKUP_KEY,
  canSaveOver,
  deleteKeptAside,
  EVERY_FIELD,
  getStorage,
  idOf,
  isKeptAside,
  LEGACY_KEY,
  loadResumes,
  loadSaved,
  mergeResume,
  readKeptAside,
  readResume,
  readResumes,
  removeResume,
  RESUME_PREFIX,
  RESUMES_KEY,
  saveResume,
  saveResumes,
  UNREADABLE_PREFIX,
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

describe("a resume saved under its own key", () => {
  const all = new Set([EVERY_FIELD])
  const text = (resume: object) => JSON.stringify(resume)
  const stored = (storage: Storage, id: string) => readResume(storage.getItem(RESUME_PREFIX + id) ?? "").resume

  test("is read back as it was saved, and doesn't touch other resumes", () => {
    const storage = memoryStorage({ [`${RESUME_PREFIX}g`]: text(grace) })
    const saved = saveResume(storage, "a", ada, all, null)
    expect(saved).toEqual({ status: "saved", text: text(ada), resume: ada })
    expect(stored(storage, "a")).toEqual(ada)
    expect(storage.getItem(`${RESUME_PREFIX}g`)).toBe(text(grace))
    expect(idOf(`${RESUME_PREFIX}a`)).toBe("a")
    expect(idOf("allResumes")).toBeNull()
  })

  test("keeps another tab's changes to other fields when this tab saves", () => {
    const before = { ...ada, updatedAt: "2026-10-06T10:00:00.000Z" }
    const theirs = { ...before, profileSection: { fullName: "Ada King" }, updatedAt: "2026-10-06T10:00:05.000Z" }
    const ours = { ...before, workExperienceSection: [{ companyName: "Analytical Engines" }], updatedAt: "2026-10-06T10:00:03.000Z" }
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: text(theirs) })

    const saved = saveResume(storage, "a", ours, new Set(["workExperienceSection", "updatedAt"]), text(before))
    expect(saved.status).toBe("saved")
    expect(stored(storage, "a")).toEqual({ ...theirs, workExperienceSection: ours.workExperienceSection })
    expect(saved.resume).toEqual(stored(storage, "a"))
  })

  test("keeps this tab's version of a field that both tabs changed", () => {
    const theirs = { ...ada, profileSection: { fullName: "Ada King" } }
    const ours = { ...ada, profileSection: { fullName: "Ada Byron" } }
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: text(theirs) })
    saveResume(storage, "a", ours, new Set(["profileSection"]), text(ada))
    expect(stored(storage, "a")?.profileSection).toEqual({ fullName: "Ada Byron" })
  })

  test("is saved again with this tab's changes if another tab deleted it", () => {
    const storage = memoryStorage()
    expect(saveResume(storage, "a", ada, new Set(["profileSection"]), text(ada)).status).toBe("saved")
    expect(stored(storage, "a")).toEqual(ada)
  })

  test("that another tab saved in a shape the editor can't show is kept aside before it's saved over", () => {
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: "not json" })
    expect(saveResume(storage, "a", ada, all, text(ada)).status).toBe("saved")
    expect(readKeptAside(storage)).toEqual(["not json"])
    expect(stored(storage, "a")).toEqual(ada)
  })

  test("isn't saved over text it can't read if that can't be kept aside", () => {
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: "not json" })
    const setItem = storage.setItem
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key.startsWith(UNREADABLE_PREFIX)) throw quotaError()
      setItem(key, value)
    })
    expect(saveResume(storage, "a", ada, all, null)).toEqual({ status: "failed" })
    expect(storage.getItem(`${RESUME_PREFIX}a`)).toBe("not json")
  })

  test("says why it wasn't saved when storage is blocked or full", () => {
    expect(saveResume(null, "a", ada, all, null)).toEqual({ status: "blocked" })
    const storage = memoryStorage()
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw quotaError()
    })
    expect(saveResume(storage, "a", ada, all, null)).toEqual({ status: "full" })
  })

  test("can be removed", () => {
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: text(ada) })
    expect(removeResume(storage, "a")).toBe("saved")
    expect(storage.length).toBe(0)
    expect(removeResume(null, "a")).toBe("blocked")
  })
})

describe("mergeResume", () => {
  test("takes the changed fields from this tab, and the rest from the other", () => {
    const theirs = { ...ada, resumeTitle: "Theirs", updatedAt: "2026-10-06T10:00:05.000Z" }
    const ours = { ...ada, resumeTitle: "Ours", profileSection: { fullName: "Ours" }, updatedAt: "2026-10-06T10:00:01.000Z" }
    expect(mergeResume(theirs, ours, new Set(["profileSection"]))).toEqual({
      ...theirs,
      profileSection: { fullName: "Ours" },
    })
  })

  test("takes everything from this tab for a new or replaced resume", () => {
    expect(mergeResume(grace, ada, new Set([EVERY_FIELD]))).toBe(ada)
  })

  test("keeps the later edit time", () => {
    const merged = mergeResume({ updatedAt: "2026-10-06T10:00:00.000Z" }, { updatedAt: "2026-10-06T11:00:00.000Z" }, new Set(["updatedAt"]))
    expect(merged.updatedAt).toBe("2026-10-06T11:00:00.000Z")
  })
})

describe("loading resumes saved under keys of their own", () => {
  const text = (resume: object) => JSON.stringify(resume)

  test("reads every one, and saves nothing", () => {
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: text(ada), [`${RESUME_PREFIX}g`]: text(grace), other: "x" })
    const setItem = vi.spyOn(storage, "setItem")
    const loaded = loadSaved(storage)
    expect(loaded.resumes).toEqual({ a: ada, g: grace })
    expect(loaded.texts).toEqual(new Map([["a", text(ada)], ["g", text(grace)]]))
    expect(loaded.status).toBe("saved")
    expect(setItem).not.toHaveBeenCalled()
  })

  test("says it's blocked when storage can't be read", () => {
    expect(loadSaved(null).status).toBe("blocked")
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: text(ada) })
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw deniedError()
    })
    expect(loadSaved(storage)).toEqual({ resumes: {}, texts: new Map(), status: "blocked" })
  })

  test("keeps aside one that can't be read at all, and removes it", () => {
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: text(ada), [`${RESUME_PREFIX}x`]: "not json" })
    expect(loadSaved(storage).resumes).toEqual({ a: ada })
    expect(readKeptAside(storage)).toEqual(["not json"])
    expect(storage.getItem(`${RESUME_PREFIX}x`)).toBeNull()
  })

  test("keeps aside one with a field the editor can't show, and saves the rest of it once", () => {
    const original = text({ ...ada, educationSection: { schoolName: "MIT" } })
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: original })
    const loaded = loadSaved(storage)
    expect(loaded.resumes).toEqual({ a: ada })
    expect(loaded.texts.get("a")).toBe(text(ada))
    expect(storage.getItem(`${RESUME_PREFIX}a`)).toBe(text(ada))
    expect(readKeptAside(storage)).toEqual([original])

    loadSaved(storage)
    expect(readKeptAside(storage)).toEqual([original])
  })

  test("leaves one that can't be read as it is if it can't be kept aside", () => {
    const original = text({ ...ada, educationSection: { schoolName: "MIT" } })
    const storage = memoryStorage({ [`${RESUME_PREFIX}a`]: original })
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw quotaError()
    })
    const loaded = loadSaved(storage)
    expect(loaded.resumes).toEqual({ a: ada })
    expect(loaded.texts.get("a")).toBe(original)
    expect(storage.getItem(`${RESUME_PREFIX}a`)).toBe(original)
  })

  test("keeps an id that's special in JavaScript, like __proto__, as an ordinary resume", () => {
    const storage = memoryStorage({ [`${RESUME_PREFIX}__proto__`]: text({ id: "__proto__", resumeTitle: "Ada" }) })
    expect(Object.keys(loadSaved(storage).resumes)).toEqual(["__proto__"])
  })
})

describe("resumes saved by earlier versions, all under one key", () => {
  const text = (resume: object) => JSON.stringify(resume)
  const older = { ...ada, profileSection: { fullName: "Ada Byron" }, updatedAt: "2026-10-01T00:00:00.000Z" }
  const newer = { ...ada, profileSection: { fullName: "Ada King" }, updatedAt: "2026-10-05T00:00:00.000Z" }

  test("are moved to keys of their own, with a backup, and then nothing is moved again", () => {
    const legacy = text({ a: ada, g: grace })
    const storage = memoryStorage({ [LEGACY_KEY]: legacy })
    expect(loadSaved(storage).resumes).toEqual({ a: ada, g: grace })
    expect(storage.getItem(`${RESUME_PREFIX}a`)).toBe(text(ada))
    expect(storage.getItem(`${RESUME_PREFIX}g`)).toBe(text(grace))
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
    expect(storage.getItem(BACKUP_KEY)).toBe(legacy)

    const setItem = vi.spyOn(storage, "setItem")
    expect(loadSaved(storage).resumes).toEqual({ a: ada, g: grace })
    expect(setItem).not.toHaveBeenCalled()
  })

  test("don't replace a newer copy already under its own key, but do replace an older one", () => {
    const storage = memoryStorage({ [LEGACY_KEY]: text({ a: older }), [`${RESUME_PREFIX}a`]: text(newer) })
    expect(loadSaved(storage).resumes.a).toEqual(newer)

    // A tab still on an earlier version saved later.
    storage.setItem(LEGACY_KEY, text({ a: { ...newer, resumeTitle: "Later", updatedAt: "2026-10-06T00:00:00.000Z" } }))
    expect(loadSaved(storage).resumes.a.resumeTitle).toBe("Later")
  })

  test("that can't all be read are kept aside, and the rest moved", () => {
    const legacy = text({ a: ada, x: "junk" })
    const storage = memoryStorage({ [LEGACY_KEY]: legacy })
    expect(loadSaved(storage).resumes).toEqual({ a: ada })
    expect(readKeptAside(storage)).toEqual([legacy])
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
    expect(storage.getItem(BACKUP_KEY)).toBeNull()
  })

  test("stay where they are, and still load, if storage is too full to move them", () => {
    const legacy = text({ a: ada, g: grace })
    const storage = memoryStorage({ [LEGACY_KEY]: legacy })
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw quotaError()
    })
    expect(loadSaved(storage).resumes).toEqual({ a: ada, g: grace })
    expect(storage.getItem(LEGACY_KEY)).toBe(legacy)
  })
})
