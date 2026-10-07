/**
 * Wide enough for the editor's split view: the left bar, the form and the
 * preview side by side. Narrower, the sections are a row of tabs above the
 * form, and an Edit / Preview switch shows one or the other.
 *
 * At 1280px the form gets about 360px, as much as on a phone. Any narrower and
 * the left bar and the preview squeeze it. This is Tailwind's `xl`, which the
 * editor's layout classes use. It's in rem like Tailwind's, so the two agree
 * even when the browser's text size isn't the usual 16px.
 */
export const WIDE_SCREEN = "(min-width: 80rem)"

/** The part of the window that the editor's pinned bars (on narrower screens) leave uncovered. */
export function uncovered() {
  let top = 0
  let bottom = window.innerHeight
  for (const bar of document.querySelectorAll<HTMLElement>("[data-covers]")) {
    const { position } = getComputedStyle(bar)
    const box = bar.getBoundingClientRect()
    if ((position !== "sticky" && position !== "fixed") || !box.height) continue
    if (bar.dataset.covers === "top") top = Math.max(top, box.bottom)
    else bottom = Math.min(bottom, box.top)
  }
  return { top, bottom }
}
