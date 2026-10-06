// Turns the answers in a bug report (.github/ISSUE_TEMPLATE/bug.yml) into
// labels. Run by .github/workflows/issue-labels.yml; test it with
// `node --test .github/scripts/issue-labels.test.mjs`.

// The word before the colon in each "How bad is it?" answer.
const SEVERITY = {
  Critical: "severity: critical",
  Major: "severity: major",
  Minor: "severity: minor",
  Trivial: "severity: trivial",
}

// Each "Where?" answer. "Not sure" gets no area label.
const AREA = {
  "Editing a resume": "area: editor",
  "The PDF (preview, templates or download)": "area: pdf",
  "Opening a PDF or Word file": "area: import",
  "Saved resumes or the dashboard": "area: storage",
  "Another page (home, templates, about, contact)": "area: site",
}

/** The severity and area labels for an issue form's body; none for other issues. */
export function labelsFor(body) {
  // A form's body is "### Question" followed by a blank line and the answer.
  const answers = {}
  for (const [, question, answer] of (body ?? "").matchAll(/^### (.+)\r?\n\r?\n(.+)$/gm)) {
    answers[question.trim()] = answer.trim()
  }
  const severity = SEVERITY[(answers["How bad is it?"] ?? "").split(":")[0]]
  const area = AREA[answers["Where?"] ?? ""]
  return [severity, area].filter(Boolean)
}
