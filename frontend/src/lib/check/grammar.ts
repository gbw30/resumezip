// Checks spelling and grammar with Harper, in a worker (grammar.worker.ts).
// It loads only once Check has been opened, and nothing leaves the browser:
// Harper is downloaded, not called. The worker is kept from one check to the
// next, as a new piece of text comes with every pause in typing.

import { dialectOf } from "./dialect"
import type { GrammarLint } from "./engine"
import type { GrammarAnswer, GrammarRequest } from "./grammar.worker"

let worker: Worker | null = null
let next = 0
const waiting = new Map<number, { done: (lints: GrammarLint[][]) => void; fail: (error: Error) => void }>()

function workerNow(): Worker {
  if (worker) return worker
  const created = new Worker(new URL("./grammar.worker.ts", import.meta.url))
  created.onmessage = ({ data }: MessageEvent<GrammarAnswer>) => {
    const asked = waiting.get(data.id)
    waiting.delete(data.id)
    if (!asked) return
    if ("error" in data) asked.fail(new Error(data.error))
    else asked.done(data.lints)
  }
  // A worker that can't start or crashes fails what's waiting, and the next check starts a new one.
  created.onerror = (event) => {
    event.preventDefault()
    created.terminate()
    if (worker === created) worker = null
    for (const asked of waiting.values()) asked.fail(new Error(event.message || "The grammar checker stopped"))
    waiting.clear()
  }
  worker = created
  return created
}

/**
 * What Harper finds in each text, in the same order, in the English the
 * browser reads. The first call loads Harper, which takes a few seconds.
 */
export function checkGrammar(texts: string[], dialect = dialectOf(navigator.languages)): Promise<GrammarLint[][]> {
  if (texts.length === 0) return Promise.resolve([])
  const id = next++
  return new Promise((done, fail) => {
    waiting.set(id, { done, fail })
    workerNow().postMessage({ id, dialect, texts } satisfies GrammarRequest)
  })
}
