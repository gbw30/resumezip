"use client"

import type React from "react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { ChevronDown, CircleAlert, Info, LoaderCircle, Lock } from "lucide-react"
import { useResumeContext } from "@/context/ResumeContext"
import type { Finding, Report, Rule } from "@/lib/check/engine"
import { describePlace, hasEnoughToCheck } from "@/lib/check/labels"
import type { ResumeView } from "@/lib/check/resume"
import {
  bandOf,
  checkingCategories,
  keepScores,
  scoreOf,
  shownScore,
  wholePoints,
  type CategoryScore,
  type KeptScores,
} from "@/lib/check/score"
import { CATEGORIES, MUST_FIX_MAX, type CategoryId } from "@/lib/check/settings"
import { hasLeftOut } from "@/lib/leftOut"
import { useCheck } from "./CheckContext"

// A typo can't be dismissed, but its word can be added so it isn't flagged
// again (rule G1, issue #66).
const TYPO_RULE = "G1"

const FIX_COLOR = "text-[#b42318]"

// The score ring's circle, in the SVG's 36-unit box.
const RING_RADIUS = 15.5
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

const quiet = "text-[13px] text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline"

type Category = (typeof CATEGORIES)[number]

/**
 * What the checker found on the resume, in the left bar's Check mode: the
 * resume score, then each category with something to fix or review, its
 * points and what it found. What passed isn't listed. Choosing a finding
 * opens its field in the form.
 */
export default function CheckPanel() {
  const { report, restore, pdf, grammar } = useCheck()
  const { formData } = useResumeContext()
  // The resume as last checked, so places are named as the findings saw them.
  const view = report.view

  const checking = checkingCategories(
    report.results.map((result) => result.rule),
    { readingPdf: pdf === "reading", checkingText: grammar === "checking" },
  )
  const score = useShownScore(report, checking)
  const shown = useShownCategories(report.findings, checking)

  if (!hasEnoughToCheck(view)) {
    return (
      <div className="flex flex-col gap-4 px-3 py-4 xl:p-0">
        <ScoreHeader total={null} />
        <p className="px-2 text-sm leading-relaxed text-ink-2">
          {/* The checker reads only what's printed, so entries that are all left out don't count. */}
          {view.profile.fullName && hasLeftOut(formData)
            ? "Include an entry in the PDF to check this resume."
            : "Add your name and one entry to check this resume."}
        </p>
      </div>
    )
  }

  const waitingFor = (reads: "pdf" | "grammar") =>
    report.results.some((result) => result.status === "waiting" && result.rule.reads === reads)
  // Grammar rules check text as it's typed, so they're behind until it's all been checked.
  const checkingGrammar = waitingFor("grammar") || grammar !== "ready"
  return (
    <div className="flex flex-col gap-5 px-3 py-4 xl:p-0">
      <ScoreHeader
        total={score.total}
        mustFix={score.mustFix}
        fixes={report.findings.filter((finding) => finding.level === "fix").length}
      />
      {(waitingFor("pdf") || checkingGrammar) && (
        <div role="status" className="flex flex-col gap-1 px-2 text-sm text-ink-2">
          {waitingFor("pdf") && (
            <p>
              {pdf === "unbuilt"
                ? "The preview couldn't be built, so the checks on the PDF are left out."
                : pdf === "unreadable"
                  ? "The PDF couldn't be read, so the checks on it are left out."
                  : "Checking the PDF…"}
            </p>
          )}
          {checkingGrammar && (
            <p>
              {grammar === "failed"
                ? "Spelling and grammar couldn't all be checked, so what wasn't is left out."
                : "Checking spelling and grammar…"}
            </p>
          )}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="flex flex-col">
          {shown.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              view={view}
              findings={report.findings.filter((finding) => finding.category === category.id)}
              checking={checking.get(category.id)}
              score={score.categories[CATEGORIES.indexOf(category)]}
            />
          ))}
        </div>
      ) : (
        checking.size === 0 && <p className="px-2 text-sm leading-relaxed text-ink-2">Nothing to fix or review.</p>
      )}

      {report.dismissed.length > 0 && (
        <Folded summary={`Dismissed · ${report.dismissed.length}`}>
          <ul className="flex flex-col">
            {report.dismissed.map((finding, index) => (
              <li key={`${finding.key}:${index}`} className="flex flex-col items-start gap-0.5 px-2 py-1.5">
                <span className="w-full truncate font-mono text-[11px] text-ink-2">{describePlace(view, finding.place)}</span>
                <span className="text-[13px] leading-snug text-ink-2">{finding.message}</span>
                <button type="button" onClick={() => restore(finding)} aria-label={`Bring back: ${finding.message}`} className={quiet}>
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </Folded>
      )}
    </div>
  )
}

/** The score as shown (`shownScore`), with each category's points as last checked. */
function useShownScore(report: Report, checking: ReadonlyMap<CategoryId, unknown>) {
  const now = useMemo(() => scoreOf(report), [report])
  const kept = useRef<KeptScores>(new Map())
  useEffect(() => keepScores(kept.current, now, checking))
  return shownScore(now, kept.current, checking)
}

/**
 * The categories with something to fix or review. One being checked again
 * stays if it had findings when last checked, rather than going while its
 * PDF or grammar findings wait to be found again.
 */
function useShownCategories(findings: readonly Finding[], checking: ReadonlyMap<CategoryId, unknown>): Category[] {
  const found = new Set(findings.map((finding) => finding.category))
  const had = useRef(new Set<CategoryId>())
  useEffect(() => {
    for (const { id } of CATEGORIES) {
      if (checking.has(id)) continue
      if (found.has(id)) had.current.add(id)
      else had.current.delete(id)
    }
  })
  return CATEGORIES.filter(({ id }) => found.has(id) || (checking.has(id) && had.current.has(id)))
}

/**
 * The resume score on a ring, a word for how it reads, in a line what it
 * measures, and whether a must-fix is holding it down.
 */
function ScoreHeader({ total, mustFix = false, fixes = 0 }: { total: number | "checking" | null; mustFix?: boolean; fixes?: number }) {
  const id = useId()
  const band = typeof total === "number" ? bandOf(total) : null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 px-2">
      <div className="flex items-center gap-4">
        <ScoreRing total={total} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="label-mono text-ink-2">
            Resume score
          </h2>
          {band && <p className="text-[17px] font-medium leading-tight text-ink">{band.name}</p>}
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-2">How well this resume follows the checks below.</p>
      {mustFix && (
        <p className="bg-hatch flex items-start gap-2 rounded-[4px] border border-rule bg-sheet px-3 py-2.5 text-[13px] leading-snug text-ink">
          <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {/* The count can be a moment behind while the PDF or the text is checked again. */}
          {fixes > 0
            ? `Capped at ${MUST_FIX_MAX} until you fix ${fixes === 1 ? "1 item" : `${fixes} items`}.`
            : `Capped at ${MUST_FIX_MAX} while something's left to fix.`}
        </p>
      )}
    </section>
  )
}

