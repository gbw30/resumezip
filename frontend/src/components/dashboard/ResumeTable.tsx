"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import DownloadFailed, { nextFailure, type Failure } from "@/components/site/DownloadFailed"
import type { ResumeWithId } from "@/lib/resume"
import { downloadResume } from "@/lib/typst/compile"
import { templateById } from "@/lib/templates"
import { RESUME_TAGS } from "./CreateResumeModal"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" })
const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" })

function formatEdited(value: string | undefined) {
  const date = new Date(value ?? "")
  if (Number.isNaN(date.getTime())) return "—"
  const today = new Date().toDateString() === date.toDateString()
  return today ? `Today, ${timeFormat.format(date)}` : dateFormat.format(date)
}

// How long a Download button says "Downloaded" before going back to how it was.
const DOWNLOADED_MS = 2000
// How long a new copy stands out in the list.
const COPIED_MS = 2500

const tagName = (tag: string) => RESUME_TAGS.find((option) => option.id === tag?.toLowerCase())?.name ?? tag

const nameOf = (resume: ResumeWithId) => resume.resumeTitle || "Untitled resume"

interface ResumeTableProps {
  resumes: ResumeWithId[]
  /** Adds a copy of the resume, and returns its id. */
  onDuplicate: (resume: ResumeWithId) => string | undefined
  onRename: (resume: ResumeWithId, title: string) => void
  onDelete: (resume: ResumeWithId) => void
}

// The phone cards and the table are both on the page, one of them hidden, so
// this finds the one showing.
function focusShown(selector: string) {
  const shown = [...document.querySelectorAll<HTMLElement>(selector)].find((element) => element.offsetParent !== null)
  shown?.focus()
}

