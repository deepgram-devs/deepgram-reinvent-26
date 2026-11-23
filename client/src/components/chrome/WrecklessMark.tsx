"use client";

import { Wordmark } from "@deepgram-devs/dg-brand-ui";

import { useT } from "@/i18n";

/** The fictional company the demo is for. Brand names stay as they are in every language. */
export const BRAND_NAME = "Wreckless Auto";

/**
 * Wreckless Auto, a fictional brand: a shield with a road running into it. The design team's
 * final mark is still to come; this one stands in until then.
 */
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
      <path d="M11 22 13.5 12" fill="none" stroke="#e042ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M21 22 18.5 12" fill="none" stroke="#00b2ff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function WrecklessLogo({ subtitle = true }: { subtitle?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <WrecklessMark />
      <div className="leading-none">
        <div className="text-[1.15rem] font-semibold tracking-tight">{BRAND_NAME}</div>
        {subtitle && <div className="label mt-1 text-[0.6rem] opacity-70">{t.chrome.tagline}</div>}
      </div>
    </div>
  );
}

/**
 * The brand top left on the dark screens: frosted pill over the landing photo, plain on the stage
 * (with the desk's tagline for staff).
 */
export function WrecklessWordmark({ variant = "plain", tagline }: { variant?: "pill" | "plain"; tagline?: string }) {
  return <Wordmark variant={variant} mark={<WrecklessMark />} name={BRAND_NAME} tagline={tagline} />;
}
