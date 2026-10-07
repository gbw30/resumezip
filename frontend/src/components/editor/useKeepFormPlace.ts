import { useEffect, type RefObject } from "react"
import { uncovered, WIDE_SCREEN } from "./layout"

// What marks a place in the form: the section title, each field, and the buttons between them.
const MARKERS = "h1, [data-field], button"

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
    const query = window.matchMedia(WIDE_SCREEN)
    let wide = query.matches
    let place: { marker: Element; offset: number } | null = null

    // Where the form starts to show: the pane's top on wide screens, below the pinned bars on narrower ones.
    const edge = () => (query.matches ? pane.getBoundingClientRect().top : uncovered().top)
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
        if (query.matches) pane.scrollBy(options)
        else window.scrollBy(options)
      }
    }

    // After a switch, either a scroll (the page's height changing) or the
    // query's change can come first, so both look for one.
    const update = () => {
      if (query.matches === wide) return remember()
      wide = query.matches
      restore()
    }
    pane.addEventListener("scroll", update, { passive: true })
    window.addEventListener("scroll", update, { passive: true })
    query.addEventListener("change", update)
    return () => {
      pane.removeEventListener("scroll", update)
      window.removeEventListener("scroll", update)
      query.removeEventListener("change", update)
    }
  }, [form, shown])
}
