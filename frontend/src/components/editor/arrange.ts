// Editing a bullets field's text, where each bullet is a line starting with
// "•", or "○" when it's left out (see lib/leftOut.ts): moving bullets, leaving
// them out, and what Enter and the bold and italic keys do. Blank lines stay
// where they are.

import { isLeftOutLine, LEFT_OUT_BULLET } from "@/lib/leftOut"

export interface BulletLine {
  /** Its line in the text, from 0. */
  line: number
  /** Its words, without the "•" or "○". */
  words: string
  leftOut: boolean
}

const wordsOf = (line: string) => line.trim().replace(/^[•○]\s*/, "")

/**
 * The text as the text box shows it: every non-empty line starts with "• ",
 * so it reads like the PDF, or "○ " for a bullet that's left out. A bullet
 * set in from the left, or followed by a tab (as lists pasted from Word
 * are), counts the same, so "  ○ Fed the cat" and "○\tFed the cat" stay left
 * out. Otherwise only a missing space after the bullet is added, so nothing
 * moves under the cursor while typing.
 */
export function withBullets(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line
      const unindented = /^\s+[•○]/.test(line) ? line.trimStart() : line
      if (unindented === "•" || unindented === "○") return unindented
      if (/^[•○]([^\s]|$)/.test(unindented)) return unindented.replace(/^([•○])/, "$1 ")
      // A bullet with any space after it is kept as typed.
      return /^[•○]/.test(unindented) ? unindented : `• ${unindented}`
    })
    .join("\n")
}

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

// Where the line with `at` in it starts.
const lineStartOf = (text: string, at: number) => (at > 0 ? text.lastIndexOf("\n", at - 1) + 1 : 0)

/** Text with the cursor, or a selection, in it. */
export interface Edited {
  text: string
  start: number
  end: number
}

/**
 * What Enter does, with the cursor (or a selection) from start to end: the
 * words after the cursor go on a new bullet below. They stay left out if
 * their bullet was, so no part of a left-out bullet gets printed, but a
 * bullet with no words yet is printed. At the start of a line, it adds none.
 */
export function newBullet(text: string, start: number, end = start): Edited {
  const from = lineStartOf(text, start)
  if (start === from) return { text: text.slice(0, start) + text.slice(end), start, end: start }
  const head = text.slice(from, start)
  const rest = text.slice(end).replace(/^[^\S\n]+/, "")
  const leftOut = isLeftOutLine(head)
  const bullet = leftOut && wordsOf(rest.split("\n")[0]) ? LEFT_OUT_BULLET : "•"
  // A left-out bullet that's left with no words is a new one now.
  const kept = leftOut && !wordsOf(head) ? `•${head.slice(1)}` : head
  const cursor = start + 3
  return { text: `${text.slice(0, from)}${kept}\n${bullet} ${rest}`, start: cursor, end: cursor }
}

/**
 * Adds or removes a mark around the words from start to end, ** for bold or
 * * for italic, and keeps them selected. A line's bullet stays outside the
 * marks, as it has to come first on its line.
 */
export function toggleMark(text: string, start: number, end: number, size: 1 | 2): Edited {
  const from = lineStartOf(text, start)
  start = Math.max(start, from + (text.slice(from).match(/^[•○][^\S\n]*/)?.[0].length ?? 0))
  end = Math.max(end, start)
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  // Asterisks already around the words: one for italic, two for bold, three for both.
  let before = 0
  while (before < 3 && text[start - 1 - before] === "*") before++
  let after = 0
  while (after < 3 && text[end + after] === "*") after++
  const marks = Math.min(before, after)
  const marked = size === 2 ? marks >= 2 : marks === 1 || marks === 3
  const stars = "*".repeat(size)
  const shift = marked ? -size : size
  return {
    text: marked
      ? text.slice(0, start - size) + text.slice(start, end) + text.slice(end + size)
      : text.slice(0, start) + stars + text.slice(start, end) + stars + text.slice(end),
    start: start + shift,
    end: end + shift,
  }
}
