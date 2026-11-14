"use client";

import { usePipecatClient } from "@pipecat-ai/client-react";
import { useState, type ReactNode } from "react";

import { StatusPill, ViewOnlyPill } from "@/components/chrome/Pills";
import { PartnerFooter } from "@/components/chrome/PartnerFooter";
import { SettingsButton } from "@/components/chrome/SettingsButton";
import { TriCountyMark } from "@/components/chrome/TriCountyMark";
import { ClaimReview } from "@/components/claim/ClaimReview";
import { LiveCaption, ListeningOrb } from "@/components/listening/Listening";
import { EndButton, MicButton } from "@/components/voice/VoiceSessionPanel";
import { useT } from "@/i18n";
import { vehicleName, type ClaimView } from "@/lib/claim";
import { useConversationTurns } from "@/lib/conversation";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";

function ResultCard({ claim, onOpen }: { claim: ClaimView; onOpen: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block h-full w-full animate-rise rounded-3xl border border-white/20 bg-white/10 p-5 text-left backdrop-blur-md transition hover:border-white/40 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta"
    >
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="font-mono font-medium whitespace-nowrap">{claim.claim_id}</span>
        <StatusPill status={claim.status} />
      </span>
      <span className="mt-3 block text-2xl font-semibold tracking-tight">{claim.policyholder.name}</span>
      <span className="mt-1 block text-white/75">
        {vehicleName(claim)} · {claim.claim_type}
      </span>
      <span className="mt-4 flex items-center justify-between gap-3 border-t border-white/20 pt-3">
        <span>
          <span className="label block text-[0.65rem] text-white/70">{t.claim.adjuster}</span>
          <span className="mt-0.5 block">{claim.adjuster.name || "—"}</span>
        </span>
        <span className="label text-[0.7rem] text-white/85">
          {t.desk.open} <span aria-hidden="true">→</span>
        </span>
      </span>
    </button>
  );
}

/** Staff on a call: what they asked, and the claims the answer names. */
function Desk({
  onOpenClaim,
  aside,
  live,
  onEnd,
}: {
  onOpenClaim: (claim: ClaimView) => void;
  aside?: ReactNode;
  live: boolean;
  onEnd: () => void;
}) {
  const { results } = useSession();
  const { toolCall } = useConversationTurns();
  const searching = toolCall?.function_name === "search_claims" && toolCall.status !== "completed";
  const { paused } = useSettings();
  const t = useT();

  return (
    <main className="flex min-h-dvh bg-ink text-white">
      <div
        className={`relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_50%_25%,#7a2c9e_0%,#3b1f4a_45%,var(--color-ink)_80%)] px-5 pt-5 sm:px-8 ${aside ? "pb-6" : "pb-28"}`}
      >
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <TriCountyMark className="size-8" />
            <span className="text-xl font-semibold tracking-tight">Tri-County</span>
            <span className="label ml-1 hidden text-white/70 sm:inline">{t.desk.title}</span>
          </span>
          <div className="flex items-center gap-3">
            <ViewOnlyPill tone="dark" />
            <SettingsButton />
          </div>
        </header>

        {results ? (
          <section className="mx-auto mt-10 w-full max-w-4xl flex-1" aria-live="polite">
            <p className="label flex items-center gap-2.5 text-white/90">
              <span className={`size-2.5 rounded-full ${searching ? "animate-caret bg-magenta" : "bg-lime"}`} />
              {searching ? `${t.call.searching}…` : t.desk.claims(results.claims.length)}
            </p>
            <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
              &ldquo;{results.query}&rdquo;
            </h1>
            {results.claims.length ? (
              <ul className="mt-8 grid gap-4 md:grid-cols-2">
                {results.claims.map((claim) => (
                  <li key={claim.claim_id}>
                    <ResultCard claim={claim} onOpen={() => onOpenClaim(claim)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-8 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-lg text-white/80">
                {t.desk.noMatches}
              </p>
            )}
            <div className="mt-10 border-t border-white/15 pt-6 text-left" aria-live="polite">
              <LiveCaption />
            </div>
          </section>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center pt-8 text-center">
            <ListeningOrb paused={paused} busy={searching} />
            <p className="label mt-6 text-white/90" aria-live="polite">
              {paused ? (
                t.call.paused
              ) : searching ? (
                <>
                  {t.call.searching}
                  <span className="animate-caret">…</span>
                </>
              ) : (
                t.call.listening
              )}
            </p>
            <div className="mt-5 min-h-28" aria-live="polite">
              <LiveCaption />
            </div>
          </div>
        )}

        <div className="mx-auto mt-6 w-full max-w-2xl border-t border-white/15 pt-6">
          <PartnerFooter />
        </div>
      </div>
      {aside ?? (
        // Narrow screens have no session panel, so the call controls dock at the bottom
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-white/10 bg-violet p-4 text-white">
          <MicButton live={live} />
          <EndButton onEnd={onEnd} live={live} />
        </div>
      )}
    </main>
  );
}

/**
 * The employee's call: the desk, or one of its claims opened in the claim
 * review. Unmounted when the call ends, so the next call starts on the desk.
 */
export function EmployeeSession({
  live,
  onEnd,
  aside,
}: {
  live: boolean;
  onEnd: () => void;
  aside?: ReactNode;
}) {
  const client = usePipecatClient();
  // The claim itself, so a new search doesn't close the one being read
  const [open, setOpen] = useState<ClaimView | null>(null);
  // Each view starts at its top, not wherever the other was scrolled to
  const show = (claim: ClaimView | null) => {
    setOpen(claim);
    window.scrollTo({ top: 0 });
    // Tell the agent what's on screen, so "this claim" means the open one.
    // Only the ID goes: the agent reads the record itself. Fixtures have no
    // call, and nothing to tell.
    if (!client?.connected) return;
    if (claim) client.sendClientMessage("claim-opened", { claim_id: claim.claim_id });
    else client.sendClientMessage("claim-closed");
  };
  if (open) {
    return <ClaimReview claim={open} live={live} onEnd={onEnd} onBack={() => show(null)} />;
  }
  return <Desk onOpenClaim={show} aside={aside} live={live} onEnd={onEnd} />;
}
