import { describe, expect, test, vi } from "vitest"
import { ASK_AGAIN_AFTER, ASKED_KEY, keepSavedData } from "./keepSavedData"
import { memoryStorage } from "./memoryStorage"

const NOW = Date.parse("2026-10-06T12:00:00.000Z")

/** A browser's storage manager that already keeps the site's data or not, and answers `answer` when asked. */
const manager = ({ persisted = false, answer = false } = {}) => ({
  persisted: vi.fn(async () => persisted),
  persist: vi.fn(async () => answer),
})

/** A browser that reports `state` for the persistent-storage permission. */
const permissions = (state: PermissionState) => ({ query: vi.fn(async () => ({ state }) as PermissionStatus) })

describe("asking the browser to keep saved resumes", () => {
  test("asks, and says so when the browser agrees", async () => {
    const browser = manager({ answer: true })
    expect(await keepSavedData(memoryStorage(), browser, permissions("prompt"), NOW)).toBe(true)
    expect(browser.persist).toHaveBeenCalledOnce()
  })

  test("doesn't ask when the browser already keeps it", async () => {
    const browser = manager({ persisted: true })
    expect(await keepSavedData(memoryStorage(), browser, permissions("granted"), NOW)).toBe(true)
    expect(browser.persist).not.toHaveBeenCalled()
  })

  test("doesn't ask again once the person has said no", async () => {
    const browser = manager({ answer: true })
    expect(await keepSavedData(memoryStorage(), browser, permissions("denied"), NOW)).toBe(false)
    expect(browser.persist).not.toHaveBeenCalled()
  })

  test("waits a week after a no before asking again", async () => {
    const week = 7 * 24 * 60 * 60 * 1000
    expect(ASK_AGAIN_AFTER).toBe(week)
    const storage = memoryStorage()
    const browser = manager()
    await keepSavedData(storage, browser, permissions("prompt"), NOW)
    await keepSavedData(storage, browser, permissions("prompt"), NOW + week - 1)
    expect(browser.persist).toHaveBeenCalledOnce()
    await keepSavedData(storage, browser, permissions("prompt"), NOW + week)
    expect(browser.persist).toHaveBeenCalledTimes(2)
  })

  test("asks again if the time of the last no is later than now, as after the clock was changed", async () => {
    const browser = manager()
    const storage = memoryStorage({ [ASKED_KEY]: String(NOW + 1000) })
    await keepSavedData(storage, browser, permissions("prompt"), NOW)
    expect(browser.persist).toHaveBeenCalledOnce()
  })

  test("asks when the browser won't say what the person chose, as in Safari", async () => {
    const browser = manager({ answer: true })
    const unknown = { query: vi.fn(async () => Promise.reject(new TypeError("Unknown permission"))) }
    expect(await keepSavedData(memoryStorage(), browser, unknown, NOW)).toBe(true)
    expect(browser.persist).toHaveBeenCalledOnce()
    const withoutPermissions = manager({ answer: true })
    expect(await keepSavedData(memoryStorage(), withoutPermissions, undefined, NOW)).toBe(true)
    expect(withoutPermissions.persist).toHaveBeenCalledOnce()
  })

  test("does nothing in browsers without it", async () => {
    expect(await keepSavedData(memoryStorage(), undefined, undefined, NOW)).toBe(false)
  })

  test("doesn't ask when it can't note that it asked, so Firefox can't ask on every page", async () => {
    const full = memoryStorage()
    full.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError")
    }
    const browser = manager({ answer: true })
    expect(await keepSavedData(full, browser, permissions("prompt"), NOW)).toBe(false)
    expect(browser.persist).not.toHaveBeenCalled()
  })

  test("never rejects", async () => {
    const broken = { persisted: vi.fn(async () => Promise.reject(new Error("broken"))), persist: vi.fn() }
    expect(await keepSavedData(memoryStorage(), broken, permissions("prompt"), NOW)).toBe(false)
    const refusing = { persisted: vi.fn(async () => false), persist: vi.fn(async () => Promise.reject(new Error("refused"))) }
    expect(await keepSavedData(memoryStorage(), refusing, permissions("prompt"), NOW)).toBe(false)
  })
})
