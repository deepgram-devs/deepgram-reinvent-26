"use client";

import { create } from "qrcode";
import { type ReactNode, useMemo } from "react";

import { CheckIcon, CopyIcon } from "../icons";
import { useCopied } from "../hooks/useCopied";
import { cx } from "../lib/cx";
import { useKitStrings } from "../strings";
import { IconButton } from "./Button";

const AVATAR_TONE = {
  /** The caller, in the transcript */
  ink: "bg-ink text-white",
  /** The signed-in person, on the top bar */
  violet: "bg-violet text-white",
};

/** Initials in a circle: the caller in the transcript (ink), the user on the top bar (violet). */
export function Avatar({
  text,
  tone = "ink",
  size = "sm",
  className,
}: {
  /** Two letters, or a short word such as YOU. See initials() in this package. */
  text: string;
  tone?: keyof typeof AVATAR_TONE;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "label grid shrink-0 place-items-center rounded-full",
        size === "sm" ? "size-9 text-[0.6rem] tracking-[0.08em]" : "size-10 text-[0.7rem] tracking-[0.06em]",
        AVATAR_TONE[tone],
        className,
      )}
    >
      {text}
    </span>
  );
}

const NOTICE_TONE = {
  /** Something went wrong: the mic was blocked, the agent is down */
  error: "border-red/40 bg-red/15",
  /** Worth a look but not wrong: a failed lookup, a lockout */
  warning: "border-orange/40 bg-orange/15",
  /** Just so you know: why the last call ended */
  info: "border-white/20 bg-white/10",
};

/**
 * A message box on a dark screen. Errors are announced right away (role=alert); the others
 * politely (role=status).
 */
export function Notice({ tone = "info", children, className }: { tone?: keyof typeof NOTICE_TONE; children: ReactNode; className?: string }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cx("rounded-2xl border px-4 py-3 text-sm text-white", NOTICE_TONE[tone], className)}>
      {children}
    </p>
  );
}

/** A blinking block caret after live text: the words are still coming. */
export function Caret({ className = "h-[1em] w-[0.4em] translate-y-[0.15em] bg-white" }: { className?: string }) {
  return <span aria-hidden="true" className={cx("ml-0.5 inline-block animate-caret", className)} />;
}

/** A thin bar on a dark screen, filled with magenta. `value` runs from 0 to 1. */
export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cx("h-2 overflow-hidden rounded-full bg-white/20", className)}
    >
      <div className="h-full rounded-full bg-magenta" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A value with a copy button, in a pill on paper: the app's repo link. */
export function CopyField({ value, label, icon, className }: { value: string; label?: string; icon?: ReactNode; className?: string }) {
  const s = useKitStrings();
  const [copied, copy] = useCopied();
  return (
    <div className={cx("flex items-center gap-3 rounded-full border border-line bg-card py-1.5 pr-1.5 pl-5 text-fg", className)}>
      {icon}
      <span className="min-w-0 flex-1 truncate text-[0.9rem]" title={value}>
        {label ?? value}
      </span>
      <IconButton tone="line" label={copied ? s.copied : s.copy} onClick={() => copy(value)}>
        {copied ? <CheckIcon className="size-4 text-violet dark:text-violet-3" /> : <CopyIcon />}
      </IconButton>
    </div>
  );
}

/** A QR code drawn as one SVG path, ink on white. For "scan to open the repo" on a booth screen. */
export function QrCode({ value, className = "size-36", label }: { value: string; className?: string; label?: string }) {
  const s = useKitStrings();
  const { size, path } = useMemo(() => {
    const { modules } = create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.data[row * modules.size + col]) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: modules.size, path: d };
  }, [value]);
  return (
    <svg
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      className={className}
      role="img"
      aria-label={label ?? s.qrLabel(value.replace(/^https?:\/\//, ""))}
      shapeRendering="crispEdges"
    >
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#ffffff" />
      <path d={path} fill="var(--color-ink)" />
    </svg>
  );
}
