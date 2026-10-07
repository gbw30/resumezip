import { describe, expect, test } from "vitest"
import { toTemplateData } from "@/lib/typst/resumeData"
import articleNumber from "./fixtures/crossref-article-number.json"
import biorxiv from "./fixtures/crossref-biorxiv.json"
import htmlTitle from "./fixtures/crossref-html-title.json"
import kdd from "./fixtures/crossref-kdd.json"
import numpy from "./fixtures/crossref-numpy.json"
import springerChapter from "./fixtures/crossref-springer-chapter.json"
import arxiv from "./fixtures/doi-org-arxiv.json"
import arxivOld from "./fixtures/doi-org-arxiv-old.json"
import { paperIdOf } from "./link"
import { publicationOf } from "./publication"

// Records as Crossref and doi.org sent them (fixtures/, trimmed to the fields that matter).
const fromCrossref = (body: { message: unknown }, owner = "") => publicationOf(body.message, { doi: (body.message as { DOI: string }).DOI }, owner)
const fromArxiv = (body: unknown, pasted: string) => publicationOf(body, paperIdOf(pasted)!, "")

describe("a paper's record as the editor's fields", () => {
  test("a journal article", () => {
    expect(fromCrossref(numpy)).toEqual({
      publicationTitle: "Array programming with NumPy",
      publicationAuthors: "C. R. Harris et al.",
      publicationDate: "Sep 2020",
      publicationVenue: "Nature",
      publicationDetails: "vol. 585, no. 7825, pp. 357–362",
      publicationLink: "10.1038/s41586-020-2649-2",
    })
  })

  test("a conference paper", () => {
    expect(fromCrossref(kdd)).toEqual({
      publicationTitle: "Towards Next-Generation Intelligent Assistants Leveraging LLM Techniques",
      publicationAuthors: "X. L. Dong, S. Moon, Y. E. Xu, K. Malik, Z. Yu",
      publicationDate: "Aug 2023",
      publicationVenue: "Proc. 29th ACM SIGKDD Conference on Knowledge Discovery and Data Mining",
      publicationDetails: "pp. 5792–5793",
      publicationLink: "10.1145/3580305.3599572",
    })
  })

  test("a chapter is published in its book, not its book series", () => {
    expect(fromCrossref(springerChapter)).toMatchObject({
      publicationAuthors: "N. Carion, F. Massa, G. Synnaeve, N. Usunier, A. Kirillov, S. Zagoruyko",
      publicationVenue: "Computer Vision – ECCV 2020",
      publicationDetails: "pp. 213–229",
      publicationDate: "2020",
    })
  })

  test("an article with a number instead of pages", () => {
    expect(fromCrossref(articleNumber)).toMatchObject({
      publicationVenue: "Nature Communications",
      publicationDetails: "vol. 17, no. 1, Art. no. 1811",
      publicationDate: "Jan 2026",
    })
  })

  test("a title's markup and line breaks are dropped", () => {
    expect(fromCrossref(htmlTitle)).toMatchObject({
      publicationTitle: "Catabolite Repression of Escherichia coli Biofilm Formation",
      publicationAuthors: "D. W. Jackson, J. W. Simecka, T. Romeo",
      publicationVenue: "Journal of Bacteriology",
    })
    // A tag split by another goes too, but escaped brackets are the title's own.
    expect(publicationOf({ title: "Sparse <i<b>>Attention</i> for &lt;10 GB" }, { doi: "10.1/x" }, "").publicationTitle).toBe(
      "Sparse Attention for <10 GB",
    )
  })

  test("a bioRxiv preprint", () => {
    expect(fromCrossref(biorxiv)).toMatchObject({
      publicationVenue: "bioRxiv preprint",
      publicationDetails: "",
      publicationDate: "Mar 2020",
    })
  })

  test("an arXiv paper, dated by its ID", () => {
    expect(fromArxiv(arxiv, "arxiv.org/abs/2202.01037v2")).toEqual({
      publicationTitle: "RoboKrill: a metachronal drag-based swimmer robot",
      publicationAuthors: "S. O. Santos, F. Cuenca-Jiménez, P. A. Gomez-Valdez, O. Morales-Lopez, M. M. Wilhelmus",
      publicationDate: "Feb 2022",
      publicationVenue: "arXiv preprint",
      publicationDetails: "",
      publicationLink: "10.48550/arXiv.2202.01037",
    })
    expect(fromArxiv(arxivOld, "arXiv:hep-th/9901001")).toMatchObject({
      publicationAuthors: "Y. Imamura",
      publicationDate: "Jan 1999",
      publicationVenue: "arXiv preprint",
      publicationLink: "10.48550/arXiv.hep-th/9901001",
    })
  })
})

describe("authors", () => {
  test("hyphenated first names keep their hyphen", () => {
    expect(fromCrossref(articleNumber).publicationAuthors).toMatch(/^G\.-C\. Zhuang et al\.$/)
  })

  test("past six authors, the list runs to the resume owner's name, then et al.", () => {
    expect(fromCrossref(numpy, "Ralf Gommers").publicationAuthors).toBe("C. R. Harris, K. J. Millman, S. J. van der Walt, R. Gommers, et al.")
    expect(fromCrossref(numpy, "Charles Harris").publicationAuthors).toBe("C. R. Harris et al.")
    // Not among them: the first author.
    expect(fromCrossref(biorxiv, "Jake Ryan").publicationAuthors).toBe("D. E. Gordon et al.")
  })

  test("the templates still print the resume owner's name in bold", () => {
    const owner = "Stéfan van der Walt"
    const resume = { profileSection: { fullName: owner }, publicationsSection: [{ id: 1, ...fromCrossref(numpy, owner) }] }
    const [publication] = toTemplateData(resume).publications
    expect(publication.authors.filter((piece) => piece.me).map((piece) => piece.text)).toEqual(["S. J. van der Walt"])
    expect(publication.doi).toBe("10.1038/s41586-020-2649-2")
  })

  test("groups, names in one piece and name particles", () => {
    const authors = [
      { name: "ATLAS Collaboration" },
      { literal: "Lovelace, Ada" },
      { given: "Ludwig", "non-dropping-particle": "van", family: "Beethoven" },
      { given: "Jean-Pierre", family: "Serre" },
    ]
    expect(publicationOf({ author: authors }, { doi: "10.1/x" }, "").publicationAuthors).toBe(
      "ATLAS Collaboration, A. Lovelace, L. van Beethoven, J.-P. Serre",
    )
  })
})

describe("missing or odd fields", () => {
  test("an empty record gives empty fields, with the DOI kept", () => {
    expect(publicationOf({}, { doi: "10.1/x" }, "")).toEqual({
      publicationTitle: "",
      publicationAuthors: "",
      publicationDate: "",
      publicationVenue: "",
      publicationDetails: "",
      publicationLink: "10.1/x",
    })
    expect(publicationOf(null, { doi: "10.1/x" }, "").publicationLink).toBe("10.1/x")
  })

  test("escaped characters, subtitles and a year without a month", () => {
    expect(
      publicationOf(
        {
          title: ["Graphs &amp; Trees"],
          subtitle: ["A Short Course"],
          "container-title": "Journal of Graphs &#x26; Things",
          issued: { "date-parts": [[2019, null]] },
          page: "e1003",
        },
        { doi: "10.1/x" },
        "",
      ),
    ).toMatchObject({
      publicationTitle: "Graphs & Trees: A Short Course",
      publicationVenue: "Journal of Graphs & Things",
      publicationDate: "2019",
      publicationDetails: "Art. no. e1003",
    })
  })
})
