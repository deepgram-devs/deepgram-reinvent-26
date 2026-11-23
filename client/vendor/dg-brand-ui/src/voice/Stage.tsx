"use client";

import { type ReactNode, type RefObject, useEffect, useRef } from "react";

import { cx } from "../lib/cx";
import { Caret } from "../primitives/misc";
import { useKitStrings } from "../strings";
import { ForegroundRing } from "../vendor/voice-hero/components/Ring";
import type { TurnState } from "./types";

/**
 * The voice pieces of the dark stage: the ring, the status line, and the big caption.
 */

export type VoiceRingProps = {
  /** listening: ripples with the voice; thinking: breathes; speaking: pushes outward */
  state: TurnState;
  /**
   * The louder of caller and agent, 0 to 1, read every frame without re-rendering. Pipecat apps
   * pass useVoiceLevelRef() from the pipecat entry; stories pass a simulated one.
   */
  level?: RefObject<number>;
  /** Hold the listening shape and ignore the audio, as when Settings are open */
  paused?: boolean;
  /** Size it with a size-* class. The ring is 16rem on phones and 22rem on wide stages. */
  className?: string;
};

/**
 * Deepgram's voice ring (vendored from deepgram-voice-hero): glass beads drawn with Three.js,
 * which loads lazily. Decorative: pair it with a CallStatus line for screen readers.
 */
export function VoiceRing({ state, level, paused = false, className = "size-64" }: VoiceRingProps) {
  const silent = useRef(0);
  return (
    <div className={cx("relative", className)} aria-hidden="true">
      <ForegroundRing state={paused ? "listening" : state} audioLevel={paused ? silent : level} />
    </div>
  );
}

/**
 * A level that rises and falls like speech, for stories and fixtures. Pass `on: false` to go quiet.
 */
export function useSimulatedLevel(on = true): RefObject<number> {
  const level = useRef(0);
  useEffect(() => {
    if (!on) {
      level.current = 0;
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const syllables = Math.max(0, Math.sin(t * 9) * Math.sin(t * 2.3));
      level.current = 0.15 + 0.6 * syllables;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return level;
}

/**
 * The letter-spaced line under the ring: LISTENING, SEARCHING…, PAUSED. Announced politely.
 * `busy` adds a blinking ellipsis.
 */
export function CallStatus({ children, busy = false, className }: { children: ReactNode; busy?: boolean; className?: string }) {
  return (
    <p className={cx("label text-white/90", className)} aria-live="polite">
      {children}
      {busy && <span className="animate-caret">…</span>}
    </p>
  );
}

export type LiveCaptionProps = {
  /** The caller's latest words. Empty shows the placeholder. */
  text?: string;
  /** Still talking: a caret follows the words */
  live?: boolean;
  /** What to say before anyone has: "Say your order number to begin." */
  placeholder?: string;
  className?: string;
};

/** The caller's words, big and quoted, on the stage. Announced politely as they settle. */
export function LiveCaption({ text, live = false, placeholder, className }: LiveCaptionProps) {
  if (!text) {
    return <p className={cx("text-2xl leading-tight font-semibold tracking-tight text-balance text-white/90 sm:text-[2rem]", className)}>{placeholder}</p>;
  }
  return (
    <p className={cx("text-[2rem] leading-tight font-semibold tracking-tight text-balance text-white sm:text-4xl", className)}>
      &ldquo;{text}
      {live && <Caret className="h-[0.9em] w-[0.45em] translate-y-[0.12em] bg-white" />}
      &rdquo;
    </p>
  );
}

export type CaptionBarProps = {
  state: "live" | "paused" | "ended";
  /** The status word: Listening, Paused, Ended. Defaults to the kit's. */
  label?: string;
  /** The caller's latest words, or a hint while paused */
  text?: string;
  /** A level meter on the right while live, such as Pipecat's <VoiceVisualizer> */
  meter?: ReactNode;
  className?: string;
};

/**
 * The caption in a pill, for the record screen's top bar: a status dot, the status word, and the
 * caller's words, truncated. Hidden below md, where the dock shows the caption.
 */
export function CaptionBar({ state, label, text, meter, className }: CaptionBarProps) {
  const s = useKitStrings();
  const word = label ?? (state === "paused" ? s.paused : state === "live" ? s.listening : s.ended);
  return (
    <div className={cx("mx-auto hidden h-11 max-w-2xl flex-1 items-center gap-4 rounded-full border border-white/15 bg-white/5 pr-3 pl-5 text-white md:flex", className)}>
      <span
        aria-hidden="true"
        className={cx(
          "size-2.5 shrink-0 rounded-full",
          state === "paused" ? "border-[1.5px] border-white/80" : state === "live" ? "bg-magenta" : "bg-white/30",
        )}
      />
      <span className="label shrink-0 text-white/75">{word}</span>
      <span className="min-w-0 flex-1 truncate text-[0.95rem]">{text ? (state === "paused" ? text : `“${text}”`) : ""}</span>
      {state === "live" && meter}
    </div>
  );
}
