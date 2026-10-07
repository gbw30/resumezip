"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepSavedData } from "@/lib/keepSavedData"
import type { ResumeContent } from "@/lib/resumeFile"
import { createResumeStore, INITIAL_STATE, type Resume, type ResumeState } from "@/lib/resumeStore"
import { getStorage } from "@/lib/resumeStorage"

export type { Resume } from "@/lib/resumeStore"

/** What changes the resumes. Each keeps the same identity for as long as the page is open. */
interface ResumeActions {
  setCurrentResumeId: (id: string | null) => void;
  createNewResume: (title: string, tag: string, template?: string) => string;
  importResume: (content: ResumeContent, title: string, options?: { keepId?: boolean }) => string;
  replaceResume: (id: string, content: ResumeContent) => void;
  deleteResume: (id: string) => void;
  deleteUnreadable: () => void;
  /** The resumes as they are now, for event handlers that don't need to re-render with every change. */
  getState: () => ResumeState;
}

interface ResumeContextValue extends ResumeState, ResumeActions {
  currentResumeId: string | null;
  /** The open resume, or {} when none is open. */
  formData: Resume;
  /** Changes a field of the open resume. */
  updateFormData: (section: string, data: unknown) => void;
}

const ResumeContext = createContext<ResumeContextValue | null>(null);
const ResumeActionsContext = createContext<ResumeActions | null>(null);

const getInitialState = () => INITIAL_STATE;

export const FormProvider = ({ children }: { children: React.ReactNode }) => {
  // Resumes only live in this browser's localStorage; there are no accounts.
  // lib/resumeStore.ts keeps them, and decides when to save them.
  const [store] = useState(() => createResumeStore());
  const state = useSyncExternalStore(store.subscribe, store.getState, getInitialState);
  const [currentResumeId, setCurrentResumeId] = useState<string | null>(null);

  // Read the saved resumes once the page is in the browser, take in what
  // other tabs save, and save what's waiting before the page is closed or
  // hidden (as when switching apps on a phone).
  useEffect(() => {
    const storage = getStorage();
    store.load(storage);
    const onStorage = (event: StorageEvent) => {
      // Only localStorage; sessionStorage changes in a same-origin frame fire this too.
      if (storage && event.storageArea === storage) store.receive(event.key, event.newValue);
    };
    const flush = () => store.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") store.flush();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", flush);
    // And when the window loses focus, as when clicking into another window
    // with the same resume open, so its changes are saved before typing there.
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      store.flush();
    };
  }, [store]);

  // Once there's a resume, ask the browser not to delete it to make room;
  // once a page is enough.
  const hasResumes = Object.keys(state.resumes).length > 0;
  const askedToKeep = useRef(false);
  useEffect(() => {
    const storage = getStorage();
    if (!hasResumes || !storage || askedToKeep.current) return;
    askedToKeep.current = true;
    void keepSavedData(storage);
  }, [hasResumes]);

  const actions = useMemo<ResumeActions>(
    () => ({
      setCurrentResumeId,
      createNewResume: (title, tag, template) => {
        const id = store.create(title, tag, template);
        setCurrentResumeId(id);
        return id;
      },
      importResume: store.importResume,
      replaceResume: store.replace,
      deleteResume: (id) => {
        store.remove(id);
        setCurrentResumeId((current) => (current === id ? null : current));
      },
      deleteUnreadable: store.deleteUnreadable,
      getState: store.getState,
    }),
    [store],
  );

  const formData = useMemo<Resume>(
    () => (currentResumeId && Object.hasOwn(state.resumes, currentResumeId) ? state.resumes[currentResumeId] : {}),
    [currentResumeId, state.resumes],
  );

  const updateFormData = useCallback(
    (section: string, data: unknown) => {
      if (currentResumeId) store.edit(currentResumeId, section, data);
    },
    [store, currentResumeId],
  );

  const value = useMemo<ResumeContextValue>(
    () => ({ ...state, ...actions, currentResumeId, formData, updateFormData }),
    [state, actions, currentResumeId, formData, updateFormData],
  );

  return (
    <ResumeActionsContext.Provider value={actions}>
      <ResumeContext.Provider value={value}>{children}</ResumeContext.Provider>
    </ResumeActionsContext.Provider>
  );
};

export const useResumeContext = () => {
  const context = useContext(ResumeContext);
  if (!context) throw new Error("useResumeContext must be used inside FormProvider");
  return context;
};

/** Only what changes the resumes. A component using just this doesn't re-render when a resume changes. */
export const useResumeActions = () => {
  const actions = useContext(ResumeActionsContext);
  if (!actions) throw new Error("useResumeActions must be used inside FormProvider");
  return actions;
};
