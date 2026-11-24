"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Keep a scrolling log at its newest item as it grows, unless the reader has scrolled up.
 * Scrolling back to the bottom pins it again. Returns the ref for the scrolling element.
 *
 * Runs after every render of the component that calls it, so call it in the component that
 * re-renders when the log changes.
 */
export function useStickToBottom<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  const pinned = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    // The log changes size too, when the window does or the panel's height settles
    const resize = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, []);

  return ref;
}
