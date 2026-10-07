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

async function get(url: string, headers: Record<string, string>, signal: AbortSignal | undefined, fetcher: typeof fetch) {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), LOOKUP_TIMEOUT_MS)
  const abort = () => stop.abort()
  signal?.addEventListener("abort", abort)
  try {
    return await fetcher(url, { headers, signal: stop.signal, credentials: "omit", referrerPolicy: "no-referrer" })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
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
      if (crossref.ok) return { found: true, work: ((await crossref.json()) as { message?: unknown }).message }
      if (crossref.status !== 404) return { found: false, reason: "unreachable" }
    }
    const doiOrg = await get(DOI_ORG + path(paper.doi), { Accept: CSL_JSON }, signal, fetcher)
    if (doiOrg.ok) return { found: true, work: await doiOrg.json() }
    return { found: false, reason: doiOrg.status === 404 || doiOrg.status === 400 ? "not-found" : "unreachable" }
  } catch (error) {
    // Offline, blocked, too slow, or an answer that isn't JSON.
    if (signal?.aborted) throw error
    return { found: false, reason: "unreachable" }
  }
}
