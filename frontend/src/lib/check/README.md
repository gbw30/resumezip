# The resume checker

The editor's Check mode (issue #58) runs fixed rules over a resume and says
what to fix and where. It all happens in the browser: no AI, and nothing is
sent anywhere.

- `engine.ts` runs the rules and collects what they found:
  `runChecks(resume, { pdf })`.
- `rules.ts` lists every rule. Each group of rules (contact, dates, bullets…)
  lives in a file of its own.
- `resume.ts` reads the resume for the rules: each field as trimmed text, each
  bullet on its own (without the "• " or bold and italic marks), and the
  resume's type. Rules never read the saved data themselves. Only what's
  printed is in it: entries and bullets the person left out of the PDF
  (`src/lib/leftOut.ts`) aren't, so no rule flags them. An entry keeps its
  place in the editor as `index`, so places are built from that, and entries
  are looked up with `entryAt`, never by their place in the list.
- `readDate.ts` reads dates the way resumes write them ("Jan 2024",
  "01/2024", "2024", "Fall 2023", "Expected May 2027", "Present", and ranges
  in one field like "Jun – Aug 2025"), and compares them. Rules that need to
  know when something started or ended use it.
- `verbs.ts` reads the verb a bullet starts with: which verb, its tense, and
  other verbs to suggest. The verbs themselves are listed in `settings.ts`.
- `text.ts` has helpers for rules that read words: every bullet with its
  place, a text's first word, and the usual way among several of writing
  something.
- `places.ts` says where a finding is, so the editor can open it.
- `state.ts` keeps what the person told the checker: findings they dismissed
  and words they added.
- `settings.ts` holds the categories and their points, the levels, and limits.
  Word lists and thresholds go there too, so tuning is a change to one file.
- `labels.ts` says where a finding is in a few words ("Experience → Google ·
  bullet 2"), and whether there's enough of a resume to check yet.
- `components/editor/useResumeCheck.ts` checks the open resume as it changes.
  `CheckContext.tsx` shares that with the left bar's Check panel
  (`CheckPanel.tsx`) and the forms: choosing a finding opens its section and
  entry, puts the cursor in its field (or selects its bullet), and shows what's
  wrong and why under it until it's fixed.

## Writing a rule

```ts
const realEmail: Rule = {
  id: "C2",
  category: "contact",
  level: "fix",
  reads: "form",
  title: "Your email address",
  why: "Recruiters reply by email, so it has to work.",
  check: ({ resume }) => ({
    checked: 1,
    problems: EMAIL.test(resume.profile.email)
      ? []
      : [{ place: { kind: "profile", field: "email" }, message: "Not a whole email address" }],
  }),
}
```

- **Doesn't apply?** Return null, as a project rule does on a resume without
  projects. It counts neither for nor against the resume.
- **Partial credit.** `checked` is how many things the rule looked at (fields,
  entries, bullets). Its credit is the share of them without a problem, unless
  it gives `credit` itself, as "about half the bullets have a number" does.
- **Point at the exact place:** a profile field, a section's title, a whole
  section, an entry, one of its fields, one bullet (`line`), or the PDF's
  pages. A place that isn't on the resume is a bug: it's logged and left out.
- **Give `text`** when the problem is about part of the text at the place, or
  about something missing. A dismissal lasts until that text changes, so for a
  missing field the entry's own text (the default) is usually right.
- **Plain words.** A message is a few words; `why` is one line.
- **PDF rules** (`reads: "pdf"`) also get `pdf`, the latest preview as the
  resume reader in `lib/import` read it, and wait until it's been read.
- **A rule that breaks** is logged and left out, and the others carry on.

## Levels, dismissing and added words

A "fix" is clearly wrong; a "look" is a suggestion. Only suggestions can be
dismissed. A dismissal is tied to the rule, the field and the text it's
about, not to the line a bullet is on, so it survives bullets moving, and the
finding comes back once that text changes.

Dismissals and added words are saved with the resume in this browser, under
`check`, so they're kept as carefully as the rest of it. Two tabs changing
different parts at once keep both. Downloaded PDFs leave them out.
