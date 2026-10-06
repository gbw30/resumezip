"use client";
import React, { createContext, useState, useEffect, useMemo, useRef } from "react";
import { DEFAULT_TEMPLATE } from "@/lib/templates"
import type { ResumeContent } from "@/lib/resumeFile"
import {
  canSaveOver,
  deleteKeptAside,
  getStorage,
  isKeptAside,
  loadResumes,
  readKeptAside,
  readResumes,
  RESUMES_KEY,
  saveResumes,
  type SaveStatus,
} from "@/lib/resumeStorage"
import { numberDuplicateTitles, uniqueTitle } from "@/lib/resumeTitles"

/** A resume as the editor stores it; its fields are listed in components/editor/sections.ts. */
export type Resume = Record<string, any>;

interface ResumeContextValue {
  /** Every resume saved in this browser, by id. */
  resumes: Record<string, Resume>;
  /** False until the saved resumes have been read from localStorage. */
  loaded: boolean;
  /** Whether the latest changes are saved in this browser, and if not, why. */
  saveStatus: SaveStatus;
  /** Saved data that couldn't be read, kept aside instead of being saved over. */
  unreadable: string[];
  deleteUnreadable: () => void;
  currentResumeId: string | null;
  /** The open resume, or {} when none is open. */
  formData: Resume;
  setCurrentResumeId: (id: string | null) => void;
  createNewResume: (title: string, tag: string, template?: string) => string;
  importResume: (content: ResumeContent, title: string, options?: { keepId?: boolean }) => string;
  replaceResume: (id: string, content: ResumeContent) => void;
  updateFormData: (section: string, data: unknown) => void;
  deleteResume: (id: string) => void;
}

const ResumeContext = createContext<ResumeContextValue | null>(null);

const blankResume = (template: string) => ({
  profileSection: {},
  headings: {},
  selectedTemplate: template,
  educationSection: [],
  workExperienceSection: [],
  projectsSection: [],
  publicationsSection: [],
  volunteerExperienceSection: [],
  skillsSection: [],
  leadershipExperienceSection: [],
  awardsSection: [],
  sectionOrder: ["Education", "Work", "Skills", "Projects", "Publications", "Volunteership", "Leadership", "Awards"],
});

