// Moving and leaving out bullets in a bullets field's text, where each bullet
// is a line starting with "•", or "○" when it's left out (see lib/leftOut.ts).
// Blank lines stay where they are.

import { isLeftOutLine, LEFT_OUT_BULLET } from "@/lib/leftOut"

export interface BulletLine {
  /** Its line in the text, from 0. */
  line: number
  /** Its words, without the "•" or "○". */
  words: string
  leftOut: boolean
}

const wordsOf = (line: string) => line.trim().replace(/^[•○]\s*/, "")

/** The bullets in a field's text, in order. */
export function bulletLines(text: string): BulletLine[] {
  return text.split("\n").flatMap((line, index) => {
    const words = wordsOf(line)
    return words ? [{ line: index, words, leftOut: isLeftOutLine(line) }] : []
  })
}

/** Swaps a bullet with the one above (-1) or below (1), passing over blank lines. Returns the text unchanged at either end. */
export function moveBullet(text: string, line: number, by: -1 | 1): string {
  const lines = text.split("\n")
  let other = line + by
  while (other >= 0 && other < lines.length && !wordsOf(lines[other])) other += by
  if (other < 0 || other >= lines.length || !wordsOf(lines[line] ?? "")) return text
  ;[lines[line], lines[other]] = [lines[other], lines[line]]
  return lines.join("\n")
}

/** Swaps a line with the one above (-1) or below (1), blank or not, as Alt+↑ and Alt+↓ do in the text box. */
export function moveLine(text: string, line: number, by: -1 | 1): string {
  const lines = text.split("\n")
  const other = line + by
  if (line < 0 || line >= lines.length || other < 0 || other >= lines.length) return text
  ;[lines[line], lines[other]] = [lines[other], lines[line]]
  return lines.join("\n")
}

/** Leaves a bullet out of the PDF ("○"), or puts it back ("•"). */
export function setLeftOutLine(text: string, line: number, leftOut: boolean): string {
  const lines = text.split("\n")
  const words = wordsOf(lines[line] ?? "")
  if (!words) return text
  lines[line] = `${leftOut ? LEFT_OUT_BULLET : "•"} ${words}`
  return lines.join("\n")
}
