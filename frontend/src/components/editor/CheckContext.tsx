"use client"

import type React from "react"
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { Finding } from "@/lib/check/engine"
import type { Place } from "@/lib/check/places"
import type { ActiveSection } from "./SectionNav"
import { useResumeCheck } from "./useResumeCheck"

/**
 * A finding the person chose to fix, as the checker sees it now. `request`
 * counts up each time one is chosen, so choosing it again opens it again.
 */
export interface Target {
  finding: Finding
  request: number
}

type CheckValue = ReturnType<typeof useResumeCheck> & {
  /** The finding being fixed; null once it's fixed or dismissed. */
  target: Target | null
  /** Opens a finding's section, and asks its form to point at the field. */
  open: (finding: Finding) => void
  /** Whether a request hasn't been taken yet. */
  pending: (request: number) => boolean
  /**
   * True the first time a form takes a request, so the form that opens the
   * field does it once, and not again when it's shown later.
   */
  claim: (request: number) => boolean
}

const CheckContext = createContext<CheckValue | null>(null)

/** The form section a place is in; none for the PDF's pages. */
export function sectionOf(place: Place): ActiveSection | null {
  return place.kind === "profile" ? "Profile" : place.kind === "page" ? null : place.section
}

const PLACE_PARTS = ["field", "section", "entry", "line", "page"] as const

// The same problem: one rule at one place. Its text and message can change
// as the person types, and it's still the one they're fixing.
const sameIssue = (a: Finding, b: Finding) =>
  a.rule === b.rule &&
  a.place.kind === b.place.kind &&
  PLACE_PARTS.every((part) => (a.place as Record<string, unknown>)[part] === (b.place as Record<string, unknown>)[part])

/**
 * Checks the open resume for the editor: the left bar lists what's found, and
 * the forms point at the finding the person chose to fix. `onSelect` shows a
 * section in the form, as choosing it in the section list does.
 */
export function CheckProvider({ onSelect, children }: { onSelect: (section: ActiveSection) => void; children: React.ReactNode }) {
  const check = useResumeCheck()
  const [chosen, setChosen] = useState<Target | null>(null)
  const claimed = useRef(0)
  const select = useRef(onSelect)
  select.current = onSelect

  const open = useCallback((finding: Finding) => {
    const section = sectionOf(finding.place)
    if (section) select.current(section)
    setChosen((current) => ({ finding, request: (current?.request ?? 0) + 1 }))
  }, [])

  const pending = useCallback((request: number) => request > claimed.current, [])
  const claim = useCallback((request: number) => {
    if (request <= claimed.current) return false
    claimed.current = request
    return true
  }, [])

  const live = chosen ? check.report.findings.find((finding) => sameIssue(finding, chosen.finding)) : undefined
  const target = useMemo(() => (chosen && live ? { finding: live, request: chosen.request } : null), [chosen, live])
  const value = useMemo(() => ({ ...check, target, open, pending, claim }), [check, target, open, pending, claim])
  return <CheckContext.Provider value={value}>{children}</CheckContext.Provider>
}

export function useCheck(): CheckValue {
  const check = useContext(CheckContext)
  if (!check) throw new Error("useCheck must be used inside CheckProvider")
  return check
}
