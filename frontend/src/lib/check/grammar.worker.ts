// Checks spelling and grammar off the main thread with Harper (harper.ts), so
// a long resume never holds up typing. Harper's WebAssembly comes from
// jsDelivr, checked against its hash, or the app's own copy if that fails,
// as the PDF engine's does. Messages are answered one at a time, in order.

import { createBinaryModuleFromUrl, LocalLinter } from "harper.js"
import { slimBinary } from "harper.js/slimBinary"
import type { GrammarLint } from "./engine"
import type { DialectName } from "./dialect"
import { DIALECTS, HARPER_CDN_URL, HARPER_INTEGRITY, lintTexts, setUp } from "./harper"

export interface GrammarRequest {
  id: number
  dialect: DialectName
  texts: string[]
}

export type GrammarAnswer = { id: number; lints: GrammarLint[][] } | { id: number; error: string }

// How long jsDelivr gets before the app's own copy is used instead.
const CDN_TIMEOUT_MS = 60_000

// Harper from jsDelivr, as a file of its own here, or the app's copy.
async function binaryUrl(): Promise<string> {
  try {
    const response = await fetch(HARPER_CDN_URL, { integrity: HARPER_INTEGRITY, credentials: "omit", signal: AbortSignal.timeout(CDN_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`${HARPER_CDN_URL} answered ${response.status}`)
    return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: "application/wasm" }))
  } catch {
    return typeof slimBinary.url === "string" ? slimBinary.url : slimBinary.url.href
  }
}

let linter: Promise<LocalLinter> | null = null

function linterFor(dialect: DialectName): Promise<LocalLinter> {
  linter ??= binaryUrl().then(async (url) => {
    const loaded = new LocalLinter({ binary: createBinaryModuleFromUrl(url, "slim"), dialect: DIALECTS[dialect] })
    await setUp(loaded)
    return loaded
  })
  // A failed load is tried again with the next message.
  linter.catch(() => (linter = null))
  return linter.then(async (loaded) => {
    if ((await loaded.getDialect()) !== DIALECTS[dialect]) {
      await loaded.setDialect(DIALECTS[dialect])
      await setUp(loaded)
    }
    return loaded
  })
}

let queue = Promise.resolve()

addEventListener("message", ({ data }: MessageEvent<GrammarRequest>) => {
  queue = queue.then(async () => {
    try {
      postMessage({ id: data.id, lints: await lintTexts(await linterFor(data.dialect), data.texts) } satisfies GrammarAnswer)
    } catch (error) {
      postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) } satisfies GrammarAnswer)
    }
  })
})
