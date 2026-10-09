"use client"

import { useEffect, useRef, useState } from "react"
import { useOpenResume, useResumeActions, useResumeField } from "@/context/ResumeContext"
import { extraHeading, type ExtraSection } from "@/lib/resumeSections"
import { useCheckActions, useCheckTarget } from "./CheckContext"
import { BulletsField, FlagNote, SectionHeading, selectLine } from "./fields"
import { reducedMotion } from "./layout"

/** A section the person added, found by its key rather than its title, which can be anyone's. */
export default function ExtraSectionForm({ sectionId, position, onDelete }: { sectionId: string; position: string; onDelete: () => void }) {
  const { editSection, includeSection } = useResumeActions()
  const { id } = useOpenResume()
  const extraSections = useResumeField("extraSections")
  const section: ExtraSection | undefined = extraSections?.[sectionId]
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  const target = useCheckTarget()
  const { pending, claim } = useCheckActions()
  const place = target?.finding.place
  const here = place && "sectionId" in place && place.sectionId === sectionId ? place : null
  const flagAt = (field: "text" | "bullets") => (here?.kind === "extra-text" && here.field === field ? target!.finding : null)

  useEffect(() => {
    if (confirming) cancel.current?.focus()
  }, [confirming])
  useEffect(() => {
    const place = target?.finding.place
    if (!target || !place || !("sectionId" in place) || place.sectionId !== sectionId || !pending(target.request)) return
    const timer = setTimeout(() => {
      if (!claim(target.request)) return
      const selector = place.kind === "extra-heading" ? 'button[aria-label="Rename section"]' : `[data-field="${place.field}"] textarea`
      const field = root.current?.querySelector<HTMLElement>(selector)
      field?.focus({ preventScroll: true })
      if (field instanceof HTMLTextAreaElement && place.kind === "extra-text" && place.line !== undefined) selectLine(field, place.line)
      field?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
    }, 0)
    return () => clearTimeout(timer)
  }, [target, pending, claim, sectionId])

  if (!section) return null
  const title = extraHeading(section)
  // Back to the Delete button, as when the question is answered with Cancel or Escape.
  const keep = () => {
    setConfirming(false)
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[data-delete]")?.focus())
  }
  const remove = confirming ? (
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
    <button type="button" data-delete onClick={() => setConfirming(true)} className="text-sm text-ink-2 underline underline-offset-4">
      Delete section
    </button>
  )

  return (
    <div ref={root} className="flex flex-col gap-7">
      <SectionHeading
        position={position}
        title={title}
        allowEmpty
        onRename={(heading) => editSection(id, sectionId, { heading })}
        flag={here?.kind === "extra-heading" ? target!.finding : null}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={!section.leftOut}
            onChange={(event) => includeSection(id, sectionId, event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Include section in the PDF
        </label>
        {remove}
      </div>
      {section.leftOut && <p className="text-sm text-ink-2">This section stays saved here and is left out of the PDF and checks.</p>}
      {section.kind === "text" && (
        <div data-field="text" className="flex flex-col gap-2">
          <label className="flex flex-col gap-2">
            <span className="label-mono text-ink-2">Text</span>
            <textarea
              value={section.text}
              onChange={(event) => editSection(id, sectionId, { text: event.target.value })}
              rows={8}
              aria-invalid={flagAt("text")?.level === "fix" || undefined}
              aria-describedby={flagAt("text") ? `extra-text-note-${sectionId}` : undefined}
              className="w-full resize-y rounded-[4px] border border-rule bg-sheet px-3.5 py-3 text-base leading-relaxed outline-none focus:border-accent"
            />
          </label>
          {flagAt("text") && <FlagNote id={`extra-text-note-${sectionId}`} finding={flagAt("text")!} />}
          <p className="text-[13px] text-ink-2">Paragraph breaks are kept. Text prints exactly as written.</p>
        </div>
      )}
      {section.kind === "list" && (
        <BulletsField
          label="Bullet points"
          name="bullets"
          value={section.bullets}
          onChange={(bullets) => editSection(id, sectionId, { bullets })}
          flag={flagAt("bullets")}
          request={target?.request}
        />
      )}
    </div>
  )
}
