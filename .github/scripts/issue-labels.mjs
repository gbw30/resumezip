// Turns the answer to "How bad is it?" in a bug report
// (.github/ISSUE_TEMPLATE/bug.yml) into a severity label. Run by
// .github/workflows/issue-labels.yml; test it with
// `node --test .github/scripts/issue-labels.test.mjs`.

// The word before the colon in each answer.
const SEVERITY = {
  Critical: "severity: critical",
  Major: "severity: major",
  Minor: "severity: minor",
  Trivial: "severity: trivial",
}

/** The severity label for an issue form's body; none for other issues. */
export function labelsFor(body) {
  // A form's body is "### Question" followed by a blank line and the answer.
  const answer = (body ?? "").match(/^### How bad is it\?\r?\n\r?\n(.+)$/m)?.[1] ?? ""
  const severity = SEVERITY[answer.trim().split(":")[0]]
  return severity ? [severity] : []
}
