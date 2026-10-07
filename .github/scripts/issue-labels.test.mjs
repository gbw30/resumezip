import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { labelsFor } from "./issue-labels.mjs"

// How GitHub writes a bug report's body, with the given answer.
const report = (severity) => `### What happened?

The download button spins forever.

### How can we make it happen again?

_No response_

### How bad is it?

${severity}

### Browser and device

Safari on an iPhone
`

// The form's own options, so a reworded option can't silently stop labelling.
const form = readFileSync(new URL("../ISSUE_TEMPLATE/bug.yml", import.meta.url), "utf8")
const severities = [...form.split("id: severity")[1].split("validations:")[0].matchAll(/^\s+- "?(.+?)"?$/gm)].map(
  (match) => match[1],
)

test("every severity option gets its priority label", () => {
  assert.deepEqual(
    severities.map((option) => labelsFor(report(option))),
    [["P0: critical"], ["P1: high"], ["P2: medium"], ["P3: low"]],
  )
})

test("issues not made with the form get no labels", () => {
  assert.deepEqual(labelsFor("The PDF looks wrong on my phone."), [])
  assert.deepEqual(labelsFor(null), [])
})

test("Windows line endings work too", () => {
  assert.deepEqual(labelsFor(report(severities[2]).replaceAll("\n", "\r\n")), ["P2: medium"])
})
