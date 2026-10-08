# The resume test set

Resumes made the way people really make them, for checking that a change to
the parser (`../parse.ts`) doesn't read any of them worse. `../corpus.test.ts`
opens each PDF the way "Open a file" does and compares what it finds with what
the resume says, field by field. It runs with `npm test`.

Everyone here is made up. Their email addresses are at example.com and their
phone numbers are in the 555-0100 to 555-0199 range set aside for fiction.
**Never add a real person's resume**, not even with permission: this
repository is public. To test a layout you saw on a real resume, write a
made-up person and print them in a copy of that layout.

## What's here

Each folder is one person:

- `resume.json` is what their resume says, in the editor's format. It's the
  answer the parser should find. `summary`, and `tech` on a job, are printed by
  some layouts but aren't fields in the editor, so they aren't checked.
- Each PDF is that resume in one layout, named after the layout.
- A layout can also be written by hand, as a Typst file beside its PDF, for a
  shape too particular to print from `resume.json`. Its `resume.json` is then
  what someone would type into the editor to print the same, and the top of
  the Typst file says how its sections map to the editor's.

| Layout | Made with | Like |
| --- | --- | --- |
| `latex-jake` | pdfTeX | Jake's resume template, the usual LaTeX one |
| `latex-jake-company-first` | pdfTeX | the same, with the company first and its tools beside it |
| `writer-classic` | LibreOffice | a word-processor resume in Times-like type, dates on a right tab |
| `writer-modern` | LibreOffice | Word's own resume styles: Calibri-like type, coloured headings |
| `html-modern` | Chromium | builders like FlowCV or Reactive Resume |
| `html-sidebar` | Chromium | two columns, as Canva or Novoresume make |
| `html-dates-left` | Chromium | dates in a column on the left, as in a European CV |
| `html-side-headings` | Chromium | section headings in a margin column |
| `html-harvard` | Chromium | Harvard's career office template |
| `typst-academic` | Typst, by hand | a three-page academic CV: dates on the left, paragraphs, sub-headings |

`maya`, `diego` and `marcus` copy the shapes of real resumes the parser got
wrong: a project with a hackathon's year in its name, a coursework line that
wraps, an "80/20" in a wrapped bullet, and an academic CV with headings it
doesn't know, page numbers and links behind icons.

## When the test fails

`KNOWN_GAPS` in `../corpus.test.ts` lists, for each file, the fields the parser
doesn't read right yet. The test fails when that list changes:

- **newlyWrong** names fields a change broke, with what the resume says and
  what was found instead. Fix the change.
- **nowRight** names fields a change fixed. Delete them from `KNOWN_GAPS`.

A change that fixes some fields and breaks others shows both, so you can
decide whether it's worth it.

Fields are compared entry by entry, in order. So when a change finds an
entry that was missing, every entry after it moves up one, and a field that
matched before only by chance, under the wrong entry, can show up as
newlyWrong. Check each one by what it says, not by its path, before deciding
a change made things worse.

## Adding a resume

1. Add a person: a folder with a `resume.json`, or use one that's here.
2. Add the layouts to print them in to `FILES` in `make.mts`. A new layout is a
   function there that prints a resume; keep it close to how the tool it
   imitates lays a resume out.
3. Make the PDFs, from `frontend/`:

   ```bash
   node src/lib/import/corpus/make.mts maya   # just that person's files
   ```

   This needs pdflatex with TeX Live's `latex-extra` packages, LibreOffice,
   Playwright's Chromium (or set `CHROMIUM` to a Chromium executable) and a
   Japanese font. Only make the files you changed, since making one again
   changes its bytes.
4. Look at each PDF, then run `npm test` and add what comes back as
   newlyWrong to `KNOWN_GAPS`, with a line saying why it reads wrong.
