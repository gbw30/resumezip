"use client"

import { Loader2 } from "lucide-react"

interface DownloadFailedProps {
  /** The resume's name, when the page lists more than one. */
  title?: string
  retrying: boolean
  onRetry: () => void
  className?: string
}

/** Says a PDF download didn't work, with a button to try again. */
export default function DownloadFailed({ title, retrying, onRetry, className = "" }: DownloadFailedProps) {
  return (
    <div role="alert" className={`flex flex-wrap items-baseline gap-x-6 gap-y-2 ${className}`}>
      <span className="label-mono shrink-0 text-[#b42318]">Download failed</span>
      <p className="min-w-0 flex-[1_1_280px] text-sm leading-relaxed text-ink">
        Couldn&apos;t make {title ? <>the PDF of &ldquo;{title}&rdquo;</> : "your PDF"}. Check your connection and try
        again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4 disabled:cursor-wait"
      >
        {retrying && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        Try again
      </button>
    </div>
  )
}
