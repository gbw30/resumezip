// Turns the answer to "How bad is it?" in a bug report
// (.github/ISSUE_TEMPLATE/bug.yml) into a priority label. Run by
// .github/workflows/issue-labels.yml; test it with
// `node --test .github/scripts/issue-labels.test.mjs`.

// The word before the colon in each answer, and the priority it starts at.
// A maintainer can move an issue to another priority after reading it.
const PRIORITY = {
  Critical: "P0: critical",
  Major: "P1: high",
  Minor: "P2: medium",
  Trivial: "P3: low",
}

/** The priority label for an issue form's body; none for other issues. */
export function labelsFor(body) {
  // A form's body is "### Question" followed by a blank line and the answer.
  const answer = (body ?? "").match(/^### How bad is it\?\r?\n\r?\n(.+)$/m)?.[1] ?? ""
  const priority = PRIORITY[answer.trim().split(":")[0]]
  return priority ? [priority] : []
}
