"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type CSSProperties } from "react"

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms & privacy" },
  { href: "/contact", label: "Contact" },
]

// How much of the zipper has to show before it zips shut.
const SHUT_AT = 0.9

/**
 * The page's end: the logo's key at full width, as on the social card. It's
 * zipped shut as it is without scripts or with reduced motion. Otherwise it
 * waits open, and zips shut as the visitor scrolls to it.
 */
export default function SiteFooter() {
  const zipper = useRef<HTMLDivElement>(null)
  // `live` is whether a change moves it. Where it is at the first look (not on
  // screen yet, or already) is set without moving, so it never opens in view.
  const [zip, setZip] = useState({ shut: true, live: false })

  useEffect(() => {
    const track = zipper.current
    if (!track || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let looked = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        const first = !looked
        looked = true
        // Once it's nearly all in view, not as it peeks in. (Measured by how much of it shows, not by a margin
        // from the window's edge: a tall window's margin would be taller than what the page leaves under it.)
        setZip((now) => ({ shut: entry.intersectionRatio >= SHUT_AT, live: now.live || !first }))
      },
      { threshold: [0, SHUT_AT] },
    )
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  return (
    <footer
      className={`zip-footer bg-[#171717] font-system text-white ${zip.live ? "zip-moves" : ""}`}
      style={{ "--zip": zip.shut ? 1 : 0 } as CSSProperties}
    >
      <div className="mx-auto max-w-[1440px] px-5 pt-16 md:px-10">
        {/* Its left edge is the ring's width and a little more in from the margin, as the wordmark sits on the social card. */}
        <Link
          href="/"
          className="ml-[calc(37*var(--u))] block w-fit font-logo text-[56px] font-medium leading-none tracking-[-0.03em] transition-opacity hover:opacity-80 md:text-[80px]"
        >
          resumezip
        </Link>
      </div>
      <div ref={zipper} aria-hidden="true" className="zipper mt-6">
        <div className="zipper-bar" />
        <div className="zipper-teeth-open" />
        <div className="zipper-teeth" />
        <div className="zipper-pull" />
      </div>
      <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-6 px-5 pb-10 pt-12 md:px-10">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="label-caps text-white/90 transition-colors hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="label-caps text-white/70">© 2026 resumezip</span>
      </div>
    </footer>
  )
}
