"use client"

import { useEffect, useRef, useState } from "react"

/**
 * A section's Delete button, which asks first. Cancel, or Escape, puts the
 * question away and the focus back on the button.
 */
export default function DeleteSection({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirming) cancel.current?.focus()
  }, [confirming])

  const keep = () => {
    setConfirming(false)
    // The button is back once the question is gone.
    requestAnimationFrame(() => button.current?.focus())
  }

  return confirming ? (
    <span
      className="flex flex-wrap items-center gap-3"
      onKeyDown={(event) => {
        if (event.key === "Escape") keep()
      }}
    >
      <span className="text-sm text-ink-2">Delete this section?</span>
      <button ref={cancel} type="button" onClick={keep} className="text-sm underline underline-offset-4">
        Cancel
      </button>
      <button type="button" onClick={onDelete} className="text-sm text-[#b42318] underline underline-offset-4">
        Delete section
      </button>
    </span>
  ) : (
    <button ref={button} type="button" onClick={() => setConfirming(true)} className="text-sm text-ink-2 underline underline-offset-4">
      Delete section
    </button>
  )
}
