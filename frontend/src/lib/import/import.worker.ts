// Reads a file off the main thread (see read.ts), so a big or odd file can't
// freeze the page and Cancel can end the work outright. open.ts starts one of
// these for each file and ends it once there's an answer; the checker keeps
// one for its readings of the preview. Each message is read on its own.

import { readFile, type ReadRequest } from "./read"

addEventListener("message", async ({ data }: MessageEvent<ReadRequest>) => {
  postMessage(await readFile(data))
})
