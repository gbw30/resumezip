// How much "Open a file" reads before it gives up. Each is far beyond any real
// resume (most are a page or two, under 10,000 characters), so they only stop
// files that aren't resumes, or that would keep the browser busy for minutes.

/** The file itself. */
export const MAX_BYTES = 20 * 1024 * 1024
/** Pages in a PDF, checked before any of them is read. */
export const MAX_PAGES = 20
/** Text, checked as it's read: a PDF's as each piece arrives, a Word file's once it's converted. */
export const MAX_CHARACTERS = 200_000
export const MAX_LINES = 5_000
/** A Word file's text once unzipped, checked before it's converted, since a small file can unzip to a lot. */
export const MAX_WORD_XML_BYTES = 10 * 1024 * 1024
/** Reading a file from start to finish, downloads included. */
export const TIME_LIMIT_MS = 60_000

/** A file with more text than the limits above allow. */
export class TooMuchTextError extends Error {}
