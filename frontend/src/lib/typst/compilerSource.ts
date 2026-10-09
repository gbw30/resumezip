// The Typst compiler is a 28 MB WebAssembly file, the biggest thing the editor
// downloads. It's loaded from jsDelivr, which serves npm packages from a global
// CDN, compressed and cached for a year, and checked against its hash so a
// changed file is refused. typst.worker.ts falls back to the copy bundled with
// the app if jsDelivr can't be reached. The grammar checker's WebAssembly is
// downloaded the same way (downloadChecked).

import { sha256 } from "@noble/hashes/sha2.js"

export const COMPILER_PACKAGE = "@myriaddreamin/typst-ts-web-compiler"
export const COMPILER_VERSION = "0.7.0"
export const COMPILER_FILE = "pkg/typst_ts_web_compiler_bg.wasm"
export const COMPILER_CDN_URL = `https://cdn.jsdelivr.net/npm/${COMPILER_PACKAGE}@${COMPILER_VERSION}/${COMPILER_FILE}`

/** The file's SHA-256, in subresource-integrity form. compilerSource.test.ts checks it against the installed package. */
export const COMPILER_INTEGRITY = "sha256-H8loQ4pnI2bf7DnJbIQsJu0pyv9OsbyqsZpsYIZ95f0="

/** The file's size in bytes, uncompressed, for saying how much of it has arrived. Checked like COMPILER_INTEGRITY. */
export const COMPILER_SIZE = 28_325_178

/**
 * Downloads a WebAssembly file and compiles it as it arrives. Fails if the
 * file doesn't match `integrity`, or if nothing arrives for `idleMs`, so a
 * stalled connection gives up while a slow one that keeps sending finishes.
 * `onData` is called with the number of bytes each time some arrives. (fetch's own `integrity` option only answers once the whole file is in, so
 * it can't tell the two apart.)
 */
export async function compileChecked(
  url: string,
  integrity: string,
  idleMs: number,
  onData?: (bytes: number) => void,
): Promise<WebAssembly.Module> {
  const stall = stallTimer(url, idleMs)
  try {
    const response = await fetch(url, { credentials: "omit", signal: stall.signal })
    if (!response.ok || !response.body) throw new Error(`${url} answered ${response.status}`)
    // One copy is compiled; the other is hashed, and watched for stalls until
    // it's all in. Compiling the rest can take a while on a slow computer.
    const copy = response.clone().body!
    const hashed = integrityOf(copy, (chunk) => {
      stall.reset()
      onData?.(chunk.length)
    }).finally(stall.stop)
    const [module, hash] = await Promise.all([WebAssembly.compileStreaming(response), hashed])
    if (hash !== integrity) throw new Error(`${url} isn't the expected file`)
    return module
  } catch (error) {
    // Stop whichever half is still downloading.
    stall.abort(error)
    throw error
  } finally {
    stall.stop()
  }
}

/**
 * Downloads a file whole, as compileChecked does: it fails if the file
 * doesn't match `integrity`, or if nothing arrives for `idleMs`, so a slow
 * connection that keeps sending finishes. For WebAssembly that something
 * else compiles, as the grammar checker's, or that's compiled later.
 * `onData` is called with the number of bytes each time some arrives.
 */
export async function downloadChecked(
  url: string,
  integrity: string,
  idleMs: number,
  onData?: (bytes: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const stall = stallTimer(url, idleMs)
  try {
    const response = await fetch(url, { credentials: "omit", signal: stall.signal })
    if (!response.ok || !response.body) throw new Error(`${url} answered ${response.status}`)
    const chunks: Uint8Array[] = []
    const hash = await integrityOf(response.body, (chunk) => {
      stall.reset()
      chunks.push(chunk)
      onData?.(chunk.length)
    })
    if (hash !== integrity) throw new Error(`${url} isn't the expected file`)
    return joined(chunks)
  } catch (error) {
    // Stop the download if it's still going.
    stall.abort(error)
    throw error
  } finally {
    stall.stop()
  }
}

// An abort signal for a download that fires once nothing has arrived for
// `idleMs`: `reset` when something does, and `stop` when it's done.
function stallTimer(url: string, idleMs: number) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const reset = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(new Error(`Nothing arrived from ${url} for ${idleMs} ms`)), idleMs)
  }
  reset()
  return { signal: controller.signal, reset, stop: () => clearTimeout(timer), abort: (reason: unknown) => controller.abort(reason) }
}

/**
 * A stream's SHA-256 in subresource-integrity form, hashed a chunk at a time
 * as it arrives, calling `onData` with each chunk. SubtleCrypto can only hash
 * a whole buffer, which would mean keeping the whole file to hash it, and it
 * copies its input as well: two extra copies of the 28 MB compiler. SHA-256
 * rather than SHA-384, as in JavaScript it's about twice as fast, so on a slow
 * phone it's less likely to fall behind the download, which would hold up the
 * compiler and leave the chunks it hasn't reached waiting in memory.
 */
async function integrityOf(stream: ReadableStream<Uint8Array>, onData: (chunk: Uint8Array) => void): Promise<string> {
  const hash = sha256.create()
  const reader = stream.getReader()
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    onData(read.value)
    hash.update(read.value)
  }
  return `sha256-${btoa(String.fromCharCode(...hash.digest()))}`
}

function joined(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}
