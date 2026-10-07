// The Typst compiler is a 28 MB WebAssembly file, the biggest thing the editor
// downloads. It's loaded from jsDelivr, which serves npm packages from a global
// CDN, compressed and cached for a year, and checked against its hash so a
// changed file is refused. typst.worker.ts falls back to the copy bundled with
// the app if jsDelivr can't be reached. The grammar checker's WebAssembly is
// downloaded the same way (downloadChecked).

export const COMPILER_PACKAGE = "@myriaddreamin/typst-ts-web-compiler"
export const COMPILER_VERSION = "0.7.0"
export const COMPILER_FILE = "pkg/typst_ts_web_compiler_bg.wasm"
export const COMPILER_CDN_URL = `https://cdn.jsdelivr.net/npm/${COMPILER_PACKAGE}@${COMPILER_VERSION}/${COMPILER_FILE}`

/** The file's SHA-384, for subresource integrity. compilerSource.test.ts checks it against the installed package. */
export const COMPILER_INTEGRITY = "sha384-YB32Rpk4pOvEGytOZweRBgdbuwNueLVpzJUQojjit/A8AveMWxDW8eT9ROz98jDo"

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
    const hashed = sha384(copy, (bytes) => {
      stall.reset()
      onData?.(bytes)
    }).finally(stall.stop)
    const [module, { hash }] = await Promise.all([WebAssembly.compileStreaming(response), hashed])
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
 * else compiles, as the grammar checker's.
 */
export async function downloadChecked(url: string, integrity: string, idleMs: number): Promise<Uint8Array<ArrayBuffer>> {
  const stall = stallTimer(url, idleMs)
  try {
    const response = await fetch(url, { credentials: "omit", signal: stall.signal })
    if (!response.ok || !response.body) throw new Error(`${url} answered ${response.status}`)
    const { hash, bytes } = await sha384(response.body, stall.reset)
    if (hash !== integrity) throw new Error(`${url} isn't the expected file`)
    return bytes
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

/** A stream's bytes and their SHA-384 in subresource-integrity form, calling `onData` with the number of bytes each time some arrives. */
async function sha384(stream: ReadableStream<Uint8Array>, onData: (bytes: number) => void): Promise<{ hash: string; bytes: Uint8Array<ArrayBuffer> }> {
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = stream.getReader()
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    chunks.push(read.value)
    size += read.value.length
    onData(read.value.length)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-384", bytes))
  return { hash: `sha384-${btoa(String.fromCharCode(...digest))}`, bytes }
}
