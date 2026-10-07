// Harper as the browser runs it, for tests: the same build, with its
// WebAssembly read from the installed package instead of downloaded.

import { LocalLinter } from "harper.js"
import { slimBinaryInlined } from "harper.js/slimBinaryInlined"
import type { DialectName } from "./dialect"
import type { GrammarLint, GrammarReading } from "./engine"
import { DIALECTS, lintTexts, setUp } from "./harper"

const linters = new Map<DialectName, Promise<LocalLinter>>()

function linterFor(dialect: DialectName): Promise<LocalLinter> {
  let linter = linters.get(dialect)
  if (!linter) {
    linter = (async () => {
      const created = new LocalLinter({ binary: slimBinaryInlined, dialect: DIALECTS[dialect] })
      await setUp(created)
      return created
    })()
    linters.set(dialect, linter)
  }
  return linter
}

/** What Harper finds in each text, reading it as `dialect`, with the other kinds of English to check words against, as the worker does. */
export async function harperLints(texts: string[], dialect: DialectName = "american"): Promise<GrammarLint[][]> {
  const others = (Object.keys(DIALECTS) as DialectName[]).filter((other) => other !== dialect)
  return lintTexts(await linterFor(dialect), texts, await Promise.all(others.map(linterFor)))
}

/** A grammar reading of the given texts, as the editor builds one. */
export async function readingOf(texts: string[], dialect: DialectName = "american"): Promise<GrammarReading> {
  const lints = await harperLints(texts, dialect)
  return new Map(texts.map((text, index) => [text, lints[index]]))
}
