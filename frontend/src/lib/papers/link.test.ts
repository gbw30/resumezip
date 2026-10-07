import { describe, expect, test } from "vitest"
import { paperIdOf } from "./link"

const doiOf = (pasted: string) => paperIdOf(pasted)?.doi ?? null

describe("a paper's DOI from what was pasted", () => {
  test("a DOI on its own, after doi:, or as a doi.org link", () => {
    for (const pasted of [
      "10.1145/3580305.3599572",
      "  10.1145/3580305.3599572 ",
      "doi:10.1145/3580305.3599572",
      "DOI: 10.1145/3580305.3599572",
      "https://doi.org/10.1145/3580305.3599572",
      "http://dx.doi.org/10.1145/3580305.3599572",
      "doi.org/10.1145/3580305.3599572/",
      "https://doi.org/10.1145%2F3580305.3599572",
    ]) {
      expect(doiOf(pasted), pasted).toBe("10.1145/3580305.3599572")
    }
  })

  test("a publisher's page with the DOI in its address", () => {
    const cases: [string, string][] = [
      ["https://dl.acm.org/doi/10.1145/3580305.3599572", "10.1145/3580305.3599572"],
      ["https://dl.acm.org/doi/pdf/10.1145/3580305.3599572", "10.1145/3580305.3599572"],
      ["https://link.springer.com/chapter/10.1007/978-3-030-58452-8_13", "10.1007/978-3-030-58452-8_13"],
      ["https://link.springer.com/content/pdf/10.1007/978-3-030-58452-8_13.pdf", "10.1007/978-3-030-58452-8_13"],
      ["https://onlinelibrary.wiley.com/doi/10.1002/anie.202012345/abstract", "10.1002/anie.202012345"],
      ["https://www.tandfonline.com/doi/full/10.1080/14786435.2020.1234567?scroll=top&needAccess=true", "10.1080/14786435.2020.1234567"],
      ["https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0123456", "10.1371/journal.pone.0123456"],
      ["https://www.frontiersin.org/articles/10.3389/fpsyg.2020.01234/full", "10.3389/fpsyg.2020.01234"],
      ["https://www.biorxiv.org/content/10.1101/2020.03.22.002386v2.full.pdf", "10.1101/2020.03.22.002386"],
      ["https://www.biorxiv.org/content/10.1101/2020.03.22.002386v1#abstract", "10.1101/2020.03.22.002386"],
      ["https://www.nature.com/articles/s41586-020-2649-2", "10.1038/s41586-020-2649-2"],
    ]
    for (const [pasted, doi] of cases) expect(doiOf(pasted), pasted).toBe(doi)
  })

  test("a citation that ends with its DOI", () => {
    expect(doiOf("C. R. Harris et al., “Array programming with NumPy,” Nature, 2020, doi: 10.1038/s41586-020-2649-2.")).toBe(
      "10.1038/s41586-020-2649-2",
    )
    expect(doiOf("Array programming with NumPy (doi:10.1038/s41586-020-2649-2)")).toBe("10.1038/s41586-020-2649-2")
    // Brackets that are part of the DOI stay.
    expect(doiOf("10.1016/S0140-6736(20)30183-5")).toBe("10.1016/S0140-6736(20)30183-5")
  })

  test("arXiv links and IDs, without their version", () => {
    for (const pasted of [
      "https://arxiv.org/abs/2202.01037",
      "arxiv.org/abs/2202.01037v3",
      "https://arxiv.org/pdf/2202.01037v1.pdf",
      "https://arxiv.org/html/2202.01037v2",
      "https://export.arxiv.org/abs/2202.01037",
      "arXiv:2202.01037",
      "arXiv: 2202.01037v2 [cs.RO]",
      "2202.01037",
      "https://doi.org/10.48550/arXiv.2202.01037",
      "10.48550/ARXIV.2202.01037",
    ]) {
      expect(paperIdOf(pasted), pasted).toEqual({ doi: "10.48550/arXiv.2202.01037", arxiv: "2202.01037" })
    }
  })

  test("arXiv's older IDs, named after a subject", () => {
    expect(paperIdOf("https://arxiv.org/abs/hep-th/9901001v2")).toEqual({ doi: "10.48550/arXiv.hep-th/9901001", arxiv: "hep-th/9901001" })
    expect(paperIdOf("arXiv:math.GT/0309136")).toEqual({ doi: "10.48550/arXiv.math.GT/0309136", arxiv: "math.GT/0309136" })
  })

  test("nothing when there's no DOI to find", () => {
    for (const pasted of [
      "",
      "   ",
      "https://ieeexplore.ieee.org/document/9157091",
      "https://openreview.net/forum?id=YicbFdNTTy",
      "https://www.sciencedirect.com/science/article/pii/S0092867420302269",
      "Array programming with NumPy",
      "10.1145",
    ]) {
      expect(paperIdOf(pasted), pasted).toBeNull()
    }
  })
})
