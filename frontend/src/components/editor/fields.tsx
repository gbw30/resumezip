"use client"

import type React from "react"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Pencil } from "lucide-react"
import type { Finding } from "@/lib/check/engine"
import { LEVELS } from "@/lib/check/settings"

interface FieldProps {
  label: string
  value: string
  placeholder?: string
  type?: string
  className?: string
  onChange: (value: string) => void
  /** The field's key, so the checker can find it on the page. */
  name?: string
  /** What the checker found here, while the person is fixing it. */
  flag?: Finding | null
}

/**
 * What the checker found where the person is fixing it, and why it matters.
 * It says how sure the checker is in words, so the field's color isn't the
 * only sign.
 */
export function FlagNote({ id, finding }: { id?: string; finding: Finding }) {
  return (
    <div
      id={id}
      className={`flex flex-col gap-0.5 border-l-2 pl-3 text-[13px] leading-normal ${
        finding.level === "fix" ? "border-[#b42318]" : "border-accent"
      }`}
    >
      <p className="text-ink">
        <span className="font-medium">{LEVELS[finding.level].name}:</span> {finding.message}
      </p>
      <p className="text-ink-2">{finding.why}</p>
      {finding.suggestion && <p className="text-ink-2">{finding.suggestion}</p>}
    </div>
  )
}

/** A labelled, underlined text input. */
export function Field({ label, value, placeholder, type = "text", className = "", onChange, name, flag }: FieldProps) {
  const noteId = useId()
  return (
    <div data-field={name} className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="label-mono text-ink-2">{label}</span>
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={flag ? noteId : undefined}
          aria-invalid={flag?.level === "fix" || undefined}
          className={`w-full min-w-0 border-0 bg-transparent py-2 text-base text-ink outline-none transition-colors placeholder:text-ink-2/50 focus-visible:outline-none ${
            !flag
              ? "border-b border-rule-strong focus:border-accent"
              : flag.level === "fix"
                ? "border-b-2 border-[#b42318]"
                : "border-b-2 border-accent"
          }`}
        />
      </label>
      {flag && <FlagNote id={noteId} finding={flag} />}
    </div>
  )
}

/** Selects a line's words in a bullets textarea, after its "• ", to point at one bullet. */
export function selectLine(textarea: HTMLTextAreaElement, line: number) {
  const lines = textarea.value.split("\n")
  if (line < 0 || line >= lines.length) return
  const start = lines.slice(0, line).reduce((total, text) => total + text.length + 1, 0)
  const bullet = lines[line].match(/^•\s*/)?.[0].length ?? 0
  textarea.setSelectionRange(start + bullet, start + lines[line].length)
}

/**
 * Buttons that move something up or down one place in its list. At either
 * end, the button that can't move it stays where it is (and focusable, so
 * the focus isn't lost when something reaches the end), but does nothing.
 */
export function MoveButtons({ name, first, last, onMove }: { name: string; first: boolean; last: boolean; onMove: (by: -1 | 1) => void }) {
  return (
    <span className="flex shrink-0 items-center">
      {([-1, 1] as const).map((by) => {
        const end = by < 0 ? first : last
        const Icon = by < 0 ? ArrowUp : ArrowDown
        return (
          <button
            key={by}
            type="button"
            data-move={by}
            onClick={() => !end && onMove(by)}
            aria-label={`Move ${name} ${by < 0 ? "up" : "down"}`}
            aria-disabled={end || undefined}
            className="rounded-[4px] p-1.5 text-ink-2 transition-colors hover:text-ink aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:text-ink-2"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      })}
    </span>
  )
}

// Sets a textarea's height to show all its text, so it never scrolls inside.
function fitHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto"
  textarea.style.height = `${textarea.scrollHeight + 2}px`
}

// Every non-empty line starts with "• " so the textarea reads like the PDF.
function withBullets(text: string) {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim() || line === "•") return line
      if (/^•([^\s]|$)/.test(line)) return line.replace(/^•/, "• ")
      return line.startsWith("• ") ? line : `• ${line}`
    })
    .join("\n")
}

// A keyboard shortcut as this device writes it: ⌘B on a Mac, Ctrl+B elsewhere.
const shortcut = (key: string) => (/Mac|iPhone|iPad/.test(navigator.platform) ? `⌘${key}` : `Ctrl+${key}`)

/**
 * A textarea for bullet points: one per line, and Enter starts a new bullet.
 * **Bold**, *italic* and ***both*** print that way; ⌘B and ⌘I add or remove the marks.
 */
