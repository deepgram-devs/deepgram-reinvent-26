"use client";

import { LockPill, StatusPill as KitStatusPill } from "@deepgram-devs/dg-brand-ui";

import { statusTone } from "@/lib/claim";

/** A claim's status, colored and iconed by what it means (the UI kit's StatusPill) */
export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  return (
    <KitStatusPill tone={statusTone(status)} className={className}>
      {status.split(",")[0]}
    </KitStatusPill>
  );
}

/** VIEW ONLY: the kit's LockPill, with a lock on paper and an eye on the dark screens */
export function ViewOnlyPill({ tone = "light" }: { tone?: "light" | "dark" | "glass" }) {
  return <LockPill tone={tone} />;
}