/** The score in a ring that fills up to it. */
function ScoreRing({ total }: { total: number | "checking" | null }) {
  const scored = typeof total === "number"
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-rule" />
        {scored && total > 0 && (
          <circle
            cx="18"
            cy="18"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            style={{ strokeDashoffset: RING_LENGTH * (1 - total / 100) }}
            className="stroke-accent transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          />
        )}
      </svg>
      {/* Said aloud when it changes, once the checks under way are done. */}
      <p
        className="absolute inset-0 flex flex-col items-center justify-center text-ink"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={total === "checking" || undefined}
      >
        {scored ? (
          <>
            <span className="text-[22px] font-medium leading-none tabular-nums">{total}</span>
            <span className="mt-0.5 font-mono text-[10px] leading-none text-ink-2" aria-hidden="true">
              / 100
            </span>
            <span className="sr-only">out of 100</span>
          </>
        ) : (
          <>
            <span className="text-[22px] font-medium leading-none text-ink-2" aria-hidden="true">
              {total === "checking" ? "…" : "–"}
            </span>
            <span className="sr-only">{total === "checking" ? "Checking" : "Not scored yet"}</span>
          </>
        )}
      </p>
    </div>
  )
}

/**
 * One category with something to fix or review: an icon and a count for
 * where it stands, its points, and, opened, what it checks and its findings
 * (fixes first). It's open until folded, and slides open and shut.
 */
