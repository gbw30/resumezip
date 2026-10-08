"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Menu, X } from "lucide-react"
import Logo from "./Logo"
import { StartWritingLink } from "./StartWriting"

const LINKS = [
  { href: "/templates", label: "Templates" },
  { href: "/create/dashboard", label: "Your resumes" },
  { href: "/about", label: "About" },
]

const CTA = "label-caps items-center whitespace-nowrap bg-accent px-[18px] text-white transition-colors hover:bg-[#2550d4]"

interface SiteHeaderProps {
  /**
   * "overlay" sits on top of the home page's video; "light" is for every other page.
   * Only the colors differ, so nothing moves when you go from one page to another.
   */
  variant?: "overlay" | "light"
}

export default function SiteHeader({ variant = "light" }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const overlay = variant === "overlay"

  useEffect(() => {
    if (!menuOpen) return
    // The menu covers the top of the page, so a tap elsewhere closes it, and what was tapped keeps the focus.
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setMenuOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [menuOpen])

  return (
    <header
      ref={headerRef}
      className={`relative font-system ${overlay ? "z-10 text-white" : "z-30 border-b border-rule bg-paper text-ink"}`}
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-5 md:h-[72px] md:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-logo text-[24px] font-medium tracking-[-0.02em] transition-opacity hover:opacity-80"
        >
          <Logo className="h-5 w-auto" />
          resumezip
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`label-caps transition-colors ${overlay ? "text-white/90 hover:text-white" : "text-ink-2 hover:text-ink"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Phones don't have room for it next to the logo, so it moves into the menu. */}
          <StartWritingLink className={`${CTA} hidden h-10 sm:inline-flex`}>Start writing</StartWritingLink>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Drops over the page instead of pushing it down. Once it starts to
          close, inert keeps the keyboard out of it; once closed, visibility
          (which changes at the end of its transition) hides it too. */}
      <nav
        aria-label="Main"
        inert={!menuOpen}
        className={`absolute inset-x-0 top-full flex flex-col px-5 pb-4 transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none md:hidden ${
          overlay ? "bg-black/60 backdrop-blur" : "border-y border-rule bg-paper shadow-[0_18px_40px_-16px_rgba(17,19,24,0.3)]"
        } ${menuOpen ? "" : "invisible -translate-y-2 opacity-0"}`}
      >
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMenuOpen(false)}
            className={`label-caps py-3 ${overlay ? "text-white" : "text-ink"}`}
          >
            {link.label}
          </Link>
        ))}
        <StartWritingLink className={`${CTA} mt-2 inline-flex h-11 justify-center sm:hidden`}>Start writing</StartWritingLink>
      </nav>
    </header>
  )
}
