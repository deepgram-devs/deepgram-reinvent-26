"use client";

import { useT } from "@/i18n";

/** Tri-County Insurance, a fictional brand: three interlocking rings. */
export function TriCountyMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="#d946ef" strokeWidth="3" />
      <circle cx="21" cy="11" r="7" fill="none" stroke="#38bdf8" strokeWidth="3" />
      <circle cx="16" cy="20" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function TriCountyLogo({ subtitle = true }: { subtitle?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <TriCountyMark />
      <div className="leading-none">
        <div className="text-[1.15rem] font-semibold tracking-tight">Tri-County</div>
        {subtitle && <div className="label mt-1 text-[0.6rem] opacity-70">{t.chrome.tagline}</div>}
      </div>
    </div>
  );
}
