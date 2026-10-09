import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

// The home page's clips (HeroVideo.tsx), as they're served. A browser can't
// play an MP4 until it has the file's index (its moov box), and a file
// exported from a video editor usually has it at the end.
const CLIPS = ["printer.mp4", "printer-portrait.mp4"]

interface Box {
  type: string
  body: Uint8Array
}

/** The boxes an MP4 file, or a box's body, is made of: each a 32-bit size and a 4-letter type, then its contents. */
function boxes(data: Uint8Array): Box[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const found: Box[] = []
  for (let at = 0; at < data.length;) {
    // 0 and 1 mean "to the end" and "a 64-bit size follows", which these files don't need.
    const size = view.getUint32(at)
    if (size < 8) throw new Error(`Box size ${size} isn't handled`)
    found.push({ type: String.fromCharCode(...data.subarray(at + 4, at + 8)), body: data.subarray(at + 8, at + size) })
    at += size
  }
  return found
}

const child = (box: Box, type: string) => boxes(box.body).find((inner) => inner.type === type)!
const clip = (name: string) => boxes(readFileSync(`public/video/${name}`))
const tracks = (name: string) => boxes(clip(name).find((box) => box.type === "moov")!.body).filter((box) => box.type === "trak")

/** A track's width and height, in pixels, from the 16.16 fixed-point numbers that end its header. */
function size(track: Box): { width: number; height: number } {
  const header = child(track, "tkhd").body
  const view = new DataView(header.buffer, header.byteOffset + header.length - 8, 8)
  return { width: view.getUint32(0) / 0x10000, height: view.getUint32(4) / 0x10000 }
}

test.each(CLIPS)("%s has its index before its frames, so it can start playing as it downloads", (name) => {
  const types = clip(name).map((box) => box.type)
  expect(types.indexOf("moov")).toBeGreaterThan(-1)
  expect(types.indexOf("moov")).toBeLessThan(types.indexOf("mdat"))
})

test.each(CLIPS)("%s is video alone, since it always plays muted", (name) => {
  // A track's handler says what's in it: "vide" for video, "soun" for sound.
  const handlers = tracks(name).map((track) => String.fromCharCode(...child(child(track, "mdia"), "hdlr").body.subarray(8, 12)))
  expect(handlers).toEqual(["vide"])
})

test("the portrait copy is 3:4 and as tall as the clip, as its source's media query relies on", () => {
  const full = size(tracks("printer.mp4")[0])
  const portrait = size(tracks("printer-portrait.mp4")[0])
  expect(portrait.height).toBe(full.height)
  expect(portrait.width / portrait.height).toBe(3 / 4)
})
