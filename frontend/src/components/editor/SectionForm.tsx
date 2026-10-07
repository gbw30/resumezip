"use client"

import { useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { useResumeContext } from "@/context/ResumeContext"
import { isLeftOut } from "@/lib/leftOut"
import { useCheck } from "./CheckContext"
import { BulletsField, Field, FlagNote, MoveButtons, SectionHeading, selectLine } from "./fields"
import { reducedMotion, reveal, scrollerOf } from "./layout"
import PaperFromLink from "./PaperFromLink"
import { FIELD_SPAN, type ChoiceDef, type SectionDef } from "./sections"

// `leftOut` is set on entries left out of the PDF (see lib/leftOut.ts).
type Entry = { id: number; leftOut?: true; [field: string]: any }

interface SectionFormProps {
  section: SectionDef
  /** e.g. "03 / 08" */
  position: string
}

// How long an entry takes to slide open, closed or away (matches duration-300).
const SLIDE_MS = 300

// Where a field is typed in: not the Include boxes in an entry's heading, or
// in a bullets field being arranged.
const TYPED = ':is(input:not([type="checkbox"]), textarea)'
const FIRST_FIELD = `[data-field] ${TYPED}`

/** Moves the cursor to what the checker points at (one bullet, if `line` is given) and scrolls it into view. */
function pointAt(target: HTMLElement | null | undefined, line?: number, view: HTMLElement | null | undefined = target) {
  if (!target) return
  target.focus({ preventScroll: true })
  if (line !== undefined && target instanceof HTMLTextAreaElement) selectLine(target, line)
  view?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
}

/** The form for one list section (education, experience, ...): its title and entries. */
export default function SectionForm({ section, position }: SectionFormProps) {
  const { formData, updateFormData } = useResumeContext()
  const entries: Entry[] = Array.isArray(formData[section.dataKey]) ? formData[section.dataKey] : []
  const latest = useRef(entries)
  latest.current = entries
  const owner = useRef("")
  owner.current = formData.profileSection?.fullName ?? ""

  // One entry is open at a time; the rest collapse to a one-line summary.
  const [openId, setOpenId] = useState<number | null>(entries[0]?.id ?? null)
  // Follows openId a frame later, so a newly added entry slides open too.
  const [shownId, setShownId] = useState<number | null>(openId)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const elements = useRef(new Map<number, HTMLElement>())
  const addButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLDivElement>(null)
  const opened = useRef(openId)
  opened.current = openId
  // Said to screen readers when an entry moves.
  const [announcement, setAnnouncement] = useState("")

  // What the checker points at in this section, while the person fixes it.
  const { target, pending, claim } = useCheck()
  const place = target?.finding.place
  const here = place && place.kind !== "profile" && place.kind !== "page" && place.section === section.name ? place : null
  const flagAt = (index: number, field?: string) =>
    here?.kind === "entry" && here.entry === index && here.field === field ? target!.finding : null

  // When the person chooses a finding here, open its entry, then move to its
  // field once the entry has slid open: just once, not each time it's shown.
  useEffect(() => {
    const place = target?.finding.place
    if (!target || !place || place.kind === "profile" || place.kind === "page" || place.section !== section.name) return
    if (!pending(target.request)) return
    const entry = place.kind === "entry" ? latest.current[place.entry] : undefined
    if (place.kind === "entry" && !entry) return
    const sliding = entry !== undefined && entry.id !== opened.current && !reducedMotion()
    if (entry) {
      setConfirmingId(null)
      setOpenId(entry.id)
      setShownId(entry.id)
    }
    const timer = setTimeout(
      () => {
        if (!claim(target.request)) return
        if (place.kind === "heading") {
          pointAt(heading.current?.querySelector<HTMLElement>('button[aria-label="Rename section"]'), undefined, heading.current)
        } else if (place.kind === "section") {
          pointAt(addButton.current, undefined, heading.current)
        } else if (entry) {
          const fields = elements.current.get(entry.id)
          const selector = place.field ? `[data-field="${place.field}"] ${TYPED}` : FIRST_FIELD
          pointAt(fields?.querySelector<HTMLElement>(selector), place.line)
        }
      },
      sliding ? SLIDE_MS : 0,
    )
    return () => clearTimeout(timer)
  }, [target, pending, claim, section.name])

  // Asking to confirm a delete moves focus to Cancel, so Escape or Enter backs out.
  useEffect(() => {
    if (confirmingId !== null) cancelButton.current?.focus()
  }, [confirmingId])

  const cancelDelete = (id: number) => {
    setConfirmingId(null)
    requestAnimationFrame(() => elements.current.get(id)?.querySelector<HTMLElement>("[data-delete]")?.focus())
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShownId(openId))
    return () => cancelAnimationFrame(frame)
  }, [openId])

  const save = (next: Entry[]) => updateFormData(section.dataKey, next)

  /** Puts the cursor in an entry's first field, except on touch screens where it would pop up the keyboard. */
  const focusFirstField = (id: number) => {
    if (!window.matchMedia("(pointer: fine)").matches) return
    elements.current.get(id)?.querySelector<HTMLElement>(FIRST_FIELD)?.focus({ preventScroll: true })
  }

  /**
   * Opens one entry (or closes them all), keeping the entry that was clicked
   * still on screen while the entries around it slide open or closed.
   */
  const open = (id: number | null, clicked: number) => {
    setConfirmingId(null)
    setOpenId(id)
    // One entry closes as the other opens, in the same frame, so the page's height barely changes.
    setShownId(id)
    const element = elements.current.get(clicked)
    if (!element) return
    // Hold it in place while things move (instantly, with reduced motion), then
    // bring the opened entry's first fields into view if they ran off the bottom.
    // The browser's own scroll anchoring would fight this, so it's off meanwhile.
    const reduced = reducedMotion()
    const scroller = scrollerOf(element)
    const anchoring = scroller.style.overflowAnchor
    scroller.style.overflowAnchor = "none"
    const top = element.getBoundingClientRect().top
    const start = performance.now()
    const hold = () => {
      scroller.scrollTop += element.getBoundingClientRect().top - top
      if (performance.now() - start < (reduced ? 0 : SLIDE_MS) + 60) {
        requestAnimationFrame(hold)
        return
      }
      scroller.style.overflowAnchor = anchoring
      if (id !== null) reveal(element, scroller, reduced)
    }
    requestAnimationFrame(hold)
    if (id !== null) requestAnimationFrame(() => focusFirstField(id))
  }

  /**
   * Adds entries at the end and opens the first. It builds on the latest
   * entries, so nothing typed while a paper was being looked up is lost.
   * `show` brings the opened entry into view and puts the cursor in it.
   */
  const addEntries = (values: Record<string, string>[], show = true) => {
    const current = latest.current
    const id = current.length > 0 ? Math.max(...current.map((entry) => entry.id)) + 1 : 1
    const blank = Object.fromEntries(section.fields.map((field) => [field.key, ""]))
    save([...current, ...values.map((value, index) => ({ ...blank, ...value, id: id + index }) as Entry)])
    setConfirmingId(null)
    setOpenId(id)
    if (!show) return
    // Once it has slid open, bring it into view.
    setTimeout(
      () => {
        const element = elements.current.get(id)
        if (element) reveal(element, scrollerOf(element), reducedMotion())
        focusFirstField(id)
      },
      reducedMotion() ? 0 : SLIDE_MS,
    )
  }

  const add = () => addEntries([{}])

  // The others keep their ids, so React doesn't give the next entry what was
  // the deleted one's: its place in the slide, or a bullets field's mode.
  const remove = (id: number) => {
    const hadFocus = elements.current.get(id)?.contains(document.activeElement) ?? false
    save(latest.current.filter((entry) => entry.id !== id))
    setRemovingId(null)
    setOpenId((current) => (current === id ? null : current))
    if (hadFocus) addButton.current?.focus({ preventScroll: true })
  }

  // The entry slides away, then it's deleted.
  const confirmRemove = (id: number) => {
    setConfirmingId(null)
    if (reducedMotion()) return remove(id)
    setRemovingId(id)
    setTimeout(() => remove(id), SLIDE_MS)
  }

  const update = (id: number, key: string, value: string) =>
    save(entries.map((entry) => (entry.id === id ? { ...entry, [key]: value } : entry)))

  /**
   * Moves an entry up or down one place. Its id stays the same, so it stays
   * open if it was, and React keeps the focus on the button that moved it.
   */
  const move = (id: number, by: -1 | 1) => {
    const current = latest.current
    const from = current.findIndex((entry) => entry.id === id)
    const to = from + by
    if (from < 0 || to < 0 || to >= current.length) return
    const next = [...current]
    next.splice(to, 0, ...next.splice(from, 1))
    save(next)
    setConfirmingId(null)
    setAnnouncement(`Moved to ${to + 1} of ${current.length}`)
  }

  /** Leaves an entry out of the PDF, or puts it back. An entry that's in has no `leftOut` at all. */
  const setLeftOut = (id: number, leftOut: boolean) =>
    save(
      latest.current.map((entry) => {
        if (entry.id !== id) return entry
        const { leftOut: _, ...rest } = entry
        return leftOut ? { ...rest, leftOut: true } : rest
      }),
    )

  const title = formData.headings?.[section.headingKey] || section.title
  const quiet = "py-2 text-sm text-ink-2 transition-colors hover:text-ink"

  const addButtonElement = (
    <button
      ref={addButton}
      type="button"
      onClick={add}
      className="inline-flex h-10 items-center gap-2 self-start rounded-[4px] border border-rule-strong px-3.5 text-sm text-ink transition-colors hover:border-ink"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      {section.addLabel}
    </button>
  )

  return (
    <div className="flex flex-col gap-8">
      <div ref={heading}>
        <SectionHeading
          position={position}
          title={title}
          onRename={(name) => updateFormData("headings", { ...formData.headings, [section.headingKey]: name })}
          flag={here?.kind === "heading" || here?.kind === "section" ? target!.finding : null}
        />
      </div>

      {section.choice && (
        <SectionChoice
          choice={section.choice}
          value={formData[section.choice.key]}
          onChange={(value) => updateFormData(section.choice!.key, value)}
        />
      )}

      {entries.length === 0 && (
        <p className="border-t border-ink pt-5 text-[15px] text-ink-2">Nothing here yet.</p>
      )}

      {entries.length > 0 && (
        <div className="flex flex-col">
          {entries.map((entry, index) => {
            const isOpen = entry.id === openId
            const confirming = entry.id === confirmingId
            // Its first filled field stands in when the usual ones are empty, like a paper's link added by hand.
            const summary =
              section.summary.map((key) => entry[key]?.trim()).filter(Boolean).join(", ") ||
              section.fields.map((field) => entry[field.key]?.trim()).find(Boolean)
            const name = `entry ${index + 1}`
            const leftOut = isLeftOut(entry)

            return (
              <div
                key={entry.id}
                ref={(element) => {
                  if (element) elements.current.set(entry.id, element)
                  else elements.current.delete(entry.id)
                }}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                  entry.id === removingId ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"
                }`}
              >
                {/* Room on the sides so focus outlines aren't clipped while it slides. */}
                <section className="-mx-1 min-h-0 overflow-hidden px-1">
                  <div
                    className={`border-t pb-7 pt-4 transition-colors duration-300 ${isOpen ? "border-ink" : "border-rule"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="label-mono text-ink-2">
                          Entry {index + 1}
                          {leftOut && " · Left out"}
                        </span>
                        {!isOpen && (
                          <span className={`truncate text-[15px] ${summary && !leftOut ? "text-ink" : "text-ink-2"}`}>
                            {summary || "Empty entry"}
                          </span>
                        )}
                      </div>

                      <div
                        className="flex shrink-0 flex-wrap items-center justify-end gap-x-4"
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && confirming) {
                            event.stopPropagation()
                            cancelDelete(entry.id)
                          }
                        }}
                      >
                        {!confirming && (
                          <>
                            <MoveButtons
                              key="move"
                              name={name}
                              first={index === 0}
                              last={index === entries.length - 1}
                              onMove={(by) => move(entry.id, by)}
                            />
                            <label key="include" className="flex cursor-pointer items-center gap-2 py-2 text-sm text-ink-2">
                              <input
                                type="checkbox"
                                checked={!leftOut}
                                onChange={(event) => setLeftOut(entry.id, !event.target.checked)}
                                aria-label={`Include ${name} in the PDF`}
                                className="h-4 w-4 accent-accent"
                              />
                              Include
                            </label>
                          </>
                        )}
                        {!isOpen ? (
                          <button
                            key="edit"
                            type="button"
                            onClick={() => open(entry.id, entry.id)}
                            aria-label={`Edit ${name}`}
                            className="py-2 text-sm text-ink underline underline-offset-4"
                          >
                            Edit
                          </button>
                        ) : confirming ? (
                          <>
                            <span key="question" className="py-2 text-sm text-ink" role="status">
                              Delete this entry?
                            </span>
                            <button
                              key="cancel"
                              ref={cancelButton}
                              type="button"
                              onClick={() => cancelDelete(entry.id)}
                              className={quiet}
                            >
                              Cancel
                            </button>
                            <button
                              key="confirm"
                              type="button"
                              onClick={() => confirmRemove(entry.id)}
                              className="py-2 text-sm font-medium text-[#b42318] underline-offset-4 hover:underline"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              key="delete"
                              data-delete
                              type="button"
                              onClick={() => setConfirmingId(entry.id)}
                              aria-label={`Delete ${name}`}
                              className="py-2 text-sm text-ink-2 transition-colors hover:text-[#b42318]"
                            >
                              Delete
                            </button>
                            <button
                              key="done"
                              type="button"
                              onClick={() => open(null, entry.id)}
                              aria-label={`Done editing ${name}`}
                              className="py-2 text-sm text-ink underline underline-offset-4"
                            >
                              Done
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* The fields slide open and closed. */}
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                        entry.id === shownId && isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="-mx-1 min-h-0 overflow-hidden px-1" inert={!isOpen}>
                        <div className="grid grid-cols-2 gap-x-7 gap-y-6 pb-1 pt-5 @lg:grid-cols-4">
                          {leftOut && (
                            <p className="col-span-2 text-[13px] leading-normal text-ink-2 @lg:col-span-4">
                              Left out of the PDF, and of the copy of the resume inside it. It stays here, in this browser.
                            </p>
                          )}
                          {flagAt(index) && (
                            <div className="col-span-2 @lg:col-span-4">
                              <FlagNote finding={flagAt(index)!} />
                            </div>
                          )}
                          {section.fields.map((field) => {
                            const Input = field.type === "bullets" ? BulletsField : Field
                            const flag = flagAt(index, field.key)
                            return (
                              <Input
                                key={field.key}
                                name={field.key}
                                label={field.label}
                                placeholder={field.placeholder}
                                value={entry[field.key] ?? ""}
                                onChange={(value) => update(entry.id, field.key, value)}
                                className={FIELD_SPAN[field.size]}
                                flag={flag}
                                request={flag ? target!.request : undefined}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )
          })}
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {section.fromPaperLink ? (
        <PaperFromLink entries={() => latest.current} owner={() => owner.current} onAdd={addEntries}>
          {addButtonElement}
        </PaperFromLink>
      ) : (
        addButtonElement
      )}
    </div>
  )
}

/** A choice that applies to the whole section, like how project links are printed. */
function SectionChoice({ choice, value, onChange }: { choice: ChoiceDef; value: unknown; onChange: (value: string) => void }) {
  const selected = choice.options.find((option) => option.value === value) ?? choice.options[0]
  return (
    <div className="-mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span id={`${choice.key}-label`} className="label-mono text-ink-2">
          {choice.label}
        </span>
        <div role="radiogroup" aria-labelledby={`${choice.key}-label`} className="flex flex-wrap gap-2">
          {choice.options.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-[4px] border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                option === selected ? "border-ink bg-ink text-white" : "border-rule-strong text-ink hover:border-ink"
              }`}
            >
              <input
                type="radio"
                name={choice.key}
                value={option.value}
                checked={option === selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      <p className="text-[13px] leading-normal text-ink-2">{selected.hint}</p>
    </div>
  )
}
