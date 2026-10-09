"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { savingData } from "@/lib/typst/compile"

// How long to show the poster, the clip's first frame, at each end of the
// clip. It doesn't loop seamlessly, so the video fades out to the poster and
// back in around the loop point instead of jumping.
const FADE_OUT_BEFORE_END = 0.45
const FADE_IN_AFTER_START = 0.12
// timeupdate comes up to 250 ms apart, so the fade out starts up to that much
// early, to be over before the loop.
const TIMEUPDATE_GAP = 0.25

/**
 * The home page's background clip: muted, looping, decorative. The poster
 * shows until the video plays, and instead of it for visitors who prefer
 * less motion or are saving data.
 *
 * The clips are H.264 without sound, with the index at the start so playing
 * can begin before the whole file is in. From the original:
 *   ffmpeg -i original.mp4 -an -c:v libx264 -preset veryslow -crf 25 -x264-params aq-mode=3 \
 *     -profile:v high -level 3.1 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 printer.mp4
 * and the same with `-vf crop=540:720` for printer-portrait.mp4.
 */
export default function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Added once the page has loaded, so the clip doesn't hold up the rest of it.
  const [sources, setSources] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || savingData()) return
    const add = () => setSources(true)
    if (document.readyState === "complete") add()
    else addEventListener("load", add, { once: true })
    return () => removeEventListener("load", add)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!sources || !video) return
    // React doesn't reliably set the muted attribute, which autoplay requires.
    video.muted = true
    const fade = () => {
      const t = video.currentTime
      setVisible(t > FADE_IN_AFTER_START && t < video.duration - FADE_OUT_BEFORE_END - TIMEUPDATE_GAP)
    }
    // Plays only while on screen. If autoplay is blocked, the poster stays.
    const observer = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1].isIntersecting) video.play().catch(() => {})
      else video.pause()
    })
    video.addEventListener("timeupdate", fade)
    observer.observe(video)
    return () => {
      observer.disconnect()
      video.removeEventListener("timeupdate", fade)
    }
  }, [sources])

  return (
    <div aria-hidden="true" className="absolute inset-0">
      <Image src="/video/printer-poster.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        {sources && (
          <>
            {/* The hero is at least as tall as the screen, so a screen no wider than 3:4 only shows the middle 3:4 of the
                clip, at its full height: printer-portrait.mp4 is just that. Browsers that ignore media on a source (Chrome
                and Firefox before 120) take the first one. */}
            <source src="/video/printer.mp4" type="video/mp4" media="(min-aspect-ratio: 3/4)" />
            <source src="/video/printer-portrait.mp4" type="video/mp4" />
          </>
        )}
      </video>
    </div>
  )
}
