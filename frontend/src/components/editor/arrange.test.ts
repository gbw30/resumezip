import { describe, expect, test } from "vitest"
import { bulletLines, moveBullet, moveLine, newBullet, nextAnnouncement, setLeftOutLine, toggleMark, withBullets } from "./arrange"

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

describe("typing bullets", () => {
  const at = (text: string, start: number, end = start) => ({ text, start, end })

  test("Enter keeps the words after the cursor in their bullet, so no half of a left-out one is printed", () => {
    expect(newBullet("○ Fed the cat and the dog", 13)).toEqual(at("○ Fed the cat\n○ and the dog", 16))
    expect(newBullet("• Built a loom and a mill", 14)).toEqual(at("• Built a loom\n• and a mill", 17))
    // A selection goes, as typing over it would.
    expect(newBullet("○ Fed the cat and the dog", 13, 17)).toEqual(at("○ Fed the cat\n○ the dog", 16))
  })

  test("Enter at the end of a bullet starts a printed one", () => {
    expect(newBullet("○ Fed the cat", 13)).toEqual(at("○ Fed the cat\n• ", 16))
    expect(newBullet("• Built a loom", 14)).toEqual(at("• Built a loom\n• ", 17))
  })

  test("Enter before a left-out bullet's words keeps it left out, and the new bullet above is printed", () => {
    expect(newBullet("○ Fed the cat", 2)).toEqual(at("• \n○ Fed the cat", 5))
    expect(newBullet("○ Fed the cat", 1)).toEqual(at("•\n○ Fed the cat", 4))
  })

  test("Enter at the start of a line adds no line", () => {
    expect(newBullet("○ Fed the cat", 0)).toEqual(at("○ Fed the cat", 0))
    expect(newBullet("• Built a loom\n○ Fed the cat", 15)).toEqual(at("• Built a loom\n○ Fed the cat", 15))
  })

  test("bold and italic marks go around the words, never the bullet, so a left-out bullet stays left out", () => {
    // As when the whole line is selected.
    const bold = toggleMark("○ Fed the cat", 0, 13, 2)
    expect(bold).toEqual(at("○ **Fed the cat**", 4, 15))
    expect(toggleMark(bold.text, bold.start, bold.end, 2)).toEqual(at("○ Fed the cat", 2, 13))
    expect(toggleMark("• Built a loom\n", 0, 15, 1)).toEqual(at("• *Built a loom*\n", 3, 15))
    // With nothing selected, the marks go where the words start, ready to type in.
    expect(toggleMark("○ Fed the cat", 0, 0, 2)).toEqual(at("○ ****Fed the cat", 4, 4))
  })
})

describe("what a move announces", () => {
  test("a repeat of the same words still changes, so a screen reader reads it again", () => {
    const first = nextAnnouncement("", "Moved to 2 of 3")
    const repeat = nextAnnouncement(first, "Moved to 2 of 3")
    expect(first).toBe("Moved to 2 of 3")
    expect(repeat).not.toBe(first)
    expect(repeat.trim()).toBe("Moved to 2 of 3")
    expect(nextAnnouncement(repeat, "Moved to 2 of 3")).toBe(first)
    expect(nextAnnouncement(repeat, "Moved to 1 of 3")).toBe("Moved to 1 of 3")
  })
})
