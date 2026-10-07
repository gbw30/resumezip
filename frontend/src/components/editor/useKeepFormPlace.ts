import { useEffect, type RefObject } from "react"
import { uncovered, WIDE_SCREEN } from "./layout"

// What marks a place in the form: the section title, each field, and the buttons between them.
const MARKERS = "h1, [data-field], button"

// For how many frames after a switch the place is put back again, as the
// browser can still move things while it settles into the new layout.
const SETTLE_FRAMES = 3

/**
 * On wide screens the form scrolls in its own pane, and on narrower ones with
 * the page. Crossing WIDE_SCREEN, by resizing the window or turning a tablet,
 * would put the form back at its top, so this keeps whatever was at the top
 * of the form's visible part there.
 */
export function useKeepFormPlace(form: RefObject<HTMLElement | null>, shown: boolean) {
  useEffect(() => {
    const pane = form.current
    if (!shown || !pane) return
    // Which layout is on screen, read from the page itself rather than the
    // media query, so it's right whichever order the browser reports things in.
    const inPane = () => getComputedStyle(pane).overflowY === "auto"
    let wide = inPane()
    let place: { marker: Element; offset: number } | null = null
    let settling = 0
    let frame = 0

    // Where the form starts to show: the pane's top on wide screens, below the pinned bars on narrower ones.
    const edge = () => (inPane() ? pane.getBoundingClientRect().top : uncovered().top)
    // On small screens it's hidden while the preview shows.
    const hidden = () => pane.getClientRects().length === 0

    const remember = () => {
      if (hidden()) return
      const top = edge()
      const marker = [...pane.querySelectorAll(MARKERS)].find((element) => element.getBoundingClientRect().bottom > top)
      place = marker ? { marker, offset: marker.getBoundingClientRect().top - top } : null
    }

    const restore = () => {
      if (!place?.marker.isConnected || hidden()) return
      // Twice, as on narrower screens the pinned bars only settle once the page has moved.
      for (let i = 0; i < 2; i++) {
        const by = place.marker.getBoundingClientRect().top - edge() - place.offset
        if (Math.abs(by) < 1) break
        const options: ScrollToOptions = { top: by, behavior: "instant" }
        if (inPane()) pane.scrollBy(options)
        else window.scrollBy(options)
      }
    }

    const settle = () => {
      restore()
      settling -= 1
      frame = settling > 0 ? requestAnimationFrame(settle) : 0
    }

    // Any of these can be the first sign of a switch. Between switches, a
    // scroll is the person's, so where they've got to is remembered.
    const update = () => {
      if (inPane() !== wide) {
        wide = !wide
        settling = SETTLE_FRAMES
        cancelAnimationFrame(frame)
        settle()
      } else if (settling === 0) {
        remember()
      }
    }
    const query = window.matchMedia(WIDE_SCREEN)
    window.addEventListener("resize", update)
    query.addEventListener("change", update)
    pane.addEventListener("scroll", update, { passive: true })
    window.addEventListener("scroll", update, { passive: true })
    return () => {
      window.removeEventListener("resize", update)
      query.removeEventListener("change", update)
      pane.removeEventListener("scroll", update)
      window.removeEventListener("scroll", update)
      cancelAnimationFrame(frame)
    }
  }, [form, shown])
}