export function BulletsField({ label, value, placeholder, className = "", onChange, name, flag }: FieldProps) {
  const text = withBullets(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()
  const noteId = useId()

  // Grow to fit the text instead of scrolling inside the box.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (textarea) fitHeight(textarea)
  }, [text])

  // A narrower box wraps onto more lines, so fit again when the width changes:
  // resizing the window, turning a tablet, or the box showing after being hidden.
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    let width = textarea.clientWidth
    let frame = 0
    const observer = new ResizeObserver(() => {
      const next = textarea.clientWidth
      // Hidden while the preview shows on small screens: nothing to fit until it's back.
      if (!next || next === width) return
      width = next
      // On the next frame: changing the box's height while it's being
      // measured would make the browser report a ResizeObserver loop.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => fitHeight(textarea))
    })
    observer.observe(textarea)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  // Adds or removes a mark around the selected words, ** for bold or * for italic, keeping them selected.
  const toggleMark = (textarea: HTMLTextAreaElement, size: 1 | 2) => {
    let { selectionStart: start, selectionEnd: end } = textarea
    while (start < end && /\s/.test(text[start])) start++
    while (end > start && /\s/.test(text[end - 1])) end--
    // Asterisks already around the words: one for italic, two for bold, three for both.
    let before = 0
    while (before < 3 && text[start - 1 - before] === "*") before++
    let after = 0
    while (after < 3 && text[end + after] === "*") after++
    const marks = Math.min(before, after)
    const marked = size === 2 ? marks >= 2 : marks === 1 || marks === 3
    const stars = "*".repeat(size)
    const next = marked
      ? text.slice(0, start - size) + text.slice(start, end) + text.slice(end + size)
      : text.slice(0, start) + stars + text.slice(start, end) + stars + text.slice(end)
    onChange(next)
    const shift = marked ? -size : size
    requestAnimationFrame(() => {
      textarea.selectionStart = start + shift
      textarea.selectionEnd = end + shift
    })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const key = event.key.toLowerCase()
    if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === "b" || key === "i")) {
      event.preventDefault()
      toggleMark(event.currentTarget, key === "b" ? 2 : 1)
      return
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return
    event.preventDefault()
    const textarea = event.currentTarget
    const { selectionStart: start, selectionEnd: end } = textarea
    const insert = text[start - 1] === "\n" ? "" : "\n• "
    onChange(text.slice(0, start) + insert + text.slice(end))
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + insert.length
    })
  }

  return (
    <div data-field={name} className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <label className="flex flex-col gap-2">
        <span className="label-mono text-ink-2">{label}</span>
        <textarea
          ref={textareaRef}
          aria-describedby={flag ? `${hintId} ${noteId}` : hintId}
          aria-invalid={flag?.level === "fix" || undefined}
          value={text}
          placeholder={placeholder ? `• ${placeholder}` : undefined}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className={`w-full resize-none overflow-hidden rounded-[4px] border bg-sheet px-3.5 py-3 text-[15px] leading-[1.7] text-ink outline-none transition-colors placeholder:text-ink-2/50 focus-visible:outline-none ${
            !flag
              ? "border-rule focus:border-accent"
              : flag.level === "fix"
                ? "border-[#b42318] ring-1 ring-[#b42318]"
                : "border-accent ring-1 ring-accent"
          }`}
        />
      </label>
      {flag && <FlagNote id={noteId} finding={flag} />}
      <span id={hintId} className="text-[13px] leading-normal text-ink-2">
        {window.matchMedia("(pointer: coarse)").matches ? (
          // No keyboard shortcuts on a touch screen, so show the marks to type.
          <>
            <span className="font-mono">**bold**</span> · <span className="font-mono">*italic*</span>
          </>
        ) : (
          <>
            <kbd className="font-mono">{shortcut("B")}</kbd> <strong className="font-semibold text-ink">bold</strong> ·{" "}
            <kbd className="font-mono">{shortcut("I")}</kbd> <em className="text-ink">italic</em>
          </>
        )}
      </span>
    </div>
  )
}

interface SectionHeadingProps {
  /** e.g. "03 / 08" */
  position: string
  title: string
  /** When given, the title can be renamed. */
  onRename?: (title: string) => void
  /** What the checker found about the section or its title, while the person is fixing it. */
  flag?: Finding | null
}

/** The big serif title at the top of each section, optionally renameable. */
export function SectionHeading({ position, title, onRename, flag }: SectionHeadingProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const save = () => {
    if (draft !== null && draft.trim() && draft.trim() !== title) onRename?.(draft.trim())
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-mono text-ink-2">{position}</span>
      {draft === null ? (
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.02em]">{title}</h1>
          {onRename && (
            <button
              type="button"
              aria-label="Rename section"
              title="Rename section"
              onClick={() => setDraft(title)}
              className="p-1.5 text-ink-2 transition-colors hover:text-ink"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <input
          aria-label="Section title"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save()
            if (event.key === "Escape") setDraft(null)
          }}
          className="w-full border-0 border-b-[1.5px] border-accent bg-transparent font-serif text-[40px] leading-[1.1] tracking-[-0.02em] outline-none focus-visible:outline-none"
        />
      )}
      {flag && <FlagNote finding={flag} />}
    </div>
  )
}
