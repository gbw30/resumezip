"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, Download, Eye, Loader2, PencilLine } from "lucide-react"
import { useResumeContext } from "@/context/ResumeContext"
import { CheckProvider } from "@/components/editor/CheckContext"
import LeftBar from "@/components/editor/LeftBar"
import PdfPreview from "@/components/editor/PdfPreview"
import ProfileForm from "@/components/editor/ProfileForm"
import SectionForm from "@/components/editor/SectionForm"
import { WIDE_SCREEN } from "@/components/editor/layout"
import SectionNav, { type ActiveSection } from "@/components/editor/SectionNav"
import TemplatePicker from "@/components/editor/TemplatePicker"
import { useKeepFormPlace } from "@/components/editor/useKeepFormPlace"
import DownloadFailed, { nextFailure, type Failure } from "@/components/site/DownloadFailed"
import NotSaved from "@/components/site/NotSaved"
import { SECTION_NAMES, SECTIONS, type SectionName } from "@/components/editor/sections"
import { uniqueTitle } from "@/lib/resumeTitles"
import { compilePreview, downloadResume, loadCompiler, printedOf, Superseded } from "@/lib/typst/compile"

const pad = (n: number) => String(n).padStart(2, "0")

// After a change, the preview waits about as long as a compile takes before
// compiling: fast computers update quickly, and slow phones don't compile
// for every pause in typing.
const MIN_WAIT_MS = 150
const MAX_WAIT_MS = 400

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const { setCurrentResumeId, formData, updateFormData, loaded, resumes, saveStatus } = useResumeContext()
  const [active, setActive] = useState<ActiveSection>("Profile")
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  // Small screens show the form or the preview, not both.
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [typing, setTyping] = useState(false)
  const editScroll = useRef(0)
  // How long the last preview took.
  const compileMs = useRef(MIN_WAIT_MS)
  const headerRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (id) setCurrentResumeId(id)
  }, [id, setCurrentResumeId])

  // Whether this browser has the resume, once storage has loaded.
  const found = loaded && Boolean(resumes[id])

  // Resizing across the wide-screen width keeps the form where it was scrolled to.
  useKeepFormPlace(mainRef, found)

  // The PDF compiler starts loading as soon as the resume is found, before
  // the first preview asks for it. A resume that isn't here doesn't need it.
  useEffect(() => {
    if (found) loadCompiler()
  }, [found])

  // The saved order, plus any sections missing from older resumes.
  const sections = useMemo<SectionName[]>(() => {
    const saved: SectionName[] = (Array.isArray(formData.sectionOrder) ? formData.sectionOrder : []).filter(
      (name: string): name is SectionName => SECTION_NAMES.includes(name as SectionName),
    )
    return [...saved, ...SECTION_NAMES.filter((name) => !saved.includes(name))]
  }, [formData.sectionOrder])

  // Resumes live in this browser, so the tab title is set here rather than in metadata.
  const tabTitle = formData.resumeTitle?.trim() || "Untitled resume"
  useEffect(() => {
    if (formData.id) document.title = `${tabTitle} · resumezip`
  }, [formData.id, tabTitle])

  // What the preview shows. Changes that don't print, such as renaming the
  // resume, leave it as it was, so they don't recompile.
  const printed = useMemo(() => JSON.stringify(printedOf({ ...formData, sectionOrder: sections })), [formData, sections])

  // Re-render the preview in the browser shortly after what it shows changes.
  useEffect(() => {
    if (!formData.id) return
    // Aborted once this preview is no longer wanted: withdrawn if it's still
    // waiting to compile, and its result thrown away if it isn't.
    const wanted = new AbortController()
    const wait = Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, compileMs.current))
    const timer = setTimeout(async () => {
      const startedAt = performance.now()
      try {
        const url = await compilePreview(JSON.parse(printed), wanted.signal)
        compileMs.current = performance.now() - startedAt
        if (wanted.signal.aborted) {
          URL.revokeObjectURL(url)
          return
        }
        setPdfUrl(url)
        setCompileError(null)
      } catch (error) {
        if (!wanted.signal.aborted && !(error instanceof Superseded)) setCompileError(error instanceof Error ? error.message : String(error))
      }
    }, wait)
    return () => {
      wanted.abort()
      clearTimeout(timer)
    }
  }, [formData.id, printed])

  // Free each preview PDF once a newer one replaces it.
  useEffect(() => {
    if (!pdfUrl) return
    return () => URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  // The Edit / Preview switch steps aside while a touch screen's keyboard is
  // up. With a mouse and keyboard nothing covers the page, so it stays put and
  // can be clicked while a field has focus.
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)")
    const isField = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    const onFocusIn = (event: FocusEvent) => setTyping(touch.matches && isField(event.target))
    const onFocusOut = (event: FocusEvent) => {
      if (isField(event.target) && !isField(event.relatedTarget)) setTyping(false)
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
    }
  }, [])

  // A new section starts at its top: in the form's pane on wide screens, on the page on small ones
  // (scrolled just far enough that the section tabs stay pinned above it).
  const select = (section: ActiveSection) => {
    setActive(section)
    if (window.matchMedia(WIDE_SCREEN).matches) {
      if (mainRef.current) mainRef.current.scrollTop = 0
      return
    }
    const top = headerRef.current?.offsetHeight ?? 0
    if (window.scrollY > top) window.scrollTo({ top })
  }

  // Coming back to the form returns to where you were in it.
  const show = (next: "edit" | "preview") => {
    if (next === view) return
    if (next === "preview") editScroll.current = window.scrollY
    setView(next)
    requestAnimationFrame(() => window.scrollTo({ top: next === "edit" ? editScroll.current : 0 }))
  }

  // Once a rename is done, number the name if another resume already has it.
  const commitTitle = () => {
    const others = Object.entries(resumes as Record<string, any>).filter(([key]) => key !== id)
    const title = uniqueTitle(formData.resumeTitle ?? "", others.map(([, resume]) => resume?.resumeTitle))
    if (title !== formData.resumeTitle) updateFormData("resumeTitle", title)
  }

  const download = async () => {
    setDownloading(true)
    try {
      await downloadResume({ ...formData, sectionOrder: sections })
      setFailure(null)
    } catch (error) {
      console.error("Error downloading resume:", error)
      setFailure((previous) => nextFailure(previous, error))
    } finally {
      setDownloading(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <span className="label-mono text-ink-2">Loading…</span>
      </div>
    )
  }

  // Resumes only exist in the browser that created them.
  if (!resumes[id]) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-5 text-center">
        <span className="label-mono text-ink-2">Not in this browser</span>
        <h1 className="font-serif text-[40px] leading-tight tracking-[-0.02em]">Resume not found</h1>
        <p className="max-w-md text-[15px] leading-relaxed text-ink-2">
          Resumes are saved in the browser you made them in. Open this link on that device, or start a new one.
        </p>
        <Link href="/create/dashboard" className="text-sm underline underline-offset-4">
          Go to your resumes
        </Link>
      </div>
    )
  }

  const total = sections.length + 1
  const position = (index: number) => `${pad(index)} / ${pad(total)}`

  return (
    <div className="flex min-h-screen flex-col bg-paper xl:h-screen xl:overflow-hidden">
      <header ref={headerRef} className="border-b border-rule bg-sheet">
        <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2.5 lg:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/create/dashboard"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Your resumes
            </Link>
            <span className="h-5 w-px shrink-0 bg-rule" aria-hidden="true" />
            <input
              aria-label="Resume name"
              value={formData.resumeTitle ?? ""}
              placeholder="Untitled resume"
              size={Math.max(14, (formData.resumeTitle ?? "").length + 1)}
              onChange={(event) => updateFormData("resumeTitle", event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
              className="min-w-0 max-w-[58vw] border-0 border-b border-transparent bg-transparent py-0.5 font-serif lg:max-w-[40vw] text-[19px] text-ink outline-none transition-colors placeholder:text-ink-2 hover:border-rule-strong focus:border-accent focus-visible:outline-none"
            />
            {saveStatus === "saved" && (
              <span className="label-mono hidden shrink-0 text-ink-2 xl:inline">Saved in this browser</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TemplatePicker value={formData.selectedTemplate} onChange={(template) => updateFormData("selectedTemplate", template)} />
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="inline-flex h-10 items-center gap-2 rounded-[4px] bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-80"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {/* Just "PDF" on phones, so it fits beside the template picker. */}
              <span>
                <span className="max-sm:sr-only">Download </span>PDF
              </span>
            </button>
          </div>
        </div>
        <NotSaved className="border-t border-rule px-5 py-2.5 lg:px-6" />
        {failure && (
          <DownloadFailed
            key={failure.count}
            failure={failure}
            retrying={downloading}
            onRetry={download}
            className="border-t border-rule px-5 py-2.5 lg:px-6"
          />
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        {/* The left bar and the forms share what the checker found. */}
        <CheckProvider onSelect={select}>
          <LeftBar hidden={view === "preview"}>
            <SectionNav
              sections={sections}
              active={active}
              onSelect={select}
              onReorder={(order) => updateFormData("sectionOrder", order)}
            />
          </LeftBar>

          <main
            ref={mainRef}
            className={`min-w-0 flex-1 px-5 pb-28 pt-9 sm:px-10 xl:block xl:overflow-y-auto xl:pb-16 ${
              view === "preview" ? "hidden" : ""
            }`}
          >
            {/* A container, so the fields fit the form's own width rather than the window's. */}
            <div className="@container mx-auto max-w-[640px]">
              {active === "Profile" ? (
                <ProfileForm position={position(1)} />
              ) : (
                <SectionForm key={active} section={SECTIONS[active]} position={position(sections.indexOf(active) + 2)} />
              )}
            </div>
          </main>

          <section
            aria-label="Live preview"
            className={`min-w-0 flex-col bg-desk pb-20 xl:flex xl:w-[46%] xl:overflow-hidden xl:pb-0 ${
              view === "preview" ? "flex max-xl:flex-1" : "hidden"
            }`}
          >
            <PdfPreview pdfUrl={pdfUrl} error={compileError} />
          </section>
        </CheckProvider>
      </div>

      <div
        data-covers="bottom"
        className={`fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center transition-[opacity,transform] duration-200 xl:hidden ${
          typing ? "pointer-events-none translate-y-3 opacity-0" : ""
        }`}
      >
        <div role="group" aria-label="View" className="flex gap-1 rounded-[4px] bg-ink p-1 shadow-[0_12px_32px_-12px_rgba(17,19,24,0.5)]">
          {(["edit", "preview"] as const).map((option) => {
            const Icon = option === "edit" ? PencilLine : Eye
            return (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => show(option)}
                className={`inline-flex h-9 items-center gap-2 rounded-[3px] px-4 text-sm font-medium transition-colors ${
                  view === option ? "bg-paper text-ink" : "text-white/70 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {option === "edit" ? "Edit" : "Preview"}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
