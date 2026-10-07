"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { Finding, PdfReading } from "@/lib/check/engine"
import type { Place } from "@/lib/check/places"
import { readPreview } from "@/lib/check/preview"
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
  /** Starts reading the preview for the PDF rules, as Check is opened. */
  watchPdf: () => void
}

/** The preview on screen: its PDF, and what it prints (`printedOf` as JSON). */
export interface Preview {
  url: string
  printed: string
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

// Runs `callback` once the page is idle, or after a moment where it can't
// tell (Safari), and gives back how to call it off.
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 2000 })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = setTimeout(callback, 200)
  return () => clearTimeout(timer)
}

interface CheckProviderProps {
  /** Shows a section in the form, as choosing it in the section list does. */
  onSelect: (section: ActiveSection) => void
  preview: Preview | null
  /** What the resume prints now; a preview of anything else is out of date. */
  printed: string
  children: React.ReactNode
}

/**
 * Checks the open resume for the editor: the left bar lists what's found, and
 * the forms point at the finding the person chose to fix. Once Check has been
 * opened, each new preview is read for the PDF rules, while the page is idle;
 * they wait while the preview is behind what's been typed.
 */
export function CheckProvider({ onSelect, preview, printed, children }: CheckProviderProps) {
  const [watching, setWatching] = useState(false)
  const [read, setRead] = useState<{ printed: string; pdf: PdfReading } | null>(null)
  useEffect(() => {
    if (!watching || !preview) return
    const reading = new AbortController()
    const cancel = whenIdle(() => {
      readPreview(preview.url, reading.signal)
        .then((pdf) => {
          if (pdf) setRead({ printed: preview.printed, pdf })
        })
        .catch((error) => {
          if (!reading.signal.aborted) console.warn("The checker couldn't read the preview:", error)
        })
    })
    return () => {
      cancel()
      reading.abort()
    }
  }, [watching, preview])

  const check = useResumeCheck(read?.printed === printed ? read.pdf : undefined)
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
  const watchPdf = useCallback(() => setWatching(true), [])
  const value = useMemo(() => ({ ...check, target, open, pending, claim, watchPdf }), [check, target, open, pending, claim, watchPdf])
  return <CheckContext.Provider value={value}>{children}</CheckContext.Provider>
}

export function useCheck(): CheckValue {
  const check = useContext(CheckContext)
  if (!check) throw new Error("useCheck must be used inside CheckProvider")
  return check
}
