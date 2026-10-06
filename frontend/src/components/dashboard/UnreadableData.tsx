"use client"

import { useState } from "react"
import { useResumeContext } from "@/context/ResumeContext"
import Modal from "./Modal"

const secondary = "h-10 rounded-[4px] border border-rule-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink"
const quiet = "h-10 px-4 text-sm text-ink-2 hover:text-ink"

/**
 * Saved data that couldn't be read is kept aside instead of being saved over
 * (see lib/resumeStorage.ts). This says so, and offers it as a file or to
 * delete it. Shows nothing when there's none.
 */
export default function UnreadableData() {
  const { unreadable, deleteUnreadable } = useResumeContext()
  const [deleting, setDeleting] = useState(false)
  if (unreadable.length === 0) return null

  // One copy downloads exactly as it was saved. Several go in a JSON list, so
  // they can be told apart again.
  const download = () => {
    const one = unreadable.length === 1
    const file = one
      ? new Blob([unreadable[0]], { type: "text/plain" })
      : new Blob([JSON.stringify(unreadable, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")
    link.href = url
    link.download = one ? "resumezip-unreadable-data.txt" : "resumezip-unreadable-data.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <div className="flex max-w-[720px] flex-wrap items-baseline gap-x-6 gap-y-3">
      <span className="label-mono shrink-0 text-[#b42318]">Couldn&apos;t read</span>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col items-start gap-3">
        <p className="text-sm leading-relaxed text-ink">
          Some data saved in this browser couldn&apos;t be read, so resumezip kept a copy instead of saving over it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={download} className={secondary}>
            Download the copy
          </button>
          <button type="button" onClick={() => setDeleting(true)} className={quiet}>
            Delete it
          </button>
        </div>
      </div>

      {deleting && (
        <Modal title="Delete the copy?" onClose={() => setDeleting(false)}>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            It will be removed from this browser. This can&apos;t be undone.
          </p>
          <div className="mt-7 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleting(false)} className={quiet}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                deleteUnreadable()
                setDeleting(false)
              }}
              className="h-10 rounded-[4px] bg-[#b42318] px-4 text-sm font-medium text-white transition-colors hover:bg-[#912018]"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
