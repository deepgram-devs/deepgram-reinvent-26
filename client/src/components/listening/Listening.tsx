"use client";

import { MicIcon, StatusPill, ViewOnlyPill } from "@/components/chrome/Pills";
import { PartnerFooter } from "@/components/chrome/PartnerFooter";
import { SettingsButton } from "@/components/chrome/SettingsButton";
import { TriCountyMark } from "@/components/chrome/TriCountyMark";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import {
  deriveProgress,
  financial,
  formatDate,
  formatTime,
  vehicleName,
  type ClaimView,
} from "@/lib/claim";
import { useConversationTurns } from "@/lib/conversation";
import { usePersonaCopy } from "@/lib/persona";
import { useSession, type Verification } from "@/lib/session";
import { useSettings } from "@/lib/settings";

const STATUS: Record<Verification, string> = {
  idle: "Listening",
  checking: "Verifying",
  verified: "Listening",
  failed: "Listening",
  locked: "Listening",
  error: "Listening",
};

const NOTICE: Partial<Record<Verification, string>> = {
  failed: "That claim number and last name don't match our records. Try again.",
  locked: "Too many tries for that claim. Your Tri-County agent can help.",
  error: "The lookup didn't go through. Ask again in a moment.",
};

export function ListeningOrb({ muted = false }: { muted?: boolean }) {
  const level = useAudioLevel("local");
  const scale = 1 + (muted ? 0 : level) * 0.35;
  return (
    <div className="relative grid size-64 place-items-center" aria-hidden="true">
      <span className="absolute inset-0 animate-ring rounded-full border border-white/25" />
      <span className="absolute inset-0 animate-ring rounded-full border border-white/20 [animation-delay:1.2s]" />
      <span
        className="absolute inset-8 rounded-full border border-white/25 transition-transform duration-150"
        style={{ transform: `scale(${scale})` }}
      />
      <span className="absolute inset-16 rounded-full border border-white/30 bg-white/15 shadow-[inset_0_0_30px] shadow-white/10 backdrop-blur" />
      <MicIcon className="relative size-10 text-white" />
    </div>
  );
}

export function LiveCaption() {
  const { caption } = useConversationTurns();
  const copy = usePersonaCopy();
  if (!caption?.text) {
    return <p className="text-2xl text-white/50">{copy.caption}</p>;
  }
  return (
    <p className="text-[2rem] leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
      &ldquo;{caption.text}
      {caption.live && (
        <span className="ml-0.5 inline-block h-[0.9em] w-[0.45em] translate-y-[0.12em] animate-caret bg-white" />
      )}
      &rdquo;
    </p>
  );
}

export function ClaimFoundCard({ claim, onOpen }: { claim: ClaimView; onOpen: () => void }) {
  const { steps, current } = deriveProgress(claim);
  const step = steps[current - 1];
  const done = steps.every((s) => s.state === "done");
  return (
    <section className="animate-rise">
      <p className="label flex items-center gap-2.5 text-white">
        <span className="size-2.5 rounded-full bg-lime" />
        Found 1 claim
      </p>
      <div className="mt-4 rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-lg font-medium">{claim.claim_id}</span>
          <StatusPill status={claim.status} />
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">{vehicleName(claim)}</h2>
        <p className="mt-1 text-lg text-white/75">
          {claim.claim_type} · {formatDate(claim.incident.date)} · {formatTime(claim.incident.time)}
        </p>
        <div className="mt-5 flex items-center justify-between font-semibold">
          <span>{step.title}</span>
          <span className="label text-white/80">
            {current} / {steps.length}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-magenta"
            style={{ width: `${(done ? 1 : (current - 0.5) / steps.length) * 100}%` }}
          />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
          <div>
            <dt className="label text-white/75">Adjuster</dt>
            <dd className="mt-1 text-lg">{claim.adjuster.name}</dd>
          </div>
          <div>
            <dt className="label text-white/75">Deductible</dt>
            <dd className="mt-1 text-lg font-semibold">{financial(claim, "Deductible") || "—"}</dd>
          </div>
        </dl>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="label mt-5 flex h-16 w-full items-center justify-center gap-3 rounded-full border-2 border-white/25 bg-magenta text-[0.95rem] text-ink shadow-[0_0_40px_-6px] shadow-magenta/70 transition hover:brightness-110"
      >
        View claim details →
      </button>
    </section>
  );
}

/** Connected, before a claim is on screen, or on a phone before the details open. */
export function Listening({
  onOpenClaim,
  aside,
}: {
  onOpenClaim: () => void;
  aside?: React.ReactNode;
}) {
  const { claim, verification } = useSession();
  const { paused } = useSettings();
  const notice = NOTICE[verification];
  return (
    <main className="flex min-h-dvh bg-ink text-white">
      <div className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_50%_25%,#7a2c9e_0%,#3b1f4a_45%,var(--color-ink)_80%)] px-5 pt-5 pb-6 sm:px-8">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <TriCountyMark className="size-8" />
            <span className="text-xl font-semibold tracking-tight">Tri-County</span>
          </span>
          <div className="flex items-center gap-3">
            <ViewOnlyPill tone="dark" />
            <SettingsButton />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center pt-8 text-center">
          <ListeningOrb />
          <p className="label mt-6 text-white/90" aria-live="polite">
            {paused ? "Paused" : STATUS[verification]}
            {!paused && verification === "checking" && <span className="animate-caret">…</span>}
          </p>
          <div className="mt-5 min-h-28" aria-live="polite">
            <LiveCaption />
          </div>
          {notice && (
            <p role="status" className="mt-4 rounded-2xl border border-orange/40 bg-orange/15 px-4 py-3">
              {notice}
            </p>
          )}
        </div>

        <div className="mx-auto mt-6 w-full max-w-2xl">
          {claim ? <ClaimFoundCard claim={claim} onOpen={onOpenClaim} /> : null}
          <div className="mt-6 border-t border-white/15 pt-6">
            <PartnerFooter />
          </div>
        </div>
      </div>
      {aside}
    </main>
  );
}
