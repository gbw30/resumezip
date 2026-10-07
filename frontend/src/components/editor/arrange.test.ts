import { describe, expect, test } from "vitest"
import { bulletLines, moveBullet, moveLine, setLeftOutLine, withBullets } from "./arrange"

const text = "• Built a loom\n\n○ Fed the cat\n• Wrote the notes"

describe("the text box", () => {
  test("starts every line with a bullet, keeping ones left out as they are", () => {
    expect(withBullets("Built a loom\n•Fed the cat\n○Wrote the notes\n\n• Kept")).toBe("• Built a loom\n• Fed the cat\n○ Wrote the notes\n\n• Kept")
    expect(withBullets("•\n○\n  ")).toBe("•\n○\n  ")
  })

  test("counts a bullet set in from the left the same, so a left-out one stays left out", () => {
    expect(withBullets("  ○ Fed the cat\n\t• Built a loom")).toBe("○ Fed the cat\n• Built a loom")
    expect(bulletLines(withBullets("  ○ Fed the cat"))).toEqual([{ line: 0, words: "Fed the cat", leftOut: true }])
  })

  test("leaves the spaces typed after a bullet alone, so nothing moves under the cursor", () => {
    expect(withBullets("•  Two spaces")).toBe("•  Two spaces")
  })

  test("counts a bullet followed by a tab or another kind of space, as pasted lists have, the same", () => {
    expect(withBullets("○\tFed the cat\n•\tBuilt a loom\n○\u00A0Wrote the notes")).toBe("○\tFed the cat\n•\tBuilt a loom\n○\u00A0Wrote the notes")
    expect(bulletLines(withBullets("○\tFed the cat\n•\tBuilt a loom"))).toEqual([
      { line: 0, words: "Fed the cat", leftOut: true },
      { line: 1, words: "Built a loom", leftOut: false },
    ])
  })
})

describe("arranging bullets", () => {
  test("reads each bullet with its line, its words and whether it's left out", () => {
    expect(bulletLines(text)).toEqual([
      { line: 0, words: "Built a loom", leftOut: false },
      { line: 2, words: "Fed the cat", leftOut: true },
      { line: 3, words: "Wrote the notes", leftOut: false },
    ])
    expect(bulletLines("•\n  \n")).toEqual([])
  })

  test("moves a bullet past the blank lines next to it, and nowhere past either end", () => {
    expect(moveBullet(text, 2, -1)).toBe("○ Fed the cat\n\n• Built a loom\n• Wrote the notes")
    expect(moveBullet(text, 2, 1)).toBe("• Built a loom\n\n• Wrote the notes\n○ Fed the cat")
    expect(moveBullet(text, 0, -1)).toBe(text)
    expect(moveBullet(text, 3, 1)).toBe(text)
    expect(moveBullet(text, 1, 1)).toBe(text)
  })

  test("moves a line in the text box by one, as Alt+↑ and Alt+↓ do", () => {
    expect(moveLine(text, 2, -1)).toBe("• Built a loom\n○ Fed the cat\n\n• Wrote the notes")
    expect(moveLine(text, 0, -1)).toBe(text)
    expect(moveLine(text, 3, 1)).toBe(text)
  })

  test("leaves a bullet out, and puts it back, keeping its words and bold or italic marks", () => {
    expect(setLeftOutLine("• Built a **loom**", 0, true)).toBe("○ Built a **loom**")
    expect(setLeftOutLine(text, 2, false)).toBe("• Built a loom\n\n• Fed the cat\n• Wrote the notes")
    expect(setLeftOutLine(text, 1, true)).toBe(text)
  })
})
