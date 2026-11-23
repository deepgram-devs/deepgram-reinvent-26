"use client";

import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** A red dot after the label: this side has something to see */
  flagged?: boolean;
};

const TONE = {
  /** Over a photo or the stage: frosted track, white thumb */
  glass: {
    track: "border border-white/15 bg-white/5 p-1.5 backdrop-blur-[20px]",
    on: "bg-white text-ink",
    off: "text-white/60 hover:text-white",
  },
  /** On a card: paper track, fg thumb */
  light: {
    track: "bg-paper p-1",
    on: "bg-fg text-card",
    off: "text-muted hover:text-fg",
  },
  /** On paper (a drawer, the page): card track with a hairline, fg thumb */
  paper: {
    track: "border border-line bg-card p-1",
    on: "bg-fg text-card",
    off: "text-muted hover:text-fg",
  },
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The accessible name of the group: "Calling as", "Damage view" */
  label: string;
  tone?: keyof typeof TONE;
  /**
   * "radio" picks a setting (who's calling). "tab" switches what a card shows (exterior/interior);
   * the caller renders the panel and points aria-controls at it if needed.
   */
  kind?: "radio" | "tab";
  disabled?: boolean;
  className?: string;
};

/**
 * Two to four letter-spaced choices in a pill track. The landing screen's persona toggle
 * (Policyholder / Staff), a card's view switch (Exterior / Interior), and the ThemePicker.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = "glass",
  kind = "radio",
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const styles = TONE[tone];
  return (
    <div
      role={kind === "radio" ? "radiogroup" : "tablist"}
      aria-label={label}
      className={cx("inline-flex w-fit rounded-full", styles.track, className)}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={kind === "radio" ? "radio" : "tab"}
            aria-checked={kind === "radio" ? on : undefined}
            aria-selected={kind === "tab" ? on : undefined}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              "label rounded-full px-4 py-2 text-[0.7rem] transition disabled:cursor-not-allowed",
              on ? styles.on : styles.off,
            )}
          >
            {option.label}
            {option.flagged && (
              <span className="ml-1.5 text-red" aria-hidden="true">
                ●
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
