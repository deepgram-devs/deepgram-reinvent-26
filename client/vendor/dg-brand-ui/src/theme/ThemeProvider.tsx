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

import { DARK_QUERY, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from "./script";

type Store = {
  snapshot: () => ThemePreference;
  subscribe: (listener: () => void) => () => void;
  set: (preference: ThemePreference) => void;
};

const stores = new Map<string, Store>();

/** One store per storage key and default, shared by every provider that uses them */
function storeFor(key: string, fallback: ThemePreference): Store {
  const id = `${key}|${fallback}`;
  const existing = stores.get(id);
  if (existing) return existing;
  // The pick made on this page wins over storage, so it holds when storage is blocked
  let picked: ThemePreference | null = null;
  const listeners = new Set<() => void>();
  const read = (): ThemePreference => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === "dark" || stored === "light" || stored === "system" ? stored : fallback;
    } catch {
      return fallback;
    }
  };
  const store: Store = {
    snapshot: () => picked ?? read(),
    subscribe: (listener) => {
      listeners.add(listener);
      // A pick in another tab changes this one too
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        picked = null;
        listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    set: (preference) => {
      picked = preference;
      try {
        window.localStorage.setItem(key, preference);
      } catch {
        // Kept for this page only; the next visit starts from the default
      }
      listeners.forEach((listener) => listener());
    },
  };
  stores.set(id, store);
  return store;
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribeSystem(listener: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export type ThemeValue = {
  /** What the viewer picked */
  preference: ThemePreference;
  /** What the page shows: the pick, or the device's setting under "system" */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue>({ preference: "system", resolved: "light", setPreference: () => {} });

/** The theme and a setter, from the nearest ThemeProvider. Light, with a no-op setter, outside one. */
export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export type ThemeProviderProps = {
  /** localStorage key for the pick. Use the same key in themeScript(). */
  storageKey?: string;
  /** The theme before the viewer picks one. Default "system". Use the same one in themeScript(). */
  defaultPreference?: ThemePreference;
  children: ReactNode;
};

/**
 * Dark, light, or the device's setting, remembered between visits. Only the paper surface
 * changes; ink, stage, and violet look the same in both. themeScript() in the layout's <head>
 * sets the theme before the first paint; this keeps data-theme on <html> in step after that,
 * follows the device live under "system", and follows picks made in other tabs.
 */
export function ThemeProvider({ storageKey = THEME_STORAGE_KEY, defaultPreference = "system", children }: ThemeProviderProps) {
  const store = storeFor(storageKey, defaultPreference);
  // The server can't read storage or the device, so it renders the default, and light under "system"
  const preference = useSyncExternalStore(store.subscribe, store.snapshot, () => defaultPreference);
  const system = useSyncExternalStore(subscribeSystem, systemTheme, () => "light" as const);
  const resolved = preference === "system" ? system : preference;

  // Before paint. Also puts the attribute back after React's development remount clears what
  // the script set. It reads the live values, not `resolved`: the hydrating render uses the
  // server's "light", and writing that would flash a dark page light for a frame.
  useLayoutEffect(() => {
    const live = store.snapshot();
    document.documentElement.setAttribute("data-theme", live === "system" ? systemTheme() : live);
  }, [store, resolved]);

  const setPreference = useCallback((next: ThemePreference) => store.set(next), [store]);
  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
