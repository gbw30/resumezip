"use client"

import { useResumeContext } from "@/context/ResumeContext"
import type { SaveStatus } from "@/lib/resumeStorage"

const WHY: Record<Exclude<SaveStatus, "saved">, string> = {
  blocked: "Your browser isn't letting resumezip save anything. Download a PDF before you close this page.",
  full: "Your browser's storage for resumezip is full. Download a PDF to keep your changes, or delete resumes you don't need.",
  failed: "Something went wrong saving your changes. Download a PDF to keep them.",
}

/** Says when the latest changes aren't saved in this browser, and what to do. Shows nothing while saving works. */
export default function NotSaved({ className = "" }: { className?: string }) {
  const { saveStatus } = useResumeContext()
  if (saveStatus === "saved") return null
  return (
    <div role="alert" className={`flex flex-wrap items-baseline gap-x-6 gap-y-1 ${className}`}>
      <span className="label-mono shrink-0 text-[#b42318]">Not saved</span>
      <p className="min-w-0 flex-[1_1_280px] text-sm leading-relaxed text-ink">{WHY[saveStatus]}</p>
    </div>
  )
}
