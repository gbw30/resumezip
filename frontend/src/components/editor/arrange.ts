// Editing a bullets field's text, where each bullet is a line starting with
// "•", or "○" when it's left out (see lib/leftOut.ts): moving bullets, leaving
// them out, and what Enter and the bold and italic keys do. Blank lines stay
// where they are.

import { BULLET_CHARS } from "@/lib/import/lines"
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

/**
 * Where a cursor at `at` in `text` goes once `withBullets` has given its lines
 * their bullets. Bullets only change the start of a line: past that, the
 * cursor moves along with the words, so it ends up after a bullet added at
 * the start of its line. Within it, it stays where it was, so it's never moved
 * by what changes after it.
 */
export function cursorWithBullets(text: string, at: number): number {
  const before = text.slice(0, at).split("\n")
  const line = before.length - 1
  const column = before[line].length
  const typed = text.split("\n")[line]
  const lines = withBullets(text).split("\n")
  const shown = lines[line]
  // How much of the line's end is as typed: the rest is its start, changed.
  let same = 0
  while (same < typed.length && same < shown.length && typed[typed.length - 1 - same] === shown[shown.length - 1 - same]) same++
  const start = lines.slice(0, line).reduce((total, words) => total + words.length + 1, 0)
  return start + (column >= typed.length - same ? column + shown.length - typed.length : Math.min(column, shown.length - same))
}

// A list marker at the start of a line, as lists copied from elsewhere have:
// a symbol from BULLET_CHARS, like "●", "▪", the "○" of Google Docs'
// sub-bullets or Word's "", or "- ", "* ", "– ", "— ", "1. " or "1) ", up to
// "999. ". Not "-5%", "*bold*", "1.5x", or a year, as in "2019. Promoted". No
// word starts with one of the symbols, so they can touch their words.
const LIST_MARKER = new RegExp(String.raw`^\s*(?:[${BULLET_CHARS}]\s*|(?:[-–—*]|\d{1,3}[.)])\s+)`)

/**
 * The line a list is pasted into, up to the cursor (`before`), with `text`
 * pasted after it: a bullet in place of each list marker that starts a line,
 * so a pasted list gets one bullet per line, not two. After a bullet in
 * `before`, the first line's marker just goes; after words, it isn't at the
 * start of a line, so it stays.
 *
 * A "○" pasted from elsewhere is a sub-bullet, so it's printed. Text copied
 * from a bullets box (`copiedHere`) keeps its own bullets instead, so a
 * left-out one cut and pasted stays left out, even onto a new line's "• ".
 */
export function pastedList(text: string, before: string, copiedHere = false): string {
  const own = (line: string) => copiedHere && /^\s*[•○]/.test(line)
  const listed = (line: string) => (own(line) ? line : line.replace(LIST_MARKER, "• "))
  const [first, ...rest] = text.split("\n")
  let head = before + first
  if (!before.trim()) head = before + listed(first)
  else if (/^\s*[•○]\s*$/.test(before)) head = own(first) ? first : before + first.replace(LIST_MARKER, "")
  return [head, ...rest.map(listed)].join("\n")
}

// A bullet, then "- " or "* " (or "– ", "— "), up to the cursor.
const TYPED_MARKER = /^([•○])[^\S\n]*[-–—*][^\S\n]$/

/**
 * The line up to the cursor (`before`), with `typed` typed after it. "- " or
 * "* " at the start of a line starts a list in other editors, but here the
 * line has its bullet already, so the marker goes once the space after it is
 * typed. Only then, so "-5%" stays as typed.
 */
export const typedList = (before: string, typed: string) => (before + typed).replace(TYPED_MARKER, "$1 ")

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

/** Where the line with `at` in it starts. */
export const lineStartOf = (text: string, at: number) => (at > 0 ? text.lastIndexOf("\n", at - 1) + 1 : 0)

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

/**
 * What a screen reader's status line says next, to say `text` after `last`.
 * The same words twice in a row change nothing on the page, so they'd only be
 * read once, as after moving one entry to second place and then another one:
 * a repeat ends with a no-break space, which isn't read out.
 */
export const nextAnnouncement = (last: string, text: string) => (last === text ? `${text}\u00a0` : text)
