"use client";

import { useSyncExternalStore } from "react";

/** Whether a media query matches, kept current. False during server rendering. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The kit's wide layout: the session panel sits beside the screen from here up (Tailwind lg). */
export const WIDE = "(min-width: 1024px)";
