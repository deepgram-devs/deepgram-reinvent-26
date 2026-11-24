"use client";

import {
  createContext,
  type ElementType,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cx } from "../lib/cx";

/**
 * "The agent points at the screen." While answering, the agent names parts of the record
 * (a server message such as { type: "focus", ids: ["estimate"] }); the matching FocusTargets
 * glow magenta once and the first one scrolls into view. The transcript's chips call pointAt
 * too, so the caller can bring a card back.
 */
export type Highlight = {
  ids: string[];
  /** Changes on every pointAt, so pointing at the same card again glows again */
  nonce: number;
};

type FocusValue = {
  highlight: Highlight | null;
  pointAt: (ids: string[]) => void;
  clear: () => void;
};

const FocusContext = createContext<FocusValue>({ highlight: null, pointAt: () => {}, clear: () => {} });

/** Holds what's lit. Put it around the screen and the transcript, so both can point. */
export function FocusProvider({ children, initial = null }: { children: ReactNode; initial?: string[] | null }) {
  const [highlight, setHighlight] = useState<Highlight | null>(initial ? { ids: initial, nonce: 0 } : null);
  const pointAt = useCallback((ids: string[]) => setHighlight((prev) => ({ ids, nonce: (prev?.nonce ?? 0) + 1 })), []);
  const clear = useCallback(() => setHighlight(null), []);
  const value = useMemo(() => ({ highlight, pointAt, clear }), [highlight, pointAt, clear]);
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

/** What's lit, and pointAt(ids) to light something */
export function useFocus(): FocusValue {
  return useContext(FocusContext);
}

export type FocusTargetProps = {
  /** The name the agent uses for this part of the screen. Also the element's DOM id. */
  id: string;
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

/**
 * A part of the screen the agent can point at. Give it a rounded className (card, rounded-3xl...)
 * and the glow follows the corners.
 */
export function FocusTarget({ id, as: Tag = "section", className, children }: FocusTargetProps) {
  const { highlight } = useFocus();
  const ref = useRef<HTMLElement>(null);
  const lit = highlight?.ids.includes(id) ?? false;

  useEffect(() => {
    if (highlight?.ids[0] !== id) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight, id]);

  return (
    <Tag id={id} ref={ref} className={cx("relative scroll-m-24", className)}>
      {children}
      {lit && (
        <span
          key={highlight?.nonce}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-glow rounded-[inherit]"
        />
      )}
    </Tag>
  );
}
