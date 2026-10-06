import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { labelsFor } from "./issue-labels.mjs"

// How GitHub writes a bug report's body, with the given answers.
const report = (severity, area) => `### What happened?

The download button spins forever.

### How can we make it happen again?

_No response_

### How bad is it?

${severity}

### Where?

${area}

### Browser and device

Safari on an iPhone
`

// The form's own options, so a reworded option can't silently stop labelling.
const form = readFileSync(new URL("../ISSUE_TEMPLATE/bug.yml", import.meta.url), "utf8")
const options = (id) => {
  const block = form.split(`id: ${id}`)[1].split("validations:")[0]
  return [...block.matchAll(/^\s+- "?(.+?)"?$/gm)].map((match) => match[1])
}

test("every severity option gets its label", () => {
  const labels = options("severity").map((option) => labelsFor(report(option, "Not sure"))[0])
  assert.deepEqual(labels, ["severity: critical", "severity: major", "severity: minor", "severity: trivial"])
})

test("every area option but Not sure gets its label", () => {
  const labels = options("area").map((option) => labelsFor(report(options("severity")[3], option))[1])
  assert.deepEqual(labels, ["area: editor", "area: pdf", "area: import", "area: storage", "area: site", undefined])
})

test("issues not made with the form get no labels", () => {
  assert.deepEqual(labelsFor("The PDF looks wrong on my phone."), [])
  assert.deepEqual(labelsFor(null), [])
})

test("Windows line endings work too", () => {
  assert.deepEqual(labelsFor(report("Minor: whatever", "Editing a resume").replaceAll("\n", "\r\n")), [
    "severity: minor",
    "area: editor",
  ])
})
