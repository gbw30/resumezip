# Opening resume files

The dashboard's "Open a file" button (or dropping a file on the page) opens a
PDF or Word file. It all happens in the browser; nothing is uploaded.

- `open.ts` is what the UI calls. pdf.js and mammoth only download when a PDF
  or Word file is opened.
- **resumezip PDFs** carry their resume as an attached file, `resumezip.json`
  (see `src/lib/resumeFile.ts`). Opening one restores the resume exactly, with
  nothing cut off. One too big to open (over `MAX_ENTRIES` entries or
  `MAX_LENGTH` characters, far more than any resume has) isn't opened at all, and
  the dialog says why. The attachment holds what's printed plus the template and
  section order, never the resume's name or tag, or the entries and bullets left
  out of the PDF (`src/lib/leftOut.ts`), since anyone who gets the PDF can read it.
  Attachments with flexible sections use version 2; files with only the original
  sections keep version 1. Recognized damaged data or a newer version stops
  opening with a useful message instead of silently guessing from its PDF text.
- **Any other file** is read by `lines.ts` into lines of text with their position,
  size, style and links, then sorted into the editor's fields by `parse.ts`. The
  review dialog (`components/dashboard/ImportReview.tsx`) shows the result next to
  the file before anything is saved.

## Off the main thread

pdf.js reads PDFs in a worker of its own; the page only collects each page's
text (`readPdf`). Everything else happens in an import worker (`import.worker.ts`,
which runs `read.ts`): sorting a PDF's text into lines, converting a Word file
with mammoth, and parsing. Each file gets a worker of its own, which is ended as
soon as it answers, so a big or odd file can't freeze the page. The checker's
readings of the preview (`lib/check/preview.ts`) keep one between readings
instead, as a new preview comes with every pause in typing.

Cancel stops reading straight away: it closes the PDF, which ends pdf.js's worker,
and ends the import worker. A PDF that's shown in the review stays open until the
review closes.

## Limits

Reading stops, with a message saying why, at any of these (`limits.ts`). Each is
far beyond a real resume, which is a page or two and under 10,000 characters.

| What | Limit | Checked |
| --- | --- | --- |
| File size | 20 MB | before reading it |
| PDF pages | 20 | as soon as the PDF opens, before any page is read |
| Text | 200,000 characters or 5,000 lines | as a PDF's text arrives, even partway through a page; a Word file's once converted |
| A Word file's XML, unzipped | 10 MB | before converting it, since a small file can unzip to a lot |
| Time | 1 minute | from start to finish, downloads included |

pdf.js leaves out text that runs off the page, so only tiny print can fit enough
on 20 pages to reach the text limit. Pictures in Word files aren't read at all,
and one whose zip keeps its sizes elsewhere (ZIP64, for files over 4 GB) counts
as too much text.

## How parse.ts reads a resume

1. Headings: known names ("Work Experience", "Honors & Awards") first, then lines
   styled the same way.
2. Contact details anywhere near the top, from text and from links.
3. Each section is split into entries: title lines (role, organization, dates,
   place) followed by bullets. Bullets may be glyphs, or only indentation; a line
   that ran to the right edge wraps onto the next.
4. Leftovers go in "Couldn't place", so nothing is silently dropped.

Heading occurrences have deterministic review IDs and source-line provenance.
Repeated headings stay independent, even when their visible words are identical.
Clear prose summaries and dedicated Certifications headings are offered as the
new optional sections. Only explicit credential labels assign issuer, dates,
credential IDs or links; uncertain fragments remain available for review. Mixed
headings such as "Awards & Certifications" remain uncertain as a whole.

The review can combine selected Summary groups into paragraphs, and selected
credential groups into one Certifications section, in source order. It shows
that consolidation and uses the first selected heading and position. Unsupported
groups can be kept as text sections or bullet lists, with neither choice selected
initially. Durable section and credential UUIDs are created only when the person
confirms the import. Copy and download preserve uncertain text and the original
text of groups or entries excluded during review.

The PDF checker calls `parseResume` with `{ purpose: "check" }` after accounting
for confidently matched flexible-section ranges. This preserves the original
built-in Awards interpretation of headings such as "Awards & Certifications";
ordinary imports continue to leave these mixed groups for review.

It handles single and two-column layouts, headings in a margin column, dates in a
column of their own, and Word files with or without heading styles and tables.
Scanned PDFs have no text and can't be read.

## Testing changes

The parser was checked field by field against resumes rendered from known data:
every resumezip template, browser-printed PDFs in several common styles, and Word
files. Layouts it hadn't seen scored lower than ones it was tuned on, so test a
change against a few real resumes before relying on it.
