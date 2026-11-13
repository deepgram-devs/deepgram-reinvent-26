"use client";

import { useT } from "@/i18n";
import { statusTone, type Tone } from "@/lib/claim";

const TONE: Record<Tone, string> = {
  review: "bg-orange text-ink",
  good: "bg-lime text-ink",
  bad: "bg-red text-white",
  done: "bg-ink-3 text-white",
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span
      className={`label inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${TONE[statusTone(status)]} ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status.split(",")[0]}
    </span>
  );
}

export function LockIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function ViewOnlyPill({ tone = "light" }: { tone?: "light" | "dark" | "glass" }) {
  const t = useT();
  const styles = {
    light: "border-ink text-ink",
    dark: "border-white/50 text-white",
    glass: "border-white/20 bg-black/35 text-white backdrop-blur-md",
  }[tone];
  return (
    <span className={`label inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 ${styles}`}>
      <LockIcon />
      {t.chrome.viewOnly}
    </span>
  );
}

export function MicIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function MicOffIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.9 2.3M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18" />
    </svg>
  );
}

export function WaveIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
    </svg>
  );
}
