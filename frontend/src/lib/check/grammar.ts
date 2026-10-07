// Checks spelling and grammar with Harper, in a worker (grammar.worker.ts).
// It loads only once Check has been opened, and nothing leaves the browser:
// Harper is downloaded, not called. The worker is kept from one check to the
// next, as a new piece of text comes with every pause in typing, but one that
// fails is ended, so the next check starts afresh.

import { dialectOf } from "./dialect"
import type { GrammarLint } from "./engine"
import type { GrammarAnswer, GrammarRequest } from "./grammar.worker"

let worker: Worker | null = null
let next = 0
const waiting = new Map<number, { done: (lints: GrammarLint[][]) => void; fail: (error: Error) => void }>()

// Ends a worker that failed, and fails what's still waiting on it.
function end(failed: Worker, error: Error) {
  failed.terminate()
  if (worker === failed) worker = null
  for (const asked of waiting.values()) asked.fail(error)
  waiting.clear()
}

function workerNow(): Worker {
  if (worker) return worker
  const created = new Worker(new URL("./grammar.worker.ts", import.meta.url))
  created.onmessage = ({ data }: MessageEvent<GrammarAnswer>) => {
    if ("error" in data) return end(created, new Error(data.error))
    const asked = waiting.get(data.id)
    waiting.delete(data.id)
    asked?.done(data.lints)
  }
  // A worker that can't start or crashes is ended the same way.
  created.onerror = (event) => {
    event.preventDefault()
    end(created, new Error(event.message || "The grammar checker stopped"))
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
