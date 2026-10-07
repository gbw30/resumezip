"use client"

import type React from "react"
import { useId } from "react"
import { Check } from "lucide-react"
import { useResumeContext } from "@/context/ResumeContext"
import type { Finding } from "@/lib/check/engine"
import { describePlace, hasEnoughToCheck } from "@/lib/check/labels"
import type { ResumeView } from "@/lib/check/resume"
import { LEVELS, type Level } from "@/lib/check/settings"
import { hasLeftOut } from "@/lib/leftOut"
import { useCheck } from "./CheckContext"

// A typo can't be dismissed, but its word can be added so it isn't flagged
// again (rule G1, issue #66).
const TYPO_RULE = "G1"

const quiet = "text-[13px] text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline"

/**
 * What the checker found on the resume, in the left bar's Check mode: what
 * to fix, what's worth a look, what was dismissed, and what passed. Choosing
 * a finding opens its field in the form.
 */
export default function CheckPanel() {
  const { report, restore } = useCheck()
  const { formData } = useResumeContext()
  // The resume as last checked, so places are named as the findings saw them.
  const view = report.view

  if (!hasEnoughToCheck(view)) {
    return (
      <p className="px-5 py-4 text-sm leading-relaxed text-ink-2 xl:px-2 xl:py-0">
        {/* The checker reads only what's printed, so entries that are all left out don't count. */}
        {view.profile.fullName && hasLeftOut(formData)
          ? "Include an entry in the PDF to check this resume."
          : "Add your name and one entry to check this resume."}
      </p>
    )
  }

  const passed = [
    ...report.results.filter((result) => result.status === "passed").map((result) => result.rule.title),
    ...report.automatic,
  ]
  return (
    <div className="flex flex-col gap-6 px-3 py-4 xl:p-0">
      {/* The resume score goes here (issue #67). */}
      {report.findings.length === 0 && <p className="px-2 text-sm text-ink-2">Nothing to fix.</p>}
      <Group level="fix" view={view} findings={report.findings.filter((finding) => finding.level === "fix")} />
      <Group level="look" view={view} findings={report.findings.filter((finding) => finding.level === "look")} />

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

      <Folded summary={`${passed.length} passed`}>
        <ul className="flex flex-col gap-1.5 px-2 py-1">
          {passed.map((title, index) => (
            <li key={index} className="flex gap-2 text-[13px] leading-snug text-ink-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {title}
            </li>
          ))}
        </ul>
      </Folded>
    </div>
  )
}

/** The findings at one level: each opens its field, and suggestions can be dismissed. */
function Group({ level, view, findings }: { level: Level; view: ResumeView; findings: Finding[] }) {
  const { open, dismiss, addWord } = useCheck()
  const id = useId()
  if (findings.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h2 id={id} className="label-mono px-2 text-ink-2">
        {LEVELS[level].name} · {findings.length}
      </h2>
      <ul className="flex flex-col">
        {findings.map((finding, index) => (
          <li key={`${finding.key}:${index}`} className="flex flex-col">
            <button
              type="button"
              onClick={() => open(finding)}
              className="flex flex-col items-start gap-0.5 rounded-[4px] px-2 py-2 text-left transition-colors hover:bg-sheet"
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
        ))}
      </ul>
    </section>
  )
}

/** A list that starts folded, like the passed checks. */
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
