"use client"

import Image from "next/image"
import { memo, useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { TEMPLATES, templateById, type TemplateId } from "@/lib/templates"

interface TemplatePickerProps {
  value: unknown
  onChange: (template: TemplateId) => void
}

/**
 * A button showing the current template that opens a gallery of all of them:
 * a dialog in the middle of the screen below 1024px, where the button can be
 * anywhere in the header, and a panel under the button on wider screens.
 */
function TemplatePicker({ value, onChange }: TemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const current = templateById(value)

  // Closing from inside the gallery puts the keyboard back on the button.
  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    // Start on the current template, scrolled into view.
    panelRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
    // The page behind stays where it is: on phones a finger on the dimmed
    // area would otherwise scroll it.
    const page = document.documentElement
    const overflow = page.style.overflow
    page.style.overflow = "hidden"
    // A click elsewhere on the page closes it, and what was clicked keeps the focus.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
      }
      // Tab goes round the gallery's buttons until it closes, in every
      // browser (Safari's own Tab skips buttons unless set not to).
      if (event.key !== "Tab" || !panelRef.current) return
      event.preventDefault()
      const buttons = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button"))
      const index = buttons.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey ? (index <= 0 ? buttons.length : index) - 1 : (index + 1) % buttons.length
      buttons[next]?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      page.style.overflow = overflow
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="inline-flex h-10 items-center gap-2.5 rounded-[4px] border border-rule-strong pl-3.5 pr-3 text-sm text-ink transition-colors hover:border-ink"
      >
        <span className="label-mono text-ink-2">Template</span>
        {current.name}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        // Below 1024px this covers the screen, and a click around the gallery
        // closes it. It fades in (`starting:` is CSS @starting-style): the
        // dialog grows into place, and the panel on wider screens drops into it.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 transition-opacity duration-200 ease-out motion-reduce:transition-none starting:opacity-0 lg:absolute lg:inset-auto lg:right-0 lg:top-12 lg:z-30 lg:block lg:bg-transparent lg:p-0"
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a template"
            className="flex max-h-full w-full max-w-[560px] flex-col rounded-[4px] bg-paper shadow-[0_18px_40px_-16px_rgba(17,19,24,0.3)] ring-1 ring-rule transition-[scale,translate] duration-200 ease-out motion-reduce:transition-none starting:scale-[0.98] lg:max-h-[calc(100dvh-6rem)] lg:w-[560px] lg:starting:-translate-y-1 lg:starting:scale-100"
          >
            <div className="flex items-center justify-between gap-4 px-5 pt-5">
              <span className="label-mono text-ink-2">Templates</span>
              <button type="button" onClick={close} className="-m-2 p-2 text-sm text-ink-2 transition-colors hover:text-ink">
                Close
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 overflow-y-auto overscroll-contain p-5 pt-1 sm:grid-cols-3">
              {TEMPLATES.map((template) => {
                const selected = template.id === current.id
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(template.id)
                      close()
                    }}
                    className="group flex flex-col gap-2 text-left"
                  >
                    <span
                      className={`relative block aspect-[8.5/11] w-full overflow-hidden bg-sheet transition-shadow ${
                        selected ? "ring-2 ring-accent" : "ring-1 ring-rule group-hover:ring-ink"
                      }`}
                    >
                      <Image src={template.image} alt="" fill sizes="180px" className="object-cover object-top" />
                    </span>
                    <span className={`text-sm ${selected ? "font-medium text-ink" : "text-ink-2 group-hover:text-ink"}`}>
                      {template.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Re-renders when the template changes, and not with the rest of the editor.
export default memo(TemplatePicker)
