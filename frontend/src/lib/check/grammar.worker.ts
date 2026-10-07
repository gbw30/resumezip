// Checks spelling and grammar off the main thread with Harper (harper.ts), so
// a long resume never holds up typing. Harper's WebAssembly comes from
// jsDelivr, or the app's own copy if that fails, checked against its hash
// either way, as the PDF engine's is. Messages are answered one at a time, in
// order.

import { createBinaryModuleFromUrl, LocalLinter } from "harper.js"
import { slimBinary } from "harper.js/slimBinary"
import { downloadChecked } from "@/lib/typst/compilerSource"
import type { DialectName } from "./dialect"
import type { GrammarLint } from "./engine"
import { DIALECTS, HARPER_CDN_URL, HARPER_INTEGRITY, lintTexts, setUp } from "./harper"

export interface GrammarRequest {
  id: number
  dialect: DialectName
  texts: string[]
}

export type GrammarAnswer = { id: number; lints: GrammarLint[][] } | { id: number; error: string }

// How long a download can go without anything arriving before it's given up.
const IDLE_MS = 15_000

// Harper from jsDelivr, or else the app's copy, which is the same file, as a
// file of its own here.
async function binaryUrl(): Promise<string> {
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = await downloadChecked(HARPER_CDN_URL, HARPER_INTEGRITY, IDLE_MS)
  } catch {
    bytes = await downloadChecked(typeof slimBinary.url === "string" ? slimBinary.url : slimBinary.url.href, HARPER_INTEGRITY, IDLE_MS)
  }
  return URL.createObjectURL(new Blob([bytes], { type: "application/wasm" }))
}

// A linter for each kind of English, all sharing one copy of Harper: each
// more costs a few megabytes.
let linters: Promise<Record<DialectName, LocalLinter>> | null = null

function loadLinters(): Promise<Record<DialectName, LocalLinter>> {
  linters ??= binaryUrl().then(async (url) => {
    try {
      const binary = createBinaryModuleFromUrl(url, "slim")
      const loaded = await Promise.all(
        (Object.keys(DIALECTS) as DialectName[]).map(async (dialect) => {
          const linter = new LocalLinter({ binary, dialect: DIALECTS[dialect] })
          await setUp(linter)
          return [dialect, linter] as const
        }),
      )
      return Object.fromEntries(loaded) as Record<DialectName, LocalLinter>
    } finally {
      // Harper keeps what it loaded, so the file can go.
      URL.revokeObjectURL(url)
    }
  })
  // A failed load is tried again with the next message.
  linters.catch(() => (linters = null))
  return linters
}

let queue = Promise.resolve()

addEventListener("message", ({ data }: MessageEvent<GrammarRequest>) => {
  queue = queue.then(async () => {
    try {
      const all = await loadLinters()
      const others = (Object.keys(all) as DialectName[]).filter((dialect) => dialect !== data.dialect).map((dialect) => all[dialect])
      postMessage({ id: data.id, lints: await lintTexts(all[data.dialect], data.texts, others) } satisfies GrammarAnswer)
    } catch (error) {
      postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) } satisfies GrammarAnswer)
    }
  })
})
