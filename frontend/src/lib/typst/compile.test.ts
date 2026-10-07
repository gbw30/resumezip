import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { CompileRequest, CompileResponse } from "./compile"

// Stands in for the Typst worker. Each test says how it answers; undefined
// means it never does.
class FakeWorker {
  static made: FakeWorker[] = []
  static answer: (request: CompileRequest) => CompileResponse | undefined = () => undefined
  onmessage: ((event: { data: CompileResponse }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  terminated = false

  constructor() {
    FakeWorker.made.push(this)
  }

  postMessage(request: CompileRequest) {
    const response = FakeWorker.answer(request)
    if (response) setTimeout(() => this.onmessage?.({ data: response }), 10)
  }

  terminate() {
    this.terminated = true
  }
}

const PDF = new Uint8Array([37, 80, 68, 70])
const makesPdf = ({ id }: CompileRequest) => ({ id, pdf: PDF })
const resume = { resumeTitle: "Test resume" }

let compileResume: typeof import("./compile").compileResume

beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal("Worker", FakeWorker)
  FakeWorker.made = []
  FakeWorker.answer = makesPdf
  // A fresh module each time, so no worker carries over.
  vi.resetModules()
  ;({ compileResume } = await import("./compile"))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Settles a compile by running the clock forward, without waiting in real time.
async function settle<T>(promise: Promise<T>, ms: number) {
  const result = promise.then(
    (value) => ({ value }),
    (error: Error) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(ms)
  return result
}

test("an ordinary compile returns the worker's PDF", async () => {
  expect(await settle(compileResume(resume), 100)).toEqual({ value: PDF })
})

test("a failed compile rejects with Typst's error", async () => {
  FakeWorker.answer = ({ id }) => ({ id, error: "unknown variable: foo", loaded: true })
  const { error } = (await settle(compileResume(resume), 100)) as { error: Error }
  expect(error.message).toBe("unknown variable: foo")
})

test("a stalled first PDF gives up after 90 s, and trying again starts a fresh worker", async () => {
  FakeWorker.answer = () => undefined
  let settled = false
  const first = compileResume(resume).finally(() => (settled = true))
  first.catch(() => {})
  await vi.advanceTimersByTimeAsync(89_000)
  expect(settled).toBe(false)

  const { error } = (await settle(first, 1_000)) as { error: Error }
  expect(error.message).toBe("Making the PDF took too long")
  expect(FakeWorker.made[0].terminated).toBe(true)

  FakeWorker.answer = makesPdf
  expect(await settle(compileResume(resume), 100)).toEqual({ value: PDF })
  expect(FakeWorker.made).toHaveLength(2)
})

test("once the compiler has loaded, a stalled PDF gives up after 20 s", async () => {
  await settle(compileResume(resume), 100)
  FakeWorker.answer = () => undefined
  const { error } = (await settle(compileResume(resume), 20_000)) as { error: Error }
  expect(error.message).toBe("Making the PDF took too long")
})

test("after a Typst error, the compiler has loaded, so a stalled PDF gives up after 20 s", async () => {
  FakeWorker.answer = ({ id }) => ({ id, error: "unknown variable: foo", loaded: true })
  await settle(compileResume(resume), 100)
  FakeWorker.answer = () => undefined
  const { error } = (await settle(compileResume(resume), 20_000)) as { error: Error }
  expect(error.message).toBe("Making the PDF took too long")
})

test("requests waiting while the compiler loads get 20 s once it has", async () => {
  // Only the first request is answered.
  FakeWorker.answer = ({ id }) => (id === 0 ? { id, pdf: PDF } : undefined)
  const first = compileResume(resume)
  const second = compileResume(resume).catch((error: Error) => error.message)
  expect(await settle(first, 10)).toEqual({ value: PDF })
  await vi.advanceTimersByTimeAsync(20_000)
  expect(await second).toBe("Making the PDF took too long")
})

test("a stall fails every compile in flight, and only once", async () => {
  FakeWorker.answer = () => undefined
  const results = Promise.all([compileResume(resume), compileResume(resume)].map((p) => settle(p, 0)))
  await vi.advanceTimersByTimeAsync(90_000)
  expect((await results).map((result) => "error" in result)).toEqual([true, true])
  // Their timers were cleared, so nothing restarts the next worker.
  FakeWorker.answer = makesPdf
  const next = compileResume(resume)
  expect(await settle(next, 90_000)).toEqual({ value: PDF })
  expect(FakeWorker.made[1].terminated).toBe(false)
})

test("a broken worker fails every compile in flight, and the next one starts a fresh worker", async () => {
  FakeWorker.answer = () => undefined
  const both = [compileResume(resume), compileResume(resume)].map((p) => p.catch((error: Error) => error.message))
  FakeWorker.made[0].onerror?.({ message: "out of memory" })
  expect(await Promise.all(both)).toEqual(["out of memory", "out of memory"])

  FakeWorker.answer = makesPdf
  expect(await settle(compileResume(resume), 100)).toEqual({ value: PDF })
  expect(FakeWorker.made).toHaveLength(2)
})

test("an error from a worker that was already replaced leaves the new one alone", async () => {
  FakeWorker.answer = () => undefined
  await settle(compileResume(resume), 90_000)

  FakeWorker.answer = makesPdf
  const next = compileResume(resume)
  FakeWorker.made[0].onerror?.({ message: "late error" })
  expect(await settle(next, 100)).toEqual({ value: PDF })
  expect(FakeWorker.made[1].terminated).toBe(false)
})
