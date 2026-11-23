"use client";

import { useCallback, useEffect, useState } from "react";

/** Copy text to the clipboard, and say "copied" for a moment: const [copied, copy] = useCopied() */
export function useCopied(ms = 2000): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), ms);
    return () => clearTimeout(timer);
  }, [copied, ms]);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => {},
    );
  }, []);
  return [copied, copy];
}