export default function ResumeTable({ resumes, onDuplicate, onRename, onDelete }: ResumeTableProps) {
  // Ids of the resumes downloading, and why each one whose last download failed did.
  const [downloading, setDownloading] = useState<string[]>([])
  const [failed, setFailed] = useState<Record<string, Failure>>({})
  // When each resume just downloaded finished, by id, and what's said aloud about the last one.
  const [downloaded, setDownloaded] = useState<Record<string, number>>({})
  const [announcement, setAnnouncement] = useState("")
  // The resume being renamed, and the name typed so far.
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null)
  // The copy just made, which stands out for a moment.
  const [copied, setCopied] = useState<string | null>(null)

  const announce = (text: string) => {
    // Cleared first, so the same words twice in a row are said aloud again.
    setAnnouncement("")
    requestAnimationFrame(() => setAnnouncement(text))
  }

  useEffect(() => {
    if (!copied) return
    // Focus moves to the copy, at the top of the list.
    requestAnimationFrame(() => focusShown(`[data-resume-link="${copied}"]`))
    const timer = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const duplicate = (resume: ResumeWithId) => {
    const id = onDuplicate(resume)
    if (!id) return
    setCopied(id)
    announce(`Made a copy of ${nameOf(resume)}`)
  }

  // Enter or leaving the box saves the name; Escape keeps the old one.
  const finishRenaming = (resume: ResumeWithId, save: boolean) => {
    if (renaming?.id !== resume.id) return
    if (save) onRename(resume, renaming.draft)
    setRenaming(null)
    requestAnimationFrame(() => focusShown(`[data-rename="${resume.id}"]`))
  }

  const download = async (resume: ResumeWithId) => {
    // Each try takes back the resume's last "Downloaded", so it never shows beside a failure.
    setDownloaded(({ [resume.id]: _, ...others }) => others)
    setDownloading((ids) => [...ids, resume.id])
    try {
      await downloadResume(resume)
      setFailed(({ [resume.id]: _, ...others }) => others)
      const at = Date.now()
      setDownloaded((all) => ({ ...all, [resume.id]: at }))
      announce(`Downloaded ${nameOf(resume)}`)
      // Only this download's confirmation goes; a newer one keeps its two seconds.
      setTimeout(
        () =>
          setDownloaded((all) => {
            if (all[resume.id] !== at) return all
            const { [resume.id]: _, ...others } = all
            return others
          }),
        DOWNLOADED_MS,
      )
    } catch (error) {
      console.error("Failed to build PDF:", error)
      setFailed((all) => ({ ...all, [resume.id]: nextFailure(all[resume.id], error) }))
    } finally {
      setDownloading((ids) => ids.filter((id) => id !== resume.id))
    }
  }

  const header = "label-mono border-b border-rule py-3.5 text-left font-normal text-ink-2"
  const cell = "border-b border-rule py-[18px]"

  const thumbnail = (resume: ResumeWithId) => (
    <Image
      src={templateById(resume.selectedTemplate).image}
      alt=""
      width={46}
      height={60}
      className="h-[60px] w-[46px] shrink-0 bg-sheet object-cover object-top ring-1 ring-rule"
    />
  )

  // The name, which opens the resume, or a box to rename it in.
  const name = (resume: ResumeWithId, className: string) =>
    renaming?.id === resume.id ? (
      <input
        aria-label="Resume name"
        value={renaming.draft}
        placeholder="Untitled resume"
        maxLength={200}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setRenaming({ id: resume.id, draft: event.target.value })}
        onBlur={() => finishRenaming(resume, true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finishRenaming(resume, true)
          else if (event.key === "Escape") finishRenaming(resume, false)
        }}
        className="w-full min-w-0 border-0 border-b border-accent bg-transparent py-0.5 font-serif text-[21px] leading-tight text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none"
      />
    ) : (
      <Link href={`/create/new/${resume.id}`} title={nameOf(resume)} data-resume-link={resume.id} className={className}>
        {nameOf(resume)}
      </Link>
    )

  const actions = (resume: ResumeWithId) => (
    <>
      <Link href={`/create/new/${resume.id}`} className="px-2 py-2.5 text-sm underline underline-offset-4 hover:decoration-2">
        Open
      </Link>
      <button
        type="button"
        onClick={() => download(resume)}
        disabled={downloading.includes(resume.id)}
        className="inline-flex items-center gap-1.5 px-2 py-2.5 text-sm text-ink-2 transition-colors hover:text-ink disabled:cursor-wait"
      >
        {downloading.includes(resume.id) ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          resume.id in downloaded && <Check className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {resume.id in downloaded ? "Downloaded" : "Download"}
      </button>
      <button type="button" onClick={() => duplicate(resume)} className="px-2 py-2.5 text-sm text-ink-2 transition-colors hover:text-ink">
        Duplicate
      </button>
      <button
        type="button"
        data-rename={resume.id}
        onClick={() => setRenaming({ id: resume.id, draft: resume.resumeTitle ?? "" })}
        className="px-2 py-2.5 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={() => onDelete(resume)}
        className="py-2.5 pl-2 pr-2 text-sm text-ink-2 transition-colors hover:text-[#b42318] md:pr-0"
      >
        Delete
      </button>
    </>
  )

  // The latest copies, in case one was renamed or deleted since.
  const failedResumes = resumes.filter((resume) => failed[resume.id])

  return (
    <>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {failedResumes.length > 0 && (
        <div className="mb-6 flex max-w-[720px] flex-col gap-4">
          {failedResumes.map((resume) => (
            <DownloadFailed
              key={`${resume.id}-${failed[resume.id].count}`}
              failure={failed[resume.id]}
              title={nameOf(resume)}
              retrying={downloading.includes(resume.id)}
              onRetry={() => download(resume)}
            />
          ))}
        </div>
      )}

      {/* Phones: one card per resume, with its actions underneath. */}
      <ul className="border-t border-ink md:hidden">
        {resumes.map((resume) => (
          <li
            key={resume.id}
            className={`flex gap-4 border-b border-rule pb-3 pt-5 transition-colors duration-700 ${resume.id === copied ? "bg-accent/5" : ""}`}
          >
            {thumbnail(resume)}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {name(resume, "line-clamp-2 font-serif text-[21px] leading-tight wrap-anywhere")}
              <span className="text-[13px] text-ink-2">
                {[resume.resumeTag && tagName(resume.resumeTag), templateById(resume.selectedTemplate).name].filter(Boolean).join(" · ")}
              </span>
              <span className="font-mono text-[12px] text-ink-2">{formatEdited(resume.updatedAt)}</span>
              <div className="-ml-2 mt-1 flex flex-wrap">{actions(resume)}</div>
            </div>
          </li>
        ))}
      </ul>

      {/* Relative, so the screen-reader-only header can't widen the page past the scroll box. */}
      <div className="relative hidden overflow-x-auto border-t border-ink md:block">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className={header}>
                Resume
              </th>
              <th scope="col" className={header}>
                Template
              </th>
              <th scope="col" className={header}>
                Last edited
              </th>
              <th scope="col" className={header}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {resumes.map((resume) => (
              <tr key={resume.id} className={`transition-colors duration-700 ${resume.id === copied ? "bg-accent/5" : ""}`}>
                {/* A name breaks anywhere it has to, so however long it is, it can't
                    widen the table and push the other columns off the screen. Past
                    two lines it's cut short, and shown in full on hover. */}
                <td className={`${cell} pr-8`}>
                  <div className="flex items-center gap-[18px]">
                    {thumbnail(resume)}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {name(
                        resume,
                        "line-clamp-2 font-serif text-[21px] leading-tight wrap-anywhere hover:underline hover:underline-offset-4",
                      )}
                      {resume.resumeTag && <span className="text-[13px] text-ink-2">{tagName(resume.resumeTag)}</span>}
                    </div>
                  </div>
                </td>
                {/* On one line each, so the name gets the rest of the row. */}
                <td className={`${cell} whitespace-nowrap pr-6 text-[15px]`}>{templateById(resume.selectedTemplate).name}</td>
                <td className={`${cell} whitespace-nowrap pr-6 font-mono text-[13px] text-ink-2`}>{formatEdited(resume.updatedAt)}</td>
                <td className={`${cell} whitespace-nowrap text-right`}>{actions(resume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
