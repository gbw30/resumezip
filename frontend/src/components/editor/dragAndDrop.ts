// The drag and drop for sections and entries isn't in the editor's first
// download, as it's only needed once something is dragged. SectionNav starts
// loading it as soon as the editor opens, and both use the one download.

export type DragAndDrop = typeof import("@hello-pangea/dnd")

let loading: Promise<DragAndDrop> | undefined
let loaded: DragAndDrop | null = null

/** Loads the drag and drop, once. If it fails to download, it stays failed, and nothing can be dragged. */
export function loadDragAndDrop(): Promise<DragAndDrop> {
  loading ??= import("@hello-pangea/dnd").then((module) => (loaded = module))
  return loading
}

/** The drag and drop, if it has loaded. */
export const loadedDragAndDrop = () => loaded
