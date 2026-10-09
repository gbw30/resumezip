"use client"
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { keepSavedData } from "@/lib/keepSavedData"
import type { Resume, ResumeContent, ResumeField } from "@/lib/resume"
import { getStorage } from "@/lib/resumeKeys"
import { createResumeStore, INITIAL_STATE, type ResumeState, type ResumeStore } from "@/lib/resumeStore"

/** What changes the resumes. Each keeps the same identity until the page leaves the dashboard and editor. */
interface ResumeActions {
  setCurrentResumeId: (id: string | null) => void
  createNewResume: (title: string, tag: string, template?: string) => string
  importResume: (content: ResumeContent, title: string, options?: { keepId?: boolean }) => string
  replaceResume: (id: string, content: ResumeContent) => void
  undoReplace: (id: string) => void
  deleteResume: (id: string) => void
  deleteUnreadable: () => void
}

interface ResumeContextValue extends ResumeState, ResumeActions {
  currentResumeId: string | null
  /** The open resume, or {} when none is open. */
  formData: Resume
  /** Changes a field of the open resume. */
  updateFormData: <Field extends ResumeField>(field: Field, value: Resume[Field]) => void
}

const ResumeContext = createContext<ResumeContextValue | null>(null)

const getInitialState = () => INITIAL_STATE

// Resumes only live in this browser's localStorage; there are no accounts.
// lib/resumeStore.ts keeps them, and decides when to save them. The page has
// one store, from the first time it needs the resumes until it's closed, so
// going to another page keeps what isn't saved yet, as when the browser won't
// save anything. The server renders with an empty store of its own.
let pageStore: ResumeStore | null = null
const storeOfPage = () => (typeof window === "undefined" ? createResumeStore() : (pageStore ??= createResumeStore()))

/**
 * The page's resumes, read from storage the first time they're needed: by
 * the dashboard or the editor, or by a link that starts a new resume. Only in
 * the browser.
 */
export function openResumes(): ResumeStore {
  const store = storeOfPage()
  if (store.getState().loaded) return store
  const storage = getStorage()
  store.load(storage)

  // Take in what other tabs save, and save what's waiting before the page is
  // closed or hidden (as when switching apps on a phone).
  window.addEventListener("storage", (event) => {
    // Only localStorage; sessionStorage changes in a same-origin frame fire this too.
    if (storage && event.storageArea === storage) store.receive(event.key, event.newValue)
  })
  const flush = () => store.flush()
  window.addEventListener("pagehide", flush)
  // And when the window loses focus, as when clicking into another window
  // with the same resume open, so its changes are saved before typing there.
  window.addEventListener("blur", flush)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") store.flush()
  })

  // Closing or reloading the page with changes not saved yet saves them first,
  // and asks if that fails. The listener is only there while something is
  // unsaved, as some browsers can't keep a page that has one for the back
  // button. It follows the store as it changes, not a render later, so a
  // change made just before closing is covered.
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    store.flush()
    if (!store.getState().unsaved) return
    event.preventDefault()
    // What browsers before Chrome 119 need to ask.
    event.returnValue = true
  }
  let listening = false
  // Once there's a resume, ask the browser not to delete it to make room;
  // once a page is enough.
  let askedToKeep = false
  const follow = () => {
    const { unsaved, resumes } = store.getState()
    if (unsaved !== listening) {
      listening = unsaved
      if (unsaved) window.addEventListener("beforeunload", onBeforeUnload)
      else window.removeEventListener("beforeunload", onBeforeUnload)
    }
    if (!askedToKeep && storage && Object.keys(resumes).length > 0) {
      askedToKeep = true
      void keepSavedData(storage)
    }
  }
  follow()
  store.subscribe(follow)
  return store
}

/** Shares the resumes with the dashboard and the editor. */
export const FormProvider = ({ children }: { children: React.ReactNode }) => {
  const [store] = useState(storeOfPage)
  const state = useSyncExternalStore(store.subscribe, store.getState, getInitialState)
  const [currentResumeId, setCurrentResumeId] = useState<string | null>(null)

  // Read the saved resumes once the page is in the browser, unless a page before this one did.
  useEffect(() => void openResumes(), [])

  const actions = useMemo<ResumeActions>(
    () => ({
      setCurrentResumeId,
      createNewResume: (title, tag, template) => {
        const id = store.create(title, tag, template)
        setCurrentResumeId(id)
        return id
      },
      importResume: store.importResume,
      replaceResume: store.replace,
      undoReplace: store.undoReplace,
      deleteResume: (id) => {
        store.remove(id)
        setCurrentResumeId((current) => (current === id ? null : current))
      },
      deleteUnreadable: store.deleteUnreadable,
    }),
    [store],
  )

  const formData = useMemo<Resume>(
    () => (currentResumeId && Object.hasOwn(state.resumes, currentResumeId) ? state.resumes[currentResumeId] : {}),
    [currentResumeId, state.resumes],
  )

  const updateFormData = useCallback(
    <Field extends ResumeField>(field: Field, value: Resume[Field]) => {
      if (currentResumeId) store.edit(currentResumeId, field, value)
    },
    [store, currentResumeId],
  )

  const value = useMemo<ResumeContextValue>(
    () => ({ ...state, ...actions, currentResumeId, formData, updateFormData }),
    [state, actions, currentResumeId, formData, updateFormData],
  )

  return <ResumeContext.Provider value={value}>{children}</ResumeContext.Provider>
}

export const useResumeContext = () => {
  const context = useContext(ResumeContext)
  if (!context) throw new Error("useResumeContext must be used inside FormProvider")
  return context
}
