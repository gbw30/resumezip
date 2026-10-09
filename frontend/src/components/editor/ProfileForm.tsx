"use client"

import { useEffect, useRef } from "react"
import { useResumeContext } from "@/context/ResumeContext"
import { useCheck } from "./CheckContext"
import { Field, SectionHeading } from "./fields"
import { FIELD_SPAN, PROFILE_FIELDS } from "./sections"

export default function ProfileForm({ position }: { position: string }) {
  const { formData, updateFormData } = useResumeContext()
  const profile = formData.profileSection ?? {}
  const form = useRef<HTMLElement>(null)

  // What the checker points at here, while the person fixes it.
  const { target, pending, claim } = useCheck()
  const flagged = target?.finding.place.kind === "profile" ? target.finding.place.field : null

  // When the person chooses a finding here, move to its field, just once.
  useEffect(() => {
    const place = target?.finding.place
    if (!target || place?.kind !== "profile" || !pending(target.request)) return
    const timer = setTimeout(() => {
      if (!claim(target.request)) return
      const input = form.current?.querySelector<HTMLElement>(`[data-field="${place.field}"] input`)
      input?.focus({ preventScroll: true })
      input?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      })
    })
    return () => clearTimeout(timer)
  }, [target, pending, claim])

  return (
    <div className="@container flex flex-col gap-8">
      <SectionHeading position={position} title="Profile" />
      <section ref={form} className="grid grid-cols-2 gap-x-7 gap-y-6 border-t border-ink pt-6 @lg:grid-cols-4">
        {PROFILE_FIELDS.map((field) => (
          <Field
            key={field.key}
            name={field.key}
            label={field.label}
            placeholder={field.placeholder}
            type={field.inputType}
            autoComplete={field.autoComplete}
            web={field.web}
            value={profile[field.key] ?? ""}
            onChange={(value) => updateFormData("profileSection", { ...profile, [field.key]: value })}
            className={FIELD_SPAN[field.size]}
            flag={flagged === field.key ? target!.finding : null}
          />
        ))}
      </section>
    </div>
  )
}
