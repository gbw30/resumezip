"use client"

import type React from "react"
import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useResumeActions } from "@/context/ResumeContext"
import type { TemplateId } from "@/lib/templates"
import { loadCompiler, savingData } from "@/lib/typst/compile"

// How long a mouse rests on a link before it counts as reaching for it. One
// passing over it on the way somewhere else is there for less.
const RESTING_MS = 100

/**
 * Starts the user writing. First-time visitors get a new resume straight away;
 * returning visitors go to their resumes. Picking a specific template always
 * starts a new resume with it. `prepare`, for a moment before, starts the
 * downloads a new resume's editor needs.
 */
export function useStartWriting() {
  const router = useRouter()
  // The resumes are only looked at when a link is used, so this doesn't re-render as they change.
  const { getState, createNewResume } = useResumeActions()

  // Whether starting makes a new resume, rather than going to the dashboard.
  const opensNew = useCallback(
    (template?: TemplateId) => {
      const { resumes, loaded } = getState()
      return loaded && (template !== undefined || Object.keys(resumes).length === 0)
    },
    [getState],
  )

  const start = useCallback(
    (template?: TemplateId) => {
      if (!opensNew(template)) {
        router.push("/create/dashboard")
        return
      }
      const id = createNewResume("Untitled resume", "personal", template)
      // The editor's preview needs the PDF compiler and the template's fonts, so they start downloading now.
      loadCompiler(template)
      router.push(`/create/new/${id}`)
    },
    [opensNew, createNewResume, router],
  )

  // The dashboard starts its own downloads, with the fonts of the resume edited last.
  const prepare = useCallback(
    (template?: TemplateId) => {
      if (opensNew(template)) loadCompiler(template)
    },
    [opensNew],
  )

  return { start, prepare }
}

// A click with a modifier key or another button is left to the browser, as on
// any link: it opens a new tab or window, or a menu.
const plainClick = (event: React.MouseEvent) => !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0

interface StartWritingLinkProps {
  template?: TemplateId
  className?: string
  /**
   * Start the editor's downloads once a mouse rests on the link, a moment
   * before it's clicked. For "Start writing" links, not template pictures,
   * which people look over without meaning to start.
   */
  preloadOnHover?: boolean
  children: React.ReactNode
}

/**
 * A link that starts writing (see useStartWriting). Works as a plain link without JavaScript.
 * A mouse pressing it starts the editor's downloads before the click; a finger
 * doesn't, as scrolling the page starts with the same touch.
 */
export function StartWritingLink({ template, className, preloadOnHover = false, children }: StartWritingLinkProps) {
  const { start, prepare } = useStartWriting()
  const resting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(resting.current), [])

  return (
    <a
      href="/create/dashboard"
      className={className}
      onPointerEnter={(event) => {
        // Visitors saving data only download the compiler once they press or click.
        if (!preloadOnHover || event.pointerType !== "mouse" || savingData()) return
        clearTimeout(resting.current)
        resting.current = setTimeout(() => prepare(template), RESTING_MS)
      }}
      onPointerLeave={() => clearTimeout(resting.current)}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && plainClick(event)) prepare(template)
      }}
      onClick={(event) => {
        if (!plainClick(event)) return
        event.preventDefault()
        start(template)
      }}
    >
      {children}
    </a>
  )
}
