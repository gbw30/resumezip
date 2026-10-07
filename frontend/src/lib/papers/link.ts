// Works out a paper's DOI from what someone pasted: a DOI, a doi.org link, a
// publisher's page with the DOI in its address, an arXiv link or ID, or a
// citation that includes one of these.

import { doiOf } from "@/lib/typst/resumeData"

export interface PaperId {
  doi: string
  /** The arXiv ID, without its version, for papers on arXiv: "2202.01037" or "hep-th/9901001". */
  arxiv?: string
}

// arXiv IDs since 2007 ("2202.01037") and before ("hep-th/9901001", "math.GT/0309136").
const ARXIV_ID = String.raw`(\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?`
const ARXIV_BARE = new RegExp(String.raw`^${ARXIV_ID}$`, "i")
const ARXIV_IN_TEXT = new RegExp(String.raw`(?:arxiv\.org\/(?:abs|pdf|html|format)\/|\barxiv:\s*)${ARXIV_ID}`, "i")
const ARXIV_DOI = /^10\.48550\/arxiv\.(.+?)(?:v\d+)?$/i

// A DOI in a link's path or query (PLOS's ?id=10.1371/...), or in a citation after "doi:".
const DOI_IN_TEXT = /(?:^|[\s/=:(])(10\.\d{4,9}\/[^\s?#&"]+)/
// What publishers' addresses add after the DOI.
const AFTER_DOI = /(?:\.full\.pdf|\.full|\.pdf|\.abstract|\/(?:full|abstract|pdf|epdf|fulltext(?:\.html)?|meta)|[.,;/])$/i

const arxivPaper = (id: string): PaperId => ({ doi: `10.48550/arXiv.${id}`, arxiv: id })

function decoded(text: string) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** A DOI found in a link or a citation, without what comes after it. */
function doiIn(text: string): string {
  let doi = text.match(DOI_IN_TEXT)?.[1] ?? ""
  for (let previous = ""; doi !== previous; ) {
    previous = doi
    doi = doi.replace(AFTER_DOI, "")
    // A closing bracket that isn't the DOI's own, as in "(doi: 10.1/x)".
    if (doi.endsWith(")") && doi.split("(").length < doi.split(")").length) doi = doi.slice(0, -1)
  }
  // bioRxiv and medRxiv addresses add the version: 10.1101/2020.03.22.002386v2.
  return doi.startsWith("10.1101/") ? doi.replace(/v\d+$/, "") : doi
}

/** The paper's DOI (and arXiv ID), or null when what was pasted doesn't include one. */
export function paperIdOf(pasted: string): PaperId | null {
  const text = decoded(pasted.trim())
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
  const address = text.split(/[?#]/)[0].replace(/\/+$/, "")

  const arxiv = address.match(ARXIV_BARE) ?? text.match(ARXIV_IN_TEXT)
  if (arxiv) return arxivPaper(arxiv[1])

  // Nature's pages are named after the DOI: nature.com/articles/s41586-020-2649-2.
  const nature = address.match(/^nature\.com\/articles\/([a-z0-9.-]+)$/i)
  const doi = doiOf(address.replace(/[.,;]+$/, "")) || (nature ? `10.1038/${nature[1]}` : "") || doiIn(text)
  if (!doi) return null
  const arxivDoi = doi.match(ARXIV_DOI)
  return arxivDoi ? arxivPaper(arxivDoi[1]) : { doi }
}
