"use client";

import { useT } from "@/i18n";

/** Wreckless Insurance, a fictional brand: a shield with a road running into it. */
export function WrecklessMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M16 3 27 7v8c0 7-5 12-11 14C10 27 5 22 5 15V7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M11 22 13.5 12" fill="none" stroke="#d946ef" strokeWidth="3" strokeLinecap="round" />
      <path d="M21 22 18.5 12" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function WrecklessLogo({ subtitle = true }: { subtitle?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <WrecklessMark />
      <div className="leading-none">
        <div className="text-[1.15rem] font-semibold tracking-tight">Wreckless</div>
        {subtitle && <div className="label mt-1 text-[0.6rem] opacity-70">{t.chrome.tagline}</div>}
      </div>
    </div>
  );
}
