"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { DARK_QUERY, THEME_KEY, type ResolvedTheme, type ThemePreference } from "./theme-script";

export type { ResolvedTheme, ThemePreference } from "./theme-script";

// The theme picked on this page. It wins over storage, so a pick still holds
// when the browser refuses to store it (private windows, blocked storage).
let picked: ThemePreference | null = null;
const listeners = new Set<() => void>();

function isPreference(value: string | null): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function readStored(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function preferenceSnapshot(): ThemePreference {
  return picked ?? readStored();
}

function subscribePreference(listener: () => void): () => void {
  listeners.add(listener);
  // A pick in another tab changes this one too
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) {
      picked = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function systemSnapshot(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribeSystem(listener: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function store(preference: ThemePreference) {
  picked = preference;
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Kept for this page only; the next visit follows the device
  }
  listeners.forEach((listener) => listener());
}

type ThemeValue = {
  /** What the person picked in Settings */
  preference: ThemePreference;
  /** What the page shows: the pick, or the device's setting under "system" */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue>({ preference: "system", resolved: "light", setPreference: () => {} });

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Dark, light, or the device's setting, remembered between visits. Only the
 * paper areas change (the claim review, its cards, Settings); the dark screens
 * and bars look the same in both. The script in the root layout sets the
 * theme before the first paint; this keeps it in step after that.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // The server can't know either, so it renders "system" and light, like the HTML it sends
  const preference = useSyncExternalStore(subscribePreference, preferenceSnapshot, () => "system" as const);
  const system = useSyncExternalStore(subscribeSystem, systemSnapshot, () => "light" as const);
  const resolved = preference === "system" ? system : preference;

  // Before paint. Also puts the attribute back after React's development
  // remount clears what the inline script set on <html>. It reads the live
  // values, not `resolved`: the hydrating render uses the server's "light",
  // and writing that would flash a dark page light for a frame.
  useLayoutEffect(() => {
    const live = preferenceSnapshot();
    document.documentElement.setAttribute("data-theme", live === "system" ? systemSnapshot() : live);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => store(next), []);
  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