export const FormProvider = ({ children }: { children: React.ReactNode }) => {
  const [resumes, setResumes] = useState<Record<string, Resume>>({});
  const [loaded, setLoaded] = useState(false);
  const [currentResumeId, setCurrentResumeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [unreadable, setUnreadable] = useState<string[]>([]);
  // localStorage, or null if the browser won't let the site use it.
  const storage = useRef<Storage | null>(null);
  // Off when the browser blocks saving, or when saving would replace saved data
  // that couldn't be read or kept aside.
  const canSave = useRef(false);

  // localStorage is the only copy of the user's resumes, so read it before
  // ever writing to it, and pick up changes made in other tabs. Reading never
  // throws (see lib/resumeStorage.ts).
  useEffect(() => {
    storage.current = getStorage();
    const saved = loadResumes(storage.current);
    // On first load, also number any resumes saved with the same name.
    setResumes(numberDuplicateTitles(saved.resumes));
    setSaveStatus(saved.status);
    canSave.current = saved.status === "saved";
    setUnreadable(readKeptAside(storage.current));
    setLoaded(true);

    const onStorage = (event: StorageEvent) => {
      // Only localStorage; sessionStorage changes in a same-origin frame fire this too.
      if (!storage.current || event.storageArea !== storage.current) return;
      // Another tab kept data aside or deleted it, or cleared everything.
      if (event.key === null || isKeptAside(event.key)) setUnreadable(readKeptAside(storage.current));
      if (event.key !== RESUMES_KEY || event.newValue === null) return;
      const changed = readResumes(storage.current, event.newValue);
      canSave.current = changed.status === "saved";
      if (!changed.unreadable) {
        setResumes(changed.resumes);
        return;
      }
      // Something saved what this tab can't fully read. This tab keeps its own
      // resumes, so they can still be saved or downloaded.
      setUnreadable(readKeptAside(storage.current));
      if (canSave.current) {
        // It's been kept aside, so save them back over it.
        setResumes((current) => ({ ...current }));
      } else {
        // It couldn't be kept aside, so stop saving instead of replacing it.
        setSaveStatus(changed.status);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const formData = useMemo(() => {
    return currentResumeId ? resumes[currentResumeId] || {} : {};
  }, [currentResumeId, resumes]);

  // Save to localStorage on change, and show whether that worked. If saving
  // was stopped to protect saved data, first check whether it can start again.
  useEffect(() => {
    if (!loaded) return;
    if (!canSave.current && storage.current && canSaveOver(storage.current)) {
      canSave.current = true;
      setUnreadable(readKeptAside(storage.current));
    }
    if (canSave.current) setSaveStatus(saveResumes(storage.current, resumes));
  }, [resumes, loaded]);

  const deleteUnreadable = () => {
    deleteKeptAside(storage.current);
    setUnreadable(readKeptAside(storage.current));
    // That frees room, so if saving was stopped, try again now.
    if (!canSave.current) setResumes((current) => ({ ...current }));
  };

  // Resumes only live in this browser's localStorage; there are no accounts.
  const createNewResume = (title: string, tag: string, template: string = DEFAULT_TEMPLATE): string => {
    const newId = crypto.randomUUID();

    const newResumeData = {
      ...blankResume(template),
      id: newId,
      resumeTag: tag,
      resumeTitle: title,
      updatedAt: new Date().toISOString(),
    };

    // A repeated name gets a number, e.g. "Untitled resume 2".
    setResumes(prev => ({
      ...prev,
      [newId]: { ...newResumeData, resumeTitle: uniqueTitle(title, Object.values(prev).map(r => r?.resumeTitle)) },
    }));
    setCurrentResumeId(newId);
    return newId;
  };

  // Adds a resume opened from a file. A resumezip PDF keeps its resume's id,
  // so opening it again later is recognised as the same resume.
  const importResume = (content: ResumeContent, title: string, { keepId = true } = {}): string => {
    const id = keepId && content.id && !resumes[content.id] ? content.id : crypto.randomUUID();
    const resume = {
      ...blankResume(content.selectedTemplate ?? DEFAULT_TEMPLATE),
      ...content,
      id,
      resumeTag: "personal",
      updatedAt: content.updatedAt ?? new Date().toISOString(),
    };
    // Named after the file, numbered if another resume has that name.
    setResumes(prev => ({
      ...prev,
      [id]: { ...resume, resumeTitle: uniqueTitle(title, Object.values(prev).map(r => r?.resumeTitle)) },
    }));
    return id;
  };

  // Replaces a resume's content with a file's, keeping its name and tag.
  const replaceResume = (id: string, content: ResumeContent) => {
    setResumes(prev => prev[id] ? {
      ...prev,
      [id]: { ...prev[id], ...content, id, updatedAt: new Date().toISOString() }
    } : prev);
  };

  const deleteResume = (id: string) => {
    setResumes(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    if (currentResumeId === id) {
      setCurrentResumeId(null);
    }
  };

  const updateFormData = (section: string, data: unknown) => {
    if (!currentResumeId) return;
    setResumes(prev => prev[currentResumeId] ? {
      ...prev,
      [currentResumeId]: {
        ...prev[currentResumeId],
        [section]: data,
        updatedAt: new Date().toISOString(),
      }
    } : prev);
  };

  return (
    <ResumeContext.Provider value={{
      resumes,
      loaded,
      saveStatus,
      unreadable,
      deleteUnreadable,
      currentResumeId,
      formData,
      setCurrentResumeId,
      createNewResume,
      importResume,
      replaceResume,
      updateFormData,
      deleteResume,
    }}>
      {children}
    </ResumeContext.Provider>
  );
};

export const useResumeContext = () => {
  const context = React.useContext(ResumeContext);
  if (!context) throw new Error("useResumeContext must be used inside FormProvider");
  return context;
};