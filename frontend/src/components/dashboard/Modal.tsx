"use client"

import type React from "react"
import { useEffect, useRef } from "react"

interface ModalProps {
  title: string
  onClose: () => void
  /** A large dialog that lays out its own content, title included (give the title id="modal-title"). */
  wide?: boolean
  children: React.ReactNode
}

/** A centred dialog that closes on Escape or a click outside it. */
export default function Modal({ title, onClose, wide = false, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Callers pass a new onClose on every render. Reading the latest one from a
  // ref keeps the effect below to the dialog opening, so a parent re-render
  // (as when another tab saves) doesn't pull focus back to the first control.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current()
    }
    document.addEventListener("keydown", onKeyDown)
    // Start keyboard users inside the dialog.
    panelRef.current?.querySelector<HTMLElement>("input, button")?.focus()
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  // It fades in, and the dialog grows into place (`starting:` is CSS @starting-style).
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 transition-opacity duration-200 ease-out motion-reduce:transition-none starting:opacity-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`transition-[scale] duration-200 ease-out motion-reduce:transition-none starting:scale-[0.98] ${
          wide
            ? "flex h-[min(88vh,880px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[4px] bg-paper"
            : "w-full max-w-md rounded-[4px] bg-paper p-7"
        }`}
      >
        {!wide && (
          <h2 id="modal-title" className="font-serif text-[28px] leading-tight tracking-[-0.02em]">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}
