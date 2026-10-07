"use client"

import type React from "react"
import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { useResumeActions } from "@/context/ResumeContext"
import type { TemplateId } from "@/lib/templates"
import { loadCompiler } from "@/lib/typst/compile"

/**
 * Starts the user writing. First-time visitors get a new resume straight away;
 * returning visitors go to their resumes. Picking a specific template always
 * starts a new resume with it.
 */
export function useStartWriting() {
  const router = useRouter()
  // The resumes are only looked at on a click, so this doesn't re-render as they change.
  const { getState, createNewResume } = useResumeActions()

  return useCallback(
    (template?: TemplateId) => {
      const { resumes, loaded } = getState()
      const hasResumes = Object.keys(resumes).length > 0
      if (!loaded || (hasResumes && !template)) {
        router.push("/create/dashboard")
        return
      }
      const id = createNewResume("Untitled resume", "personal", template)
      // The editor's preview needs the PDF compiler, so it starts downloading now.
      loadCompiler()
      router.push(`/create/new/${id}`)
    },
    [getState, createNewResume, router],
  )
}

interface StartWritingLinkProps {
  template?: TemplateId
  className?: string
  children: React.ReactNode
}

/** A link that starts writing (see useStartWriting). Works as a plain link without JavaScript. */
export function StartWritingLink({ template, className, children }: StartWritingLinkProps) {
  const start = useStartWriting()
  return (
    <a
      href="/create/dashboard"
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        start(template)
      }}
    >
      {children}
    </a>
  )
}
