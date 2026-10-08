# CLAUDE.md

resumezip is a resume builder that runs entirely in the browser: Next.js 15
and React 19 in `frontend/`, with no server of its own. Resumes live in
localStorage, PDFs are compiled by Typst (WebAssembly) in a Web Worker, and
nothing a person types is uploaded. `frontend/README.md` maps the code;
`CONTRIBUTING.md` has the ground rules. Read both before a large change.
Paths below starting with `src/` or `e2e/` are under `frontend/`.

## Before you commit

Run these in `frontend/`. CI runs the same, and `main` requires them:

```bash
npx tsc --noEmit
npm run lint
npx prettier --check .   # npm run format fixes it
npm test
```

For anything a visitor can see or that touches storage, also run
`npm run build && npm run test:browser` (Chromium and WebKit, port 3100).

## Rules that aren't negotiable

From CONTRIBUTING.md, in short:

- Nothing someone writes leaves the browser. No analytics, no new network
  calls beyond the PDF engine's CDN and lookups the person asks for (DOIs).
- Saved resumes keep working. Old localStorage data and old PDFs must still
  open. Change the storage format only with a migration and a test.
- Templates stay readable by hiring software: no icons or graphics, links
  printed as text.
- New packages are discussed in an issue first: visitors download what the
  app uses.

## Types

- The resume's types come from `src/components/editor/sections.ts`, the
  form's section and field definitions. It exports the key types
  (`FieldKey`, `FieldKeyOf<Section>`, `ProfileKey`, ...), and
  `src/lib/resume.ts` derives `Resume` and `Entry` from them. To add a
  field, add it to `sections.ts`; everything else follows or fails to
  compile.
- Lists of field names elsewhere (the checker's `DATE_FIELDS`, `KEY_FIELDS`,
  the importer's `EXPERIENCE_FIELDS`, ...) are typed per section. Keep them
  that way.
- No `any` (lint enforces it outside `e2e/`). Saved data and files are
  untrusted: validate them where they're read (`resumeStorage.ts`,
  `resumeFile.ts`), and read values defensively in code that prints or checks
  a resume. Inside the app, trust the types instead of re-checking them.
- In tests, data in a shape the editor wouldn't save goes through
  `asSaved()` (`src/lib/testResume.ts`), so the intent is explicit.

## Comments

The "short and plain words" rule in CONTRIBUTING.md is for text on the
site. Code comments are for developers and use normal technical terms:
debounce, quarantine, merge, live region, worker pool, focus trap.

- Comment why, not what: a constraint, a browser quirk, a reason something
  isn't done the obvious way. Don't restate a name or the line below it.
- Not every constant or field needs a doc comment. Add one when the name
  can't carry the meaning (units, edge cases, where a value comes from).
- Keep comments true when you change the code; a wrong comment is a bug.

## Code

- Prettier formats everything (140 columns, no semicolons). Hand-laid-out
  word lists and tables use `// prettier-ignore`; `src/lib/check/settings.ts`
  is ignored as a whole.
- Look for an existing helper before writing one, as in
  `src/lib/check/text.ts`, `src/lib/check/places.ts` and
  `src/components/editor/layout.ts`.
- React: the React that Next 15.5 bundles for the app router doesn't export
  `useEffectEvent`. For a callback an effect shouldn't re-run on, read the
  latest one from a ref, as `Modal.tsx` and `CheckContext.tsx` do.
- Checker rules have their own guide: `src/lib/check/README.md`.

## Tests

- A fix comes with a test that fails without it.
- Browser tests use roles and labels, not CSS selectors. Wait on something
  visible, not a timer; a fixed wait is only for proving nothing happens.

## Commits and pull requests

- Commit subjects are lower case and say what changes, for the person
  using the site or the code: "keep focus in an open dialog when another
  tab saves". The body says why, and which test fails without it.
- One change per pull request, following `.github/pull_request_template.md`.
