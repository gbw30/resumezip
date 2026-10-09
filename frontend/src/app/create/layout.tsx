import type React from "react"
import { FormProvider } from "@/context/ResumeContext"

// Only the dashboard and the editor read the saved resumes. Other pages'
// links to them check that there are some by their keys alone
// (components/site/StartWriting.tsx).
export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <FormProvider>{children}</FormProvider>
}
