"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { SECTION_CARD } from "@/lib/claim";
import { useSession } from "@/lib/session";

/**
 * A card the agent can point at. When a claim-focus names one of its
 * sections it glows, and the first card named scrolls into view.
 */
export function FocusCard({
  id,
  className = "",
  children,
  as: Tag = "section",
}: {
  id: string;
  className?: string;
  children: ReactNode;
  as?: "section" | "div";
}) {
  const { highlight } = useSession();
  const ref = useRef<HTMLElement>(null);
  const cards = highlight?.sections.map((s) => SECTION_CARD[s]) ?? [];
  const lit = cards.includes(id);

  useEffect(() => {
    if (!highlight || SECTION_CARD[highlight.sections[0]] !== id) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight, id]);

  return (
    <Tag
      id={id}
      ref={ref as React.Ref<HTMLDivElement>}
      className={`relative scroll-m-24 ${className}`}
    >
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
