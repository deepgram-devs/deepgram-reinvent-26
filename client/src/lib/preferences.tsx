"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { DEFAULT_VOICE, findVoice, type VoiceEntry } from "./voices";

const STORAGE_KEY = "tri-county.voice";

// The voice picked on this page. It wins over storage, so a pick still holds
// when the browser refuses to store it (private windows, blocked storage).
let picked: string | null = null;
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function snapshot(): string | null {
  return picked ?? readStored();
}

// The server has no storage, so it renders the default voice, in English.
// React renders that first in the browser too, then the stored voice, which
// keeps hydration warnings away.
function serverSnapshot(): string | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // A pick in another tab changes this one's next call too
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function store(name: string) {
  picked = name;
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Kept for this page only; the next visit starts with the default
  }
  listeners.forEach((listener) => listener());
}

type PreferencesValue = {
  /** The voice the next call starts in, and the one the UI's language follows */
  voice: VoiceEntry;
  setVoice: (name: string) => void;
};

const PreferencesContext = createContext<PreferencesValue>({ voice: DEFAULT_VOICE, setVoice: () => {} });

export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext);
}

/**
 * The caller's voice, remembered between visits. It sits outside
 * PipecatAppBase, since the voice the call starts in goes out with the
 * connect request. During a call it follows the voice in use, whether the
 * caller picked it in Settings or asked the agent for it, so the UI's
 * language does too.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  // A name that's no longer in the catalog falls back to the default
  const voice = findVoice(stored) ?? DEFAULT_VOICE;

  const setVoice = useCallback((name: string) => {
    if (findVoice(name)) store(name);
  }, []);

  const value = useMemo(() => ({ voice, setVoice }), [voice, setVoice]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
