"use client"

import { Loader2 } from "lucide-react"
import { useResumeContext } from "@/context/ResumeContext"
import { hasLeftOut } from "@/lib/leftOut"
import type { SaveStatus } from "@/lib/resumeStorage"

const WHY: Record<Exclude<SaveStatus, "saved">, string> = {
  blocked: "Your browser isn't letting resumezip save anything. Download a PDF before you close this page.",
  full: "Your browser's storage for resumezip is full. Download a PDF to keep your changes, or delete resumes you don't need.",
  failed: "Something went wrong saving your changes. Download a PDF to keep them.",
}

interface NotSavedProps {
  className?: string
  /** Downloads the open resume's PDF, as in the editor: the banner gets a button for it. */
  onDownload?: () => void
  /** Whether that download is on its way. */
  downloading?: boolean
}

/** Says when the latest changes aren't saved in this browser, and what to do. Shows nothing while saving works. */
export default function NotSaved({ className = "", onDownload, downloading = false }: NotSavedProps) {
  const { saveStatus, resumes } = useResumeContext()
  if (saveStatus === "saved") return null
  return (
    <div role="alert" className={`flex flex-wrap items-baseline gap-x-6 gap-y-2 ${className}`}>
      <span className="label-mono shrink-0 text-[#b42318]">Not saved</span>
      <p className="min-w-0 flex-[1_1_280px] text-sm leading-relaxed text-ink">
        {WHY[saveStatus]}
        {/* A PDF holds only what it prints (lib/leftOut.ts). */}
        {Object.values(resumes).some(hasLeftOut) && " What's left out of the PDF isn't in it."}
      </p>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4 disabled:cursor-wait"
        >
          {downloading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Download PDF
        </button>
      )}
    </div>
  )
}
