import { afterEach, describe, expect, test, vi } from "vitest"
import kdd from "./fixtures/crossref-kdd.json"
import arxiv from "./fixtures/doi-org-arxiv.json"
import { LOOKUP_TIMEOUT_MS, lookUp } from "./lookup"

type Answer = Response | (() => Promise<Response>)

/** A stand-in for fetch that gives each request the next answer, and notes what was asked. */
function fakeFetch(...answers: Answer[]) {
  const requests: { url: string; init: RequestInit }[] = []
  const fetcher = (async (url: string, init: RequestInit) => {
    requests.push({ url, init })
    const answer = answers.shift()
    if (!answer) throw new Error(`No answer for ${url}`)
    return typeof answer === "function" ? answer() : answer
  }) as unknown as typeof fetch
  return { fetcher, requests }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const status = (code: number) => new Response("", { status: code })

// A service that never answers, until the request is stopped. Like fetch, it
// rejects at once when given a signal that's already aborted.
const hanging = (async (_url: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    if (init.signal!.aborted) reject(init.signal!.reason)
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason))
  })) as unknown as typeof fetch

// A service that answers at once, then never finishes sending its record, until the request is stopped.
const stalling = (async (_url: string, init: RequestInit) =>
  new Response(
    new ReadableStream({ start: (body) => init.signal!.addEventListener("abort", () => body.error(init.signal!.reason)) }),
    { status: 200 },
  )) as unknown as typeof fetch

afterEach(() => {
  vi.useRealTimers()
})

describe("looking up a paper", () => {
  test("Crossref's record, sent nothing but the DOI", async () => {
    const { fetcher, requests } = fakeFetch(json(kdd))
    expect(await lookUp({ doi: "10.1145/3580305.3599572" }, undefined, fetcher)).toEqual({ found: true, work: kdd.message })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe("https://api.crossref.org/works/10.1145/3580305.3599572")
    expect(requests[0].init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" })
  })

  test("a DOI's other characters are escaped in the address", async () => {
    const { fetcher, requests } = fakeFetch(json(kdd))
    await lookUp({ doi: "10.1002/(SICI)1097-4636(199706)35:4<477::AID-JBM8>3.0.CO;2-H" }, undefined, fetcher)
    expect(requests[0].url).toBe("https://api.crossref.org/works/10.1002/(SICI)1097-4636(199706)35%3A4%3C477%3A%3AAID-JBM8%3E3.0.CO%3B2-H")
  })

  test("arXiv papers come from doi.org, as CSL JSON", async () => {
    const { fetcher, requests } = fakeFetch(json(arxiv))
    expect(await lookUp({ doi: "10.48550/arXiv.2202.01037", arxiv: "2202.01037" }, undefined, fetcher)).toEqual({ found: true, work: arxiv })
    expect(requests.map((request) => request.url)).toEqual(["https://doi.org/10.48550/arXiv.2202.01037"])
    expect(requests[0].init.headers).toEqual({ Accept: "application/vnd.citationstyles.csl+json" })
  })

  test("a DOI Crossref doesn't have is asked of doi.org", async () => {
    const { fetcher, requests } = fakeFetch(status(404), json(arxiv))
    expect(await lookUp({ doi: "10.5281/zenodo.1234567" }, undefined, fetcher)).toEqual({ found: true, work: arxiv })
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.crossref.org/works/10.5281/zenodo.1234567",
      "https://doi.org/10.5281/zenodo.1234567",
    ])
  })

  test("a DOI that doesn't exist isn't found", async () => {
    expect(await lookUp({ doi: "10.1145/9999999.0000001" }, undefined, fakeFetch(status(404), status(404)).fetcher)).toEqual({
      found: false,
      reason: "not-found",
    })
  })

  test("busy, failing or offline services can't be reached", async () => {
    for (const answers of [[status(429)], [status(503)], [status(404), status(500)], [() => Promise.reject(new TypeError("Failed to fetch"))]]) {
      expect(await lookUp({ doi: "10.1/x" }, undefined, fakeFetch(...answers).fetcher)).toEqual({ found: false, reason: "unreachable" })
    }
    expect(await lookUp({ doi: "10.1/x" }, undefined, fakeFetch(new Response("<html>", { status: 200 })).fetcher)).toEqual({
      found: false,
      reason: "unreachable",
    })
  })

  test("an answer without a paper's record isn't a paper", async () => {
    expect(await lookUp({ doi: "10.1/x" }, undefined, fakeFetch(json({ status: "ok" })).fetcher)).toEqual({ found: false, reason: "not-found" })
    expect(await lookUp({ doi: "10.1/x" }, undefined, fakeFetch(json({ message: { title: [] } })).fetcher)).toEqual({
      found: false,
      reason: "not-found",
    })
    expect(await lookUp({ doi: "10.1/x" }, undefined, fakeFetch(status(404), json(null)).fetcher)).toEqual({ found: false, reason: "not-found" })
  })

  test("a lookup gives up when there's no answer in time", async () => {
    vi.useFakeTimers()
    const lookup = lookUp({ doi: "10.1/x" }, undefined, hanging)
    await vi.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS)
    expect(await lookup).toEqual({ found: false, reason: "unreachable" })
  })

  test("stopping a lookup rejects it", async () => {
    const stop = new AbortController()
    const lookup = lookUp({ doi: "10.1/x" }, stop.signal, hanging)
    stop.abort()
    await expect(lookup).rejects.toThrow()
    // And one that's already stopped doesn't start.
    await expect(lookUp({ doi: "10.1/x" }, stop.signal, hanging)).rejects.toThrow()
  })

  test("stopping a lookup between Crossref and doi.org stops the doi.org request too", async () => {
    vi.useFakeTimers()
    const stop = new AbortController()
    const crossrefMissesThenStop = (async () => {
      stop.abort()
      return status(404)
    }) as unknown as typeof fetch
    const fetcher = ((url: string, init: RequestInit) => (url.includes("crossref") ? crossrefMissesThenStop : hanging)(url, init)) as typeof fetch
    const lookup = lookUp({ doi: "10.1/x" }, stop.signal, fetcher)
    const settled = vi.fn()
    lookup.then(settled, settled)
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).toHaveBeenCalled()
    await expect(lookup).rejects.toThrow()
  })

  test("an answer that stalls halfway still gives up in time, or can be stopped", async () => {
    vi.useFakeTimers()
    const lookup = lookUp({ doi: "10.1/x" }, undefined, stalling)
    await vi.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS)
    expect(await lookup).toEqual({ found: false, reason: "unreachable" })

    const stop = new AbortController()
    const stopped = lookUp({ doi: "10.1/x" }, stop.signal, stalling)
    await vi.advanceTimersByTimeAsync(10)
    stop.abort()
    await expect(stopped).rejects.toThrow()
  })
})
