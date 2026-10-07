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
