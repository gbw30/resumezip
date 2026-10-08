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
- `ResumeView.order` remains builtin-only for rules about jobs, dates and
  skills. `allOrder`, `extras` and `textsOf` also cover optional summary,
  custom text/list sections and credentials. Prose is literal; custom list
  bullets use the existing formatting and preserve original line offsets.
  Extra places use stable section keys and credential UUIDs, so reordering them
  preserves targets and dismissals. Grammar skips credential names, issuers,
  codes, links and dates; custom lists do not receive job-specific advice.
- `extraPdf.ts` matches actual extracted section occurrences in the import
  worker, including repeated headings, before builtin semantic checks run.
  Only complete matching ranges are removed; original PDF line addresses
  survive the filtered parse. R3 reports missing text as a readability failure
  and ambiguous matches as partial coverage. It does not assume arbitrary
  headings are ATS-known or invent builtin field failures from uncertain extras.
  Custom lists share physical bullet layout checks. Preview cache keys also
  include editor source addresses, since inserting omitted lines can move a
  target without changing the PDF bytes.
- `readDate.ts` reads dates the way resumes write them ("Jan 2024",
  "01/2024", "2024", "Fall 2023", "Expected May 2027", "Present", and ranges
  in one field like "Jun – Aug 2025"), and compares them. Rules that need to
  know when something started or ended use it.
- `verbs.ts` reads the verb a bullet starts with: which verb, its tense, and
  other verbs to suggest. The verbs themselves are listed in `settings.ts`.
- `text.ts` has helpers for rules that read words: every bullet with its
  place, a text's first word, and the usual way among several of writing
  something.
- `pdf.ts` has helpers for the rules that read the preview PDF: text compared
  without what printing changes, and the lines each typed bullet is printed on.
- `preview.ts` reads the preview PDF the way hiring software would, with the
  resume reader in `lib/import`. The editor reads each new preview once Check
  has been opened, while the page is idle, and the PDF rules only use a
  reading while it matches what the resume prints. It keeps pdf.js's worker
  and the import worker from one reading to the next, and remembers the last
  few readings, so a preview it has read before, as after an undo, isn't read
  again.
- `grammar.ts` checks spelling and grammar with [Harper](https://github.com/Automattic/harper),
  an open-source grammar checker that runs in the browser, in a worker
  (`grammar.worker.ts`). It loads once Check has been opened: about 6.7 MB,
  from jsDelivr, checked against its hash, or the app's own copy if that
  fails, as the PDF engine does; a download that stalls is given up. Nothing
  typed is sent anywhere. Each piece of text is checked once, while the page
  is idle, and what was found is remembered by the text, so typing only sends
  the field that changed. A worker that fails is ended, and the next check
  starts a new one. `harper.ts` runs Harper and turns off its rules that are
  wrong for resumes. Harper reads the text in the browser's English
  (`dialect.ts`), but a word counts as spelled right if any English Harper
  knows spells it that way (American, British, Australian, Canadian or
  Indian), since a resume is written for where the job is: "colour",
  "color" and "lakh" all pass. Each kind of English costs a few megabytes.
- `spelling.ts` has the spelling and grammar rules (G1–G7). Harper finds
  typos; the rules decide which count. The resume's own names, companies,
  schools, places and skills, the words added with "Add word", and the tech
  words, degrees and verbs in `settings.ts` are spelled right, and so are
  names with capitals inside ("DuckDB"), words with digits, and initials,
  unless they're one slip from a tech name ("TypeScirpt"). The skills are
  mostly names Harper doesn't know ("Redux", "Kanban"), so there G1 counts
  only a slip in typing a word Harper offers ("Comunication") or a tech name,
  and the grammar rules leave them alone.
- `score.ts` works out the resume score (issue #67), out of 100: how well the
  resume follows these checks, not whether it gets anyone hired. Each
  category's points (`settings.ts`) are shared among its rules that apply, a
  must-fix counting twice as much as a suggestion, and each rule earns its
  share times its credit, so a problem in part of the resume costs only that
  part, and dismissed suggestions count as passing. Rules that don't apply are
  left out, and a category none of whose rules apply gives its points to the
  others. Points are rounded down, so 100 means everything passed.
- `places.ts` says where a finding is, so the editor can open it.
- `state.ts` keeps what the person told the checker: findings they dismissed
  and words they added.
- `settings.ts` holds the categories and their points, the levels, and limits.
  Word lists and thresholds go there too, so tuning is a change to one file.
- `labels.ts` says where a finding is in a few words ("Experience → Google ·
  bullet 2"), and whether there's enough of a resume to check yet.
- `components/editor/useResumeCheck.ts` checks the open resume as it changes.
  `CheckContext.tsx` shares that, and whether the left bar is on Write or
  Check, with the Check panel (`CheckPanel.tsx`) and the forms. The panel
  shows the score, then each
  category with its points, what it found (fixes first) and what passed;
  categories with findings are open until folded. While the PDF or the text
  is being checked again after a change, a category keeps its points and says
  so instead of a count, so the score doesn't jump. Choosing a finding opens
  its section and entry, puts the cursor in its field (or selects its bullet),
  and shows what's wrong and why under it until it's fixed. That's only while
  Check is open: in Write mode the forms show none of it.

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
- **Grammar rules** (`reads: "grammar"`) also get `grammar`, what Harper found
  in each piece of text, by the text, and wait until Harper has loaded. A text
  that isn't in it yet hasn't been checked, and is skipped until it has; the
  rule says so with `partial`, so its dismissals are kept, and it isn't listed
  as passed, until it has looked at everything.
- **A rule that breaks** is logged and left out, and the others carry on.

## Levels, dismissing and added words

A "fix" is clearly wrong; a "look" is a suggestion. Only suggestions can be
dismissed. A dismissal is tied to the rule, the field and the text it's
about, not to the line a bullet is on, so it survives bullets moving, and the
finding comes back once that text changes.

Dismissals and added words are saved with the resume in this browser, under
`check`, so they're kept as carefully as the rest of it. Two tabs changing
different parts at once keep both. Downloaded PDFs leave them out.
