// The dashboard's icon buttons. Each icon is drawn in parts that move when
// it's pointed at (see "Row actions" in app/globals.css): the copy lifts off,
// the arrow bobs into the tray, the bin's lid tips open, the pencil writes.

import type { ReactNode } from "react"

interface RowActionProps {
  label: string
  onClick: () => void
  children: ReactNode
  /** Red when pointed at, as it deletes. */
  danger?: boolean
  disabled?: boolean
  busy?: boolean
  /** The label's tip lines up with the button's right edge, so it stays inside the row. */
  tipAtEnd?: boolean
  className?: string
  [data: `data-${string}`]: string
}

export function RowAction({ label, onClick, children, danger, disabled, busy, tipAtEnd, className = "", ...data }: RowActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={busy || undefined}
      onClick={onClick}
      disabled={disabled}
      {...data}
      className={`row-action group/action relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-[color,background-color] duration-200 hover:bg-ink/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-wait ${
        danger ? "hover:text-alert" : "hover:text-ink"
      } ${className}`}
    >
      {children}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-full z-10 mb-1 translate-y-1 whitespace-nowrap rounded-[3px] bg-ink px-2 py-1 font-mono text-[11px] leading-none text-paper opacity-0 transition duration-150 group-hover/action:translate-y-0 group-hover/action:opacity-100 group-hover/action:delay-300 group-focus-visible/action:translate-y-0 group-focus-visible/action:opacity-100 ${
          tipAtEnd ? "right-0" : "left-1/2 -translate-x-1/2"
        }`}
      >
        {label}
      </span>
    </button>
  )
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const

/** Two sheets; the front one lifts off the back one. `copied` plays it once more, as a copy is made. */
export function CopyIcon({ copied }: { copied?: boolean }) {
  return (
    <svg {...iconProps} className={copied ? "is-copied" : undefined}>
      <path className="copy-back" d="M15 17.5v1A2.5 2.5 0 0 1 12.5 21h-6A2.5 2.5 0 0 1 4 18.5v-8A2.5 2.5 0 0 1 6.5 8h1" />
      <rect className="copy-front" x="9.5" y="3" width="10.5" height="12.5" rx="2.5" />
    </svg>
  )
}

/** An arrow into a tray: it drops in over and over while downloading, and becomes a tick once done. */
export function DownloadIcon({ state }: { state: "idle" | "busy" | "done" }) {
  if (state === "done")
    return (
      <svg {...iconProps}>
        <path className="tick" pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    )
  return (
    <svg {...iconProps}>
      <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" />
      <g className={state === "busy" ? "download-arrow is-busy" : "download-arrow"}>
        <path d="M12 4v10.5" />
        <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      </g>
    </svg>
  )
}

/** A bin whose lid tips open. */
export function TrashIcon() {
  return (
    <svg {...iconProps}>
      <g className="trash-lid">
        <path d="M4 7h16" />
        <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      </g>
      <path d="m6 7 .85 11.2A2 2 0 0 0 8.84 20h6.32a2 2 0 0 0 1.99-1.8L18 7" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  )
}

/** A pencil that writes. */
export function PencilIcon() {
  return (
    <svg {...iconProps} width={17} height={17}>
      <g className="pencil">
        <path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
        <path d="m13.5 6.5 3 3" />
      </g>
    </svg>
  )
}
