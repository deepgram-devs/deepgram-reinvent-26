"use client";

import type { AnchorHTMLAttributes, ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "../lib/cx";

type ButtonBase = Omit<ComponentPropsWithRef<"button">, "children"> & { children?: ReactNode };

const CTA_SIZE = {
  /** The landing screen's Start button: full width, 4rem tall, glowing */
  lg: "h-16 w-full gap-3 border-2 border-white/25 text-[0.95rem] shadow-[0_0_40px_-6px] shadow-magenta/70",
  /** A call to action inside a drawer or card */
  md: "h-12 gap-2 px-6 text-[0.8rem]",
  /** The landing's Start button on the stage design: a compact pill, 2.5rem tall, no icon */
  sm: "h-10 gap-2 px-4 text-[0.75rem]",
};

export type CtaButtonProps = ButtonBase & {
  size?: keyof typeof CTA_SIZE;
  /** Shown before the label. Replaced by a spinner while busy. */
  icon?: ReactNode;
  /** Connecting or working: shows a spinner and disables the button */
  busy?: boolean;
};

/**
 * The magenta call to action. One per screen: Start conversation, View details, Open on GitHub.
 * Ink text on magenta, letter-spaced. Use CtaLink for a link that looks the same.
 */
export function CtaButton({ size = "lg", icon, busy = false, className, children, disabled, ...rest }: CtaButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "label inline-flex items-center justify-center rounded-full bg-magenta text-ink transition hover:brightness-110",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta",
        "disabled:cursor-wait disabled:opacity-80",
        CTA_SIZE[size],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export type CtaLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  size?: keyof typeof CTA_SIZE;
  icon?: ReactNode;
};

/** CtaButton as a link. External links get target=_blank and an ↗. */
export function CtaLink({ size = "md", icon, className, children, target, rel, ...rest }: CtaLinkProps) {
  const external = target === "_blank";
  return (
    <a
      target={target}
      rel={external ? (rel ?? "noopener noreferrer") : rel}
      className={cx(
        "label inline-flex items-center justify-center rounded-full bg-magenta text-ink transition hover:brightness-110",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta",
        CTA_SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {external && <span aria-hidden="true">↗</span>}
    </a>
  );
}

const PILL_TONE = {
  /** On ink, stage, or violet */
  dark: "border-white/30 text-white hover:bg-white/10",
  /** Filled white: End conversation on the frosted session panel */
  solid: "bg-white text-ink hover:bg-white/90",
  /** On paper or card */
  light: "border-fg/25 text-fg hover:bg-fg/5",
};

const PILL_SIZE = {
  /** Back to results, small secondary actions */
  sm: "border px-4 py-2 text-[0.7rem] gap-1.5",
  /** End conversation: 3.5rem tall, fills its row */
  lg: "h-14 flex-1 border-2 border-white/40 text-[0.85rem] gap-3",
  /** End conversation on the frosted panel: 2.5rem tall, sized to its label */
  md: "h-10 px-4 text-[0.75rem] gap-2",
};

export type PillButtonProps = ButtonBase & {
  tone?: keyof typeof PILL_TONE;
  size?: keyof typeof PILL_SIZE;
  icon?: ReactNode;
};

/** The outlined pill: secondary actions next to a CtaButton, Back, and End conversation. */
export function PillButton({ tone = "dark", size = "sm", icon, className, children, ...rest }: PillButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "label inline-flex shrink-0 items-center justify-center rounded-full transition disabled:opacity-50",
        PILL_TONE[tone],
        PILL_SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

const ICON_TONE = {
  /** Over photos and the dark stage: frosted */
  glass: "border border-white/15 bg-white/5 text-white backdrop-blur-[20px] hover:bg-white/15",
  /** On the ink top bar */
  solid: "bg-white text-ink hover:bg-white/90",
  /** On paper: drawers, cards */
  line: "border border-line bg-card text-fg hover:bg-paper",
  /** On the session panel and dock, violet or frosted */
  violet: "border border-white/40 bg-white/10 text-white hover:bg-white/20",
};

const ICON_SIZE = { md: "size-11", lg: "size-14" };

export type IconButtonProps = ButtonBase & {
  /** The accessible name. Required: the button shows only an icon. */
  label: string;
  tone?: keyof typeof ICON_TONE;
  size?: keyof typeof ICON_SIZE;
};

/** A round icon-only button: settings, close, copy, mute. */
export function IconButton({ label, tone = "glass", size = "md", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "grid shrink-0 place-items-center rounded-full transition disabled:opacity-50",
        ICON_TONE[tone],
        ICON_SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The kit's spinner, in currentColor */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block animate-spin rounded-full border-2 border-current/30 border-t-current", className)}
    />
  );
}
