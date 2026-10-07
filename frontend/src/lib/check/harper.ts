// Runs Harper, the grammar checker, over pieces of a resume's text. The
// browser runs this in a worker (grammar.worker.ts); tests run it directly.

import { Dialect, type Lint, type Linter } from "harper.js"
import type { DialectName } from "./dialect"
import type { GrammarLint } from "./engine"
import { GRAMMAR_RULES_OFF } from "./settings"

export const HARPER_VERSION = "2.10.0"

/** Harper's slim build: its rules and an English dictionary, compiled to WebAssembly. */
export const HARPER_FILE = "dist/harper_wasm_slim_bg.wasm"
export const HARPER_CDN_URL = `https://cdn.jsdelivr.net/npm/harper.js@${HARPER_VERSION}/${HARPER_FILE}`

/** The file's SHA-384, for subresource integrity. harper.test.ts checks it against the installed package. */
export const HARPER_INTEGRITY = "sha384-d4tz693j+G1ZEGoEcNQIKWMekpnZLq0qq6PEv5i0kSMO48Y4j1xMz7c+6BnErIxV"

/** Harper's name for each kind of English (dialect.ts). */
export const DIALECTS: Record<DialectName, Dialect> = {
  american: Dialect.American,
  british: Dialect.British,
  australian: Dialect.Australian,
  canadian: Dialect.Canadian,
  indian: Dialect.Indian,
}

/** Turns off the rules that are wrong for resumes (GRAMMAR_RULES_OFF). */
export async function setUp(linter: Linter): Promise<void> {
  await linter.setup()
  const config = await linter.getDefaultLintConfig()
  for (const rule of GRAMMAR_RULES_OFF) if (rule in config) config[rule] = false
  await linter.setLintConfig(config)
}

// Ways a word can be built on another: "prototyped" on "prototype",
// "distilled" on "distill", "studies" on "study".
const STEMS: [RegExp, string[]][] = [
  [/ied$/, ["y"]],
  [/ies$/, ["y"]],
  [/([^aeiou])\1(ed|ing|er|ers)$/, ["$1", "$1$1"]],
  [/(ed|ing|er|ers)$/, ["", "e"]],
  [/(es|s)$/, [""]],
]

function stemsOf(word: string): string[] {
  const lower = word.toLowerCase()
  if (lower.length < 5) return []
  return STEMS.flatMap(([ending, replacements]) => (ending.test(lower) ? replacements.map((replacement) => lower.replace(ending, replacement)) : []))
}

/**
 * Checks pieces of text, each on its own. Harper's dictionary leaves out
 * some forms of words it knows, as "prototyped", so a word it flags is let
 * through when a word it's built on is spelled right.
 */
export async function lintTexts(linter: Linter, texts: readonly string[]): Promise<GrammarLint[][]> {
  const spelledRight = new Map<string, boolean>()
  const isSpelledRight = async (word: string) => {
    if (!spelledRight.has(word)) {
      const lints = await linter.organizedLints(word, { language: "plaintext" })
      spelledRight.set(word, !lints.SpellCheck?.length)
    }
    return spelledRight.get(word)!
  }
  const results: GrammarLint[][] = []
  for (const text of texts) {
    const found: GrammarLint[] = []
    const organized = await linter.organizedLints(text, { language: "plaintext" })
    for (const [rule, lints] of Object.entries(organized)) {
      for (const lint of lints) {
        const read = readLint(rule, lint)
        lint.free()
        if (rule === "SpellCheck") {
          let built = false
          for (const stem of stemsOf(read.text)) if (await isSpelledRight(stem)) built = true
          if (built) continue
        }
        found.push(read)
      }
    }
    results.push(found.sort((a, b) => a.start - b.start))
  }
  return results
}

// A lint as plain data, to send from the worker, and since Harper's own
// objects have to be freed.
function readLint(rule: string, lint: Lint): GrammarLint {
  const suggestions = lint.suggestions()
  const span = lint.span()
  const read = {
    rule,
    kind: lint.lint_kind(),
    text: lint.get_problem_text(),
    start: span.start,
    message: lint.message(),
    suggestions: suggestions.slice(0, 3).map((suggestion) => suggestion.get_replacement_text()),
  }
  for (const suggestion of suggestions) suggestion.free()
  span.free()
  return read
}
