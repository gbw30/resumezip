import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import {
  COMPILER_FILE,
  COMPILER_INTEGRITY,
  COMPILER_PACKAGE,
  COMPILER_SIZE,
  COMPILER_VERSION,
  compileChecked,
  downloadChecked,
} from "./compilerSource"

// After updating the compiler package, update COMPILER_VERSION, COMPILER_INTEGRITY and COMPILER_SIZE to match.
test("the compiler loaded from jsDelivr is the installed one", () => {
  const dir = path.resolve("node_modules", COMPILER_PACKAGE)
  expect(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version).toBe(COMPILER_VERSION)
  const file = readFileSync(path.join(dir, COMPILER_FILE))
  expect(COMPILER_INTEGRITY).toBe(integrityOf(file))
  expect(COMPILER_SIZE).toBe(file.length)
})

const integrityOf = (data: string | Buffer) => `sha256-${createHash("sha256").update(data).digest("base64")}`

// An empty WebAssembly module, padded with `size` bytes in a custom section
// named "x". Its first 8 bytes are an empty module on their own.
function paddedModule(size: number): Buffer {
  // The section's size, counting its name, in LEB128: 7 bits a byte, lowest first.
  const sectionSize: number[] = []
  let left = size + 2
  for (; left > 0x7f; left >>>= 7) sectionSize.push((left & 0x7f) | 0x80)
  sectionSize.push(left)
  return Buffer.concat([Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, ...sectionSize, 1, 0x78]), Buffer.alloc(size)])
}

describe("downloading the compiler", () => {
  const wasm = paddedModule(100)
  const integrity = integrityOf(wasm)
  const IDLE_MS = 250
  const quarters = [0, 1, 2, 3].map((i) => wasm.subarray((i * wasm.length) / 4, ((i + 1) * wasm.length) / 4))
  // A file the size of a large module, for seeing how much of it is kept.
  const big = paddedModule(16 * 1024 * 1024)
  const HALF = 8 * 1024 * 1024
  let sendRest = () => {}

  // /whole sends the file, /silent never answers, /stops sends a quarter and
  // stops, /cut ends after the first 8 bytes, and /slow sends a quarter every
  // 0.1 s: 0.4 s in all, longer than the wait, but never a gap that long.
  // /half sends half of `big` and the rest on `sendRest`.
  const server = createServer((req, res) => {
    if (req.url === "/silent") return
    res.writeHead(200, { "Content-Type": "application/wasm" })
    if (req.url === "/whole") res.end(wasm)
    else if (req.url === "/stops") res.write(quarters[0])
    else if (req.url === "/cut") res.end(wasm.subarray(0, 8))
    else if (req.url === "/half") {
      res.write(big.subarray(0, HALF))
      sendRest = () => res.end(big.subarray(HALF))
    } else quarters.forEach((piece, i) => setTimeout(() => (i === 3 ? res.end(piece) : res.write(piece)), (i + 1) * 100))
  })
  let base = ""
  beforeAll(
    () =>
      new Promise<void>((done) =>
        server.listen(0, "127.0.0.1", () => {
          base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
          done()
        }),
      ),
  )
  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  test("compiles the file when it matches", async () => {
    expect(await compileChecked(`${base}/whole`, integrity, IDLE_MS)).toBeInstanceOf(WebAssembly.Module)
  })

  test("refuses a file that doesn't match", async () => {
    const other = integrityOf("something else")
    await expect(compileChecked(`${base}/whole`, other, IDLE_MS)).rejects.toThrow("isn't the expected file")
  })

  test("refuses a file that's cut short, even one that compiles", async () => {
    await expect(compileChecked(`${base}/cut`, integrity, IDLE_MS)).rejects.toThrow("isn't the expected file")
    await expect(downloadChecked(`${base}/cut`, integrity, IDLE_MS)).rejects.toThrow("isn't the expected file")
  })

  test("gives up when the server never answers", async () => {
    await expect(compileChecked(`${base}/silent`, integrity, IDLE_MS)).rejects.toThrow("Nothing arrived")
  })

  test("gives up when the download stops partway", async () => {
    await expect(compileChecked(`${base}/stops`, integrity, IDLE_MS)).rejects.toThrow("Nothing arrived")
  })

  test("downloads a whole file the same way, for the grammar checker", async () => {
    expect(Buffer.from(await downloadChecked(`${base}/slow`, integrity, IDLE_MS)).equals(wasm)).toBe(true)
    const other = integrityOf("something else")
    await expect(downloadChecked(`${base}/whole`, other, IDLE_MS)).rejects.toThrow("isn't the expected file")
    await expect(downloadChecked(`${base}/stops`, integrity, IDLE_MS)).rejects.toThrow("Nothing arrived")
    await expect(downloadChecked(`${base}/silent`, integrity, IDLE_MS)).rejects.toThrow("Nothing arrived")
  })

  test("waits for a slow download that keeps sending, saying how much has arrived", async () => {
    const arrived: number[] = []
    expect(await compileChecked(`${base}/slow`, integrity, IDLE_MS, (bytes) => arrived.push(bytes))).toBeInstanceOf(WebAssembly.Module)
    expect(arrived.length).toBeGreaterThan(1)
    expect(arrived.reduce((sum, bytes) => sum + bytes, 0)).toBe(wasm.length)

    // downloadChecked too, for the compiler downloaded ahead.
    arrived.length = 0
    expect(Buffer.from(await downloadChecked(`${base}/slow`, integrity, IDLE_MS, (bytes) => arrived.push(bytes))).equals(wasm)).toBe(true)
    expect(arrived.length).toBeGreaterThan(1)
    expect(arrived.reduce((sum, bytes) => sum + bytes, 0)).toBe(wasm.length)
  })

  test("keeps none of the file while it downloads, hashing each piece as it arrives", async () => {
    // Node only gives scripts a way to collect garbage with this flag, in a context made after it's set.
    setFlagsFromString("--expose-gc")
    const gc = runInNewContext("gc") as () => void
    // ArrayBuffers in use once garbage is collected: the downloaded pieces, and the server's `big`.
    const held = () => {
      gc()
      return process.memoryUsage().arrayBuffers
    }
    const before = held()
    let arrived = 0
    const compiled = compileChecked(`${base}/half`, integrityOf(big), 10_000, (bytes) => (arrived += bytes))
    try {
      await vi.waitFor(() => expect(arrived).toBe(HALF), { timeout: 10_000 })
      // Half the file has arrived. Holding on to it would be 8 MB.
      await vi.waitFor(() => expect(held() - before).toBeLessThan(HALF / 4))
    } finally {
      // Let the download finish either way, so it isn't cut off when the server closes.
      sendRest()
      await compiled.catch(() => {})
    }
    expect(await compiled).toBeInstanceOf(WebAssembly.Module)
  })
})
