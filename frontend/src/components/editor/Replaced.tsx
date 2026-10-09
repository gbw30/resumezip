"use client"

import { useRef } from "react"
import { flushSync } from "react-dom"
import { useResumeContext } from "@/context/ResumeContext"

interface ReplacedProps {
  /** The open resume. */
  id: string
  className?: string
}

/**
 * Says the resume was just replaced with a PDF's content, on the dashboard,
 * and can put back the copy it replaced. Shows nothing once the resume changes
 * again (see lib/resumeStore.ts).
 */
export default function Replaced({ id, className = "" }: ReplacedProps) {
  const { replaced, undoReplace } = useResumeContext()
  const message = useRef<HTMLParagraphElement>(null)
  if (replaced?.id !== id) return null

  // Undo goes once it's pressed, so focus moves to what's now said instead of
  // being lost to the page. That's read out as focus lands on it.
  const undo = () => {
    flushSync(() => undoReplace(id))
    message.current?.focus({ preventScroll: true })
  }

  return (
    <div className={`flex flex-wrap items-baseline gap-x-6 gap-y-2 ${className}`}>
      <span className="label-mono shrink-0 text-ink-2">{replaced.undone ? "Undone" : "Replaced"}</span>
      <p ref={message} tabIndex={-1} className="min-w-0 flex-[1_1_280px] text-sm leading-relaxed text-ink outline-none">
        {replaced.undone ? "It's back as it was before you opened the PDF." : "This resume now has what's in the PDF."}
      </p>
      {!replaced.undone && (
        <button type="button" onClick={undo} className="shrink-0 text-sm font-medium text-ink underline underline-offset-4">
          Undo
        </button>
      )}
    </div>
  )
}
