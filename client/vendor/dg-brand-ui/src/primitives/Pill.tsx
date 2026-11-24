"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { CheckIcon, CircleDashedIcon, LockIcon, RadioIcon, ScanEyeIcon, XCircleIcon } from "../icons";
import { cx } from "../lib/cx";
import { useKitStrings } from "../strings";

/**
 * What a status means, not what it says. Map a record's own status text to one of these
 * (see toneFor) so "Delivered", "Approved", and "Resolved" all read as good.
 */
export type Tone = "review" | "good" | "bad" | "done" | "neutral";

const TONE: Record<Tone, string> = {
  review: "bg-orange text-ink",
  good: "bg-lime text-ink",
  bad: "bg-red text-white",
  done: "bg-ink-3 text-white",
  neutral: "bg-white/20 text-white",
};

/**
 * Keyword rules that fit most domains: support cases, orders, claims, disputes, appointments.
 * Anything unmatched is "review" (in progress, needs attention). Put your own rules first:
 * toneFor(status, [[/awaiting title/i, "review"], ...DEFAULT_TONE_RULES])
 */
export const DEFAULT_TONE_RULES: Array<[RegExp, Tone]> = [
  [/denied|declined|failed|rejected|cancel+ed|overdue|fraud|lost|blocked/i, "bad"],
  [/resolved|approved|paid|delivered|confirmed|completed?|settle|refunded|active|verified|on track/i, "good"],
  [/closed|archived|expired|withdrawn/i, "done"],
];

/**
 * Pick a tone for status text by keyword: the first rule whose pattern matches wins.
 * toneFor("Under investigation", [[/settle|paid/i, "good"], [/denied/i, "bad"]], "review") → "review"
 */
export function toneFor(status: string, rules: Array<[RegExp, Tone]> = DEFAULT_TONE_RULES, fallback: Tone = "review"): Tone {
  return rules.find(([pattern]) => pattern.test(status))?.[1] ?? fallback;
}

/** The icon before a status: a check for good and done, a dashed circle for review, ⓧ for bad */
const TONE_ICON: Record<Tone, ReactNode> = {
  review: <CircleDashedIcon className="size-4 shrink-0" />,
  good: <CheckIcon className="size-4 shrink-0" />,
  bad: <XCircleIcon className="size-4 shrink-0" />,
  done: <CheckIcon className="size-4 shrink-0" />,
  neutral: <span className="mx-[5px] size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />,
};

/** A filled, letter-spaced status with an icon for its tone: UNDER INVESTIGATION, SETTLEMENT OFFERED. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("label inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 whitespace-nowrap", TONE[tone], className)}>
      {TONE_ICON[tone]}
      {children}
    </span>
  );
}

/** LIVE in lime with a broadcast icon while the call is on, ENDED after. Sits in the session panel's header. */
export function LiveBadge({ live, className }: { live: boolean; className?: string }) {
  const s = useKitStrings();
  return (
    <span
      className={cx(
        "label inline-flex items-center gap-1 rounded-full py-1 pr-2.5 pl-1.5 text-[0.7rem]",
        live ? "bg-lime text-ink" : "bg-white/20 text-white",
        className,
      )}
    >
      {live ? <RadioIcon className="size-4 shrink-0" /> : <span className="mx-[5px] size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {live ? s.live : s.ended}
    </span>
  );
}

const OUTLINE_TONE = {
  /** On paper */
  light: "border-fg text-fg",
  /** On ink or the stage: frosted, like the stage's other glass */
  dark: "border-white/25 bg-white/5 text-white backdrop-blur-[20px]",
  /** Over a photo */
  glass: "border-white/20 bg-black/35 text-white backdrop-blur-md",
};

/**
 * An outlined pill: VIEW ONLY. Says the app reads records but can't change them. On paper it
 * carries a lock; on dark screens an eye, as the stage design has it. Pass children for other
 * wording ("Staff view", "Read only").
 */
export function LockPill({ tone = "light", children }: { tone?: keyof typeof OUTLINE_TONE; children?: ReactNode }) {
  const s = useKitStrings();
  return (
    <span className={cx("label inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 whitespace-nowrap", OUTLINE_TONE[tone])}>
      {tone === "light" ? <LockIcon /> : <ScanEyeIcon />}
      {children ?? s.viewOnly}
    </span>
  );
}

const CHIP_TONE = {
  /** On violet or ink: the agent's focus chips under an answer */
  outline: "border border-white/40 text-white hover:bg-white/15",
  /** Damage, errors: a red tint with a dot */
  danger: "bg-red/10 text-red",
  /** On paper */
  neutral: "bg-fg/5 text-fg hover:bg-fg/10",
};

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  tone?: keyof typeof CHIP_TONE;
  /** Show a leading dot (danger chips have one by default) */
  dot?: boolean;
  /** Show the ↳ arrow that says "this answer points here" */
  pointer?: boolean;
  children: ReactNode;
};

/**
 * A small chip. With onClick it's a button (the agent's focus chips, which light up a card);
 * without, a plain label (a damaged area).
 */
export function Chip({ tone = "outline", dot, pointer, children, className, onClick, ...rest }: ChipProps) {
  const showDot = dot ?? tone === "danger";
  const body = (
    <>
      {showDot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {pointer && <span aria-hidden="true">↳</span>}
      {children}
    </>
  );
  const classes = cx(
    "inline-flex items-center gap-1.5 rounded-full transition",
    tone === "outline" ? "label px-3 py-1 text-[0.65rem]" : "px-3 py-1 text-sm",
    CHIP_TONE[tone],
    className,
  );
  if (!onClick) return <span className={classes}>{body}</span>;
  return (
    <button type="button" onClick={onClick} className={classes} {...rest}>
      {body}
    </button>
  );
}
