// Looks up a paper's record by its DOI, straight from the browser. Only the
// DOI is sent: no cookies, and no referrer, so not even the editor's address
// goes with it.
//
// Crossref has most journal and conference papers, and its own API keeps a
// chapter's book title, which doi.org's CSL JSON drops. arXiv's DOIs are
// DataCite's, and doi.org answers for those and for every other registry.
// Crossref answers one request at a time from each visitor, so look papers up
// one after another.

import type { PaperId } from "./link"

export type Lookup = { found: true; work: unknown } | { found: false; reason: "not-found" | "unreachable" }

const CROSSREF = "https://api.crossref.org/works/"
const DOI_ORG = "https://doi.org/"
const CSL_JSON = "application/vnd.citationstyles.csl+json"

/** How long a lookup waits for an answer before giving up. */
export const LOOKUP_TIMEOUT_MS = 15_000

// A DOI in an address: "/" stays, and anything else that means something there is escaped.
const path = (doi: string) => doi.split("/").map(encodeURIComponent).join("/")

/**
 * An answer's status, and its JSON when it's OK. The time limit and `signal`
 * cover reading the answer too, so one that stalls halfway can still be stopped.
 */
async function get(url: string, headers: Record<string, string>, signal: AbortSignal | undefined, fetcher: typeof fetch) {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), LOOKUP_TIMEOUT_MS)
  const abort = () => stop.abort()
  // A signal aborted before this request started never fires "abort" again.
  if (signal?.aborted) abort()
  signal?.addEventListener("abort", abort)
  try {
    const response = await fetcher(url, { headers, signal: stop.signal, credentials: "omit", referrerPolicy: "no-referrer" })
    return { ok: response.ok, status: response.status, body: response.ok ? ((await response.json()) as unknown) : undefined }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

// A record without a title isn't a paper's, so it isn't added as one.
function paperIn(work: unknown): Lookup {
  const title = work && typeof work === "object" ? (work as { title?: unknown }).title : undefined
  const first = Array.isArray(title) ? title[0] : title
  return typeof first === "string" && first.trim() ? { found: true, work } : { found: false, reason: "not-found" }
}

/**
 * The paper's record from Crossref (its `message`) or doi.org (CSL JSON).
 * Rejects only when `signal` stops it.
 */
export async function lookUp(paper: PaperId, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Lookup> {
  signal?.throwIfAborted()
  try {
    if (!paper.arxiv) {
      const crossref = await get(CROSSREF + path(paper.doi), {}, signal, fetcher)
      if (crossref.ok) return paperIn((crossref.body as { message?: unknown } | null)?.message)
      if (crossref.status !== 404) return { found: false, reason: "unreachable" }
    }
    const doiOrg = await get(DOI_ORG + path(paper.doi), { Accept: CSL_JSON }, signal, fetcher)
    if (doiOrg.ok) return paperIn(doiOrg.body)
    return { found: false, reason: doiOrg.status === 404 || doiOrg.status === 400 ? "not-found" : "unreachable" }
  } catch (error) {
    // Offline, blocked, too slow, or an answer that isn't JSON.
    if (signal?.aborted) throw error
    return { found: false, reason: "unreachable" }
  }
}
