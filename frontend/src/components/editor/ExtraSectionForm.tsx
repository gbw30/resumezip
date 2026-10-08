"use client"

import { useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { useResumeContext } from "@/context/ResumeContext"
import { CERTIFICATION_FIELDS, extraHeading, extrasOf, type Certification, type ExtraSection } from "@/lib/resumeSections"
import { useCheck } from "./CheckContext"
import { nextAnnouncement } from "./arrange"
import { BulletsField, Field, FlagNote, MoveButtons, SectionHeading, selectLine } from "./fields"
import { reducedMotion } from "./layout"

const LABELS: Record<keyof Omit<Certification, "id" | "leftOut">, string> = { name: "Credential name", issuer: "Issuer", issued: "Issued", expires: "Expires", credentialId: "Credential ID", link: "Link" }

/** Optional content uses stable section/credential identities, independently of its displayed title. */
export default function ExtraSectionForm({ sectionId, position, onDelete }: { sectionId: string; position: string; onDelete: () => void }) {
  const { formData, editSection, includeSection, addCredential, editCredential, includeCredential, deleteCredential, moveCredential } = useResumeContext()
  const id = formData.id as string
  const section: ExtraSection | undefined = extrasOf(formData)[sectionId]
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(() => section?.kind === "certifications" ? section.entries[0]?.id ?? null : null)
  const [announcement, setAnnouncement] = useState("")
  const { target, pending, claim } = useCheck()
  const place = target?.finding.place
  const here = place && "sectionId" in place && place.sectionId === sectionId ? place : null
  const flagAt = (field: string, entryId?: string) => here && ((here.kind === "extra-text" && here.field === field) || (here.kind === "credential" && here.entryId === entryId && here.field === field)) ? target!.finding : null

  useEffect(() => { if (confirming !== null) cancel.current?.focus() }, [confirming])
  useEffect(() => {
    const place = target?.finding.place
    if (!target || !place || !("sectionId" in place) || place.sectionId !== sectionId || !pending(target.request)) return
    if (place.kind === "credential") { setOpenId(place.entryId); setConfirming(null) }
    const timer = setTimeout(() => {
      if (!claim(target.request)) return
      const selector = place.kind === "extra-heading" ? 'button[aria-label="Rename section"]' : place.kind === "credential" ? `[data-credential="${place.entryId}"] [data-field="${place.field ?? "name"}"] input` : `[data-field="${place.field}"] textarea`
      const field = root.current?.querySelector<HTMLElement>(selector)
      field?.focus({ preventScroll: true })
      if (field instanceof HTMLTextAreaElement && place.kind === "extra-text" && place.line !== undefined) selectLine(field, place.line)
      field?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
    }, 0)
    return () => clearTimeout(timer)
  }, [target, pending, claim, sectionId])

  if (!section) return null
  const title = extraHeading(section)
  const confirm = (key: string, remove: () => void) => confirming === key ? <span className="flex flex-wrap items-center gap-3" onKeyDown={(event) => { if (event.key === "Escape") { setConfirming(null); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-delete="${key}"]`)?.focus()) } }}>
    <span className="text-sm text-ink-2">Delete {key === "section" ? "this section" : "this credential"}?</span>
    <button ref={cancel} type="button" onClick={() => { setConfirming(null); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-delete="${key}"]`)?.focus()) }} className="text-sm underline underline-offset-4">Cancel</button>
    <button type="button" onClick={remove} className="text-sm text-[#b42318] underline underline-offset-4">Delete {key === "section" ? "section" : "credential"}</button>
  </span> : <button type="button" data-delete={key} onClick={() => setConfirming(key)} className="text-sm text-ink-2 underline underline-offset-4">Delete {key === "section" ? "section" : "credential"}</button>

  return <div ref={root} className="flex flex-col gap-7">
    <SectionHeading position={position} title={title} allowEmpty onRename={(heading) => editSection(id, sectionId, { heading })} flag={here?.kind === "extra-heading" ? target!.finding : null} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={!section.leftOut} onChange={(event) => includeSection(id, sectionId, event.target.checked)} className="h-4 w-4 accent-accent" />Include section in the PDF</label>
      {confirm("section", onDelete)}
    </div>
    {section.leftOut && <p className="text-sm text-ink-2">This section stays saved here and is left out of the PDF and checks.</p>}
    {(section.kind === "summary" || section.kind === "text") && <div data-field="text" className="flex flex-col gap-2">
      <label className="flex flex-col gap-2"><span className="label-mono text-ink-2">Text</span><textarea value={section.text} onChange={(event) => editSection(id, sectionId, { text: event.target.value })} rows={8} aria-invalid={flagAt("text")?.level === "fix" || undefined} aria-describedby={flagAt("text") ? `extra-text-note-${sectionId}` : undefined} className="w-full resize-y rounded-[4px] border border-rule bg-sheet px-3.5 py-3 text-base leading-relaxed outline-none focus:border-accent" /></label>
      {flagAt("text") && <FlagNote id={`extra-text-note-${sectionId}`} finding={flagAt("text")!} />}
      <p className="text-[13px] text-ink-2">Paragraph breaks are kept. Text prints exactly as written.</p>
    </div>}
    {section.kind === "list" && <BulletsField label="Bullet points" name="bullets" value={section.bullets} onChange={(bullets) => editSection(id, sectionId, { bullets })} flag={flagAt("bullets")} request={target?.request} />}
    {section.kind === "certifications" && <>
      <div className="flex flex-col gap-4">
        {section.entries.map((entry, index) => <section key={entry.id} data-credential={entry.id} className="rounded-[4px] border border-rule bg-sheet p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex shrink-0 items-center"><input type="checkbox" aria-label={`Include credential ${index + 1} in the PDF`} checked={!entry.leftOut} onChange={(event) => includeCredential(id, entry.id, event.target.checked)} className="h-4 w-4 accent-accent" /></label>
            <button type="button" aria-expanded={openId === entry.id} onClick={() => { setOpenId(openId === entry.id ? null : entry.id); setConfirming(null) }} className="min-w-0 flex-1 text-left text-base font-medium">{entry.name.trim() || `Credential ${index + 1}`}{entry.leftOut && <span className="ml-2 text-sm font-normal text-ink-2">Left out</span>}</button>
            <MoveButtons name={`credential ${index + 1}`} first={index === 0} last={index === section.entries.length - 1} onMove={(by) => { moveCredential(id, entry.id, by); setAnnouncement((last) => nextAnnouncement(last, `Moved credential to ${index + by + 1} of ${section.entries.length}`)) }} />
          </div>
          {openId === entry.id && <div className="mt-5 flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 @sm:grid-cols-2">{CERTIFICATION_FIELDS.map((field) => <Field key={field} name={field} label={LABELS[field]} value={entry[field]} onChange={(value) => editCredential(id, entry.id, { [field]: value })} flag={flagAt(field, entry.id)} />)}</div>
            <p className="text-[13px] text-ink-2">Dates are optional. Use the format you prefer.</p>
            {confirm(entry.id, () => { deleteCredential(id, entry.id); setConfirming(null); setOpenId(null); requestAnimationFrame(() => addButton.current?.focus()) })}
          </div>}
        </section>)}
      </div>
      <button ref={addButton} type="button" onClick={() => { const entryId = addCredential(id); if (!entryId) return; setOpenId(entryId); setConfirming(null); requestAnimationFrame(() => { const entry = root.current?.querySelector<HTMLElement>(`[data-credential="${entryId}"]`); entry?.scrollIntoView({ block: "nearest" }); if (window.matchMedia("(pointer: fine)").matches) entry?.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.focus() }) }} className="flex items-center justify-center gap-2 rounded-[4px] border border-rule px-4 py-3 text-sm hover:border-accent"><Plus className="h-4 w-4" aria-hidden="true" />Add credential</button>
    </>}
    <p role="status" className="sr-only">{announcement}</p>
  </div>
}
