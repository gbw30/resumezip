import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Newsreader, Outfit } from "next/font/google"
import "./globals.css"
import { FormProvider } from "@/context/ResumeContext"

// Self-hosted at build time, so visitors never load fonts from Google.
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
})
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
// The "resumezip" wordmark.
const outfit = Outfit({ subsets: ["latin"], weight: "500", variable: "--font-outfit" })

export const metadata: Metadata = {
  // Links and images below are relative to the live site.
  metadataBase: new URL("https://www.tryresumezip.com"),
  title: {
    default: "resumezip · Free resume builder, no sign-up",
    // Other pages set a short title, e.g. "Templates" becomes "Templates · resumezip".
    template: "%s · resumezip",
  },
  description: "Free, open-source resume builder that runs in your browser.",
  openGraph: {
    title: "resumezip · Free resume builder, no sign-up",
    description: "Free, open-source resume builder that runs in your browser.",
    url: "/",
    siteName: "resumezip",
    images: [
      {
        // The logo's key drawn as a zipper, with the home page headline.
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "resumezip: the resume builder that never sees your resume",
      },
    ],
    type: "website",
  },
  // X uses the Open Graph image above; this asks it to show the image full width.
  twitter: { card: "summary_large_image" },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`scroll-smooth ${newsreader.variable} ${geist.variable} ${geistMono.variable} ${outfit.variable}`}>
      <head>
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" type="image/x-icon" />
      </head>
      <body className="bg-paper font-sans text-ink antialiased">
        <FormProvider>{children}</FormProvider>
      </body>
    </html>
  )
}