function CategoryRow({
  category,
  view,
  findings,
  checking,
  score,
}: {
  category: Category
  view: ResumeView
  findings: Finding[]
  /** What it's waiting on, while some of its rules are still being checked. */
  checking: Rule["reads"] | undefined
  /** Its points as shown; null until it has been checked once. */
  score: CategoryScore | null
}) {
  const id = useId()
  const [open, setOpen] = useState(true)
  const fixes = findings.filter((finding) => finding.level === "fix")
  const looks = findings.filter((finding) => finding.level === "look")
  const counts = [fixes.length > 0 && `${fixes.length} to fix`, looks.length > 0 && `${looks.length} to review`].filter(Boolean).join(", ")
  // Where it stands, in a few words. While its rules wait on the PDF or the
  // text, it says so instead of a count.
  const status = checking === "pdf" ? "Reading the PDF…" : checking ? "Checking…" : counts

  return (
    <section aria-labelledby={`${id}-name`} className="flex flex-col border-b border-rule last:border-b-0">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          aria-label={`${category.name}, ${status}`}
          onClick={() => setOpen(!open)}
          className="flex w-full items-start gap-2 rounded-[4px] px-2 pb-1 pt-3 text-left transition-colors hover:bg-sheet"
        >
          {checking ? (
            <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ink-2 motion-reduce:animate-none" aria-hidden="true" />
          ) : fixes.length > 0 ? (
            <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${FIX_COLOR}`} aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span id={`${id}-name`} className="text-sm font-medium leading-snug text-ink">
              {category.name}
            </span>
            <span className={`text-[12px] leading-snug ${checking ? "text-ink-2" : fixes.length > 0 ? FIX_COLOR : "text-accent"}`}>
              {status}
            </span>
          </span>
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-ink-2 transition-transform duration-300 ease-out motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div className="pb-3 pl-8 pr-2">
        <Points name={category.name} score={score} />
      </div>

      {/* Slides by its grid row; once shut, visibility (which changes at the
          end of its transition) hides the findings from the keyboard and screen readers. */}
      <div
        id={`${id}-body`}
        className={`grid transition-[grid-template-rows,visibility] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        }`}
      >
        {/* Room on the sides so focus outlines aren't clipped. */}
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div className="flex flex-col gap-3 pb-3 pl-6">
            <p className="-mt-1 pl-2 pr-2 text-[12px] leading-snug text-ink-2">{category.about}</p>
            {fixes.length > 0 && (
              <Group title={`To fix · ${fixes.length}`}>
                {fixes.map((finding, index) => (
                  <FindingItem key={`${finding.key}:${index}`} finding={finding} view={view} />
                ))}
              </Group>
            )}
            {looks.length > 0 && (
              <Group title={`To review · ${looks.length}`}>
                {looks.map((finding, index) => (
                  <FindingItem key={`${finding.key}:${index}`} finding={finding} view={view} />
                ))}
              </Group>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** A category's points, as a bar. */
function Points({ name, score }: { name: string; score: CategoryScore | null }) {
  // Not checked yet: the count says it's being checked.
  if (!score?.applies) return null
  const earned = wholePoints(score.earned)
  return (
    <div className="flex items-center gap-2">
      <div
        role="meter"
        aria-label={`${name}, points`}
        aria-valuemin={0}
        aria-valuemax={score.points}
        aria-valuenow={earned}
        aria-valuetext={`${earned} of ${score.points} points`}
        className="h-1 flex-1 overflow-hidden rounded-full bg-rule"
      >
        <div className="h-full rounded-full bg-ink" style={{ width: `${(100 * score.earned) / score.points}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-ink-2" aria-hidden="true">
        {earned}/{score.points}
      </span>
    </div>
  )
}

/** Some of a category's findings, under a small title. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-0.5">
      <h3 id={id} className="label-mono px-2 text-ink-2">
        {title}
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}

/** A finding: it opens its field, and a suggestion can be dismissed. */
function FindingItem({ finding, view }: { finding: Finding; view: ResumeView }) {
  const { open, dismiss, addWord } = useCheck()
  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={() => open(finding)}
        className={`flex flex-col items-start gap-0.5 rounded-r-[4px] border-l-2 px-2 py-2 text-left transition-colors hover:bg-sheet ${
          finding.level === "fix" ? "border-[#b42318]" : "border-accent"
        }`}
      >
        <span className="w-full truncate font-mono text-[11px] text-ink-2">{describePlace(view, finding.place)}</span>
        <span className="text-sm leading-snug text-ink">{finding.message}</span>
      </button>
      {(finding.level === "look" || finding.rule === TYPO_RULE) && (
        <div className="-mt-1 flex gap-4 px-2 pb-1.5">
          {finding.rule === TYPO_RULE && (
            <button type="button" onClick={() => addWord(finding.text)} aria-label={`Add word “${finding.text}”`} className={quiet}>
              Add word
            </button>
          )}
          {finding.level === "look" && (
            <button type="button" onClick={() => dismiss(finding)} aria-label={`Dismiss: ${finding.message}`} className={quiet}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/** A list that starts folded, like the dismissed findings. */
function Folded({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details>
      <summary className="label-mono cursor-pointer select-none rounded-[4px] px-2 py-1 text-ink-2 transition-colors hover:text-ink">
        {summary}
      </summary>
      <div className="pt-1">{children}</div>
    </details>
  )
}
