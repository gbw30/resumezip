"use client"

import { useEffect, useRef, useState } from "react"
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd"
import { GripVertical } from "lucide-react"
import { WIDE_SCREEN } from "./layout"
import { SECTIONS, type SectionName } from "./sections"
import { extraHeading, extraKey, extrasOf, type ExtraKind, type SectionRef } from "@/lib/resumeSections"
import { MoveButtons } from "./fields"
import { nextAnnouncement } from "./arrange"

export type ActiveSection = "Profile" | SectionRef

interface SectionNavProps {
  sections: SectionRef[]
  /** The person's own section titles, by each section's `headingKey`. */
  headings?: Record<string, string>
  resume?: Record<string, any>
  active: ActiveSection
  onSelect: (section: ActiveSection) => void
  onReorder: (sections: SectionRef[]) => void
  onAdd?: (kind: ExtraKind) => void
}

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The numbered sections: a list in the left bar on wide screens, a row of tabs on narrower ones.
 * Profile stays first; the rest can be dragged into any order.
 */
export default function SectionNav({ sections, headings, resume, active, onSelect, onReorder, onAdd }: SectionNavProps) {
  const navRef = useRef<HTMLElement>(null)
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE_SCREEN).matches)
  const [announcement, setAnnouncement] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(WIDE_SCREEN)
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  // Keep the chosen tab in view in the row.
  useEffect(() => {
    const nav = navRef.current
    const tab = nav?.querySelector<HTMLElement>("[aria-current]")
    if (wide || !nav || !tab) return
    const box = (tab.parentElement === nav ? tab : tab.parentElement!).getBoundingClientRect()
    const view = nav.getBoundingClientRect()
    const by = box.left < view.left + 16 ? box.left - view.left - 16 : box.right > view.right - 16 ? box.right - view.right + 16 : 0
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (by) nav.scrollBy({ left: by, behavior: reduced ? "auto" : "smooth" })
  }, [active, wide])

  const onDragEnd = ({ source, destination }: DropResult) => {
    if (!destination || destination.index === source.index) return
    const next = [...sections]
    const [moved] = next.splice(source.index, 1)
    next.splice(destination.index, 0, moved)
    onReorder(next)
    setAnnouncement((last) => nextAnnouncement(last, `Moved ${titleOf(moved)} to ${destination.index + 1} of ${sections.length}`))
  }

  // A section's title as the person named it, or the editor's.
  const extras = extrasOf(resume ?? {})
  const titles = new Map(sections.map((ref) => {
    const key = extraKey(ref)
    const builtIn = key === null ? SECTIONS[ref as SectionName] : null
    return [ref, key !== null ? extras[key] ? extraHeading(extras[key]) : "New section" : (resume?.headings ?? headings)?.[builtIn!.headingKey] || builtIn!.title] as const
  }))
  const counts = new Map<string, number>()
  for (const title of titles.values()) counts.set(title, (counts.get(title) ?? 0) + 1)
  const titleOf = (name: SectionRef) => titles.get(name)!
  const labelOf = (name: SectionRef, index: number) => (counts.get(titleOf(name)) ?? 0) > 1 ? `${titleOf(name)}, section ${index + 2}` : titleOf(name)

  const item = (isActive: boolean) =>
    `flex shrink-0 items-center gap-3 whitespace-nowrap rounded-[4px] px-2 py-[9px] text-left text-sm transition-colors xl:w-full xl:shrink ${
      isActive ? "bg-sheet font-medium text-ink ring-1 ring-rule" : "text-ink-2 hover:text-ink"
    }`

  return (
    <nav
      ref={navRef}
      aria-label="Sections"
      className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] xl:flex-col xl:overflow-visible xl:p-0 [&::-webkit-scrollbar]:hidden"
    >
      <span className="label-mono hidden px-2 pb-3 text-ink-2 xl:block">Sections</span>

      <button type="button" data-section-ref="Profile" onClick={() => onSelect("Profile")} className={item(active === "Profile")} aria-current={active === "Profile" || undefined}>
        <span className="hidden w-3.5 xl:block" aria-hidden="true" />
        <span className={`font-mono text-[11px] ${active === "Profile" ? "text-accent" : ""}`}>01</span>
        Profile
      </button>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="sections" direction={wide ? "vertical" : "horizontal"}>
          {(drop) => (
            <div ref={drop.innerRef} {...drop.droppableProps} className="flex gap-1 xl:flex-col">
              {sections.map((name, index) => {
                const isActive = active === name
                return (
                  <Draggable key={name} draggableId={name} index={index}>
                    {(drag, snapshot) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={`flex shrink-0 items-center rounded-[4px] ${snapshot.isDragging ? "bg-sheet shadow-sm ring-1 ring-rule" : ""}`}
                      >
                        <span
                          {...drag.dragHandleProps}
                          aria-label={`Reorder ${labelOf(name, index)}`}
                          className="flex h-9 w-6 shrink-0 items-center justify-center text-ink-2 hover:text-ink"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelect(name)}
                          className={`${item(isActive)} -ml-1`}
                          aria-current={isActive || undefined}
                          aria-label={`${pad(index + 2)} ${labelOf(name, index)}`}
                          data-section-ref={name}
                        >
                          <span className={`font-mono text-[11px] ${isActive ? "text-accent" : ""}`}>{pad(index + 2)}</span>
                          {titleOf(name)}
                        </button>
                        {isActive && <MoveButtons name={`${labelOf(name, index)} section`} first={index === 0} last={index === sections.length - 1} onMove={(by) => {
                          const next = [...sections]
                          ;[next[index], next[index + by]] = [next[index + by], next[index]]
                          onReorder(next)
                          setAnnouncement((last) => nextAnnouncement(last, `Moved ${titleOf(name)} to ${index + by + 1} of ${sections.length}`))
                        }} />}
                      </div>
                    )}
                  </Draggable>
                )
              })}
              {drop.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {onAdd && <div className="shrink-0 xl:mt-3">
        <button type="button" aria-expanded={adding} onClick={() => setAdding(!adding)} className="rounded-[4px] px-2 py-2 text-sm text-ink underline underline-offset-4">Add section</button>
        {adding && <div role="group" aria-label="Add section" className="flex flex-col gap-1 rounded-[4px] border border-rule bg-sheet p-2">
          {([['summary', 'Summary'], ['certifications', 'Certifications'], ['text', 'Text'], ['list', 'Bullet list']] as const).map(([kind, title]) => <button key={kind} type="button" aria-label={`Add ${title} section`} disabled={(kind === "summary" || kind === "certifications") && Object.hasOwn(extras, kind)} onClick={() => { onAdd(kind); setAdding(false) }} className="rounded-[4px] px-2 py-2 text-left text-sm hover:bg-paper disabled:opacity-40">{title}</button>)}
        </div>}
      </div>}
      <p role="status" className="sr-only">{announcement}</p>

      <p className="mt-3 hidden border-t border-rule px-2 pt-5 text-[13px] leading-normal text-ink-2 xl:block">
        Drag a section to change its place on the page.
      </p>
    </nav>
  )
}
