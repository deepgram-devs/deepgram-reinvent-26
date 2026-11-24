"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_STRINGS } from "./defaultStrings";

export { DEFAULT_STRINGS };

export type KitStrings = typeof DEFAULT_STRINGS;

const StringsContext = createContext<KitStrings>(DEFAULT_STRINGS);

/** Override any of the kit's built-in strings, for a language or an app's own wording. */
export function KitStringsProvider({ strings, children }: { strings: Partial<KitStrings>; children: ReactNode }) {
  const parent = useContext(StringsContext);
  const value = useMemo(() => ({ ...parent, ...strings }), [parent, strings]);
  return <StringsContext.Provider value={value}>{children}</StringsContext.Provider>;
}

/** The kit's strings, in the language the nearest KitStringsProvider set */
export function useKitStrings(): KitStrings {
  return useContext(StringsContext);
}
