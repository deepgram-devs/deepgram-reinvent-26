"use client";

import { usePipecatClient } from "@pipecat-ai/client-react";
import { CallStatus, ResultCard, StageCenter, StageLayout } from "@deepgram-devs/dg-brand-ui";
import { useState, type ReactNode } from "react";

import { ViewOnlyPill } from "@/components/chrome/Pills";
import { SettingsButton } from "@/components/chrome/SettingsButton";
import { WrecklessWordmark } from "@/components/chrome/WrecklessMark";
import { ClaimReview } from "@/components/claim/ClaimReview";
import { LiveCaption, ListeningOrb } from "@/components/listening/Listening";
import { SessionDock } from "@/components/voice/VoiceSessionPanel";
import { useT } from "@/i18n";
import { statusTone, vehicleName, type ClaimView } from "@/lib/claim";
import { useConversationTurns } from "@/lib/conversation";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";

/** Staff on a call: what they asked, and the claims the answer names, two by two. */
function Desk({
  onOpenClaim,
  panel,
  live,
  onEnd,
}: {
  onOpenClaim: (claim: ClaimView) => void;
  panel: ReactNode;
  live: boolean;
  onEnd: () => void;
}) {
  const { results } = useSession();
  const { toolCall } = useConversationTurns();
  const searching = toolCall?.function_name === "search_claims" && toolCall.status !== "completed";
  const { paused } = useSettings();
  const t = useT();

  return (
    <StageLayout
      brand={<WrecklessWordmark tagline={t.desk.title} />}
      actions={
        <>
          {/* Phones have room for the brand and the gear only; the claim page says it's view only */}
          <span className="hidden sm:contents">
            <ViewOnlyPill tone="dark" />
          </span>
          <SettingsButton />
        </>
      }
      panel={panel}
      dock={<SessionDock onEnd={onEnd} live={live} />}
    >
      {results ? (
        <section className="mx-auto mt-8 w-full max-w-[47rem] flex-1" aria-live="polite">
          <p className="label inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-white">
            <span className={`size-1.5 rounded-full ${searching ? "animate-caret bg-magenta" : "bg-lime"}`} aria-hidden="true" />
            {searching ? `${t.call.searching}…` : t.desk.claims(results.claims.length)}
          </p>
          <h1 className="mt-6 text-3xl leading-tight font-semibold tracking-tight text-balance">&ldquo;{results.query}&rdquo;</h1>
          {results.claims.length ? (
            <ul className="mt-6 grid gap-5 md:grid-cols-2">
              {results.claims.map((claim) => (
                <li key={claim.claim_id}>
                  <ResultCard
                    recordId={claim.claim_id}
                    status={{ label: claim.status.split(",")[0], tone: statusTone(claim.status) }}
                    title={claim.policyholder.name}
                    subtitle={`${vehicleName(claim)} · ${claim.claim_type}`}
                    meta={{ label: t.claim.adjuster, value: claim.adjuster.name }}
                    actionLabel={t.desk.open}
                    onOpen={() => onOpenClaim(claim)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="glass mt-6 rounded-xl px-5 py-4 text-lg text-white/80">{t.desk.noMatches}</p>
          )}
          <div className="mt-10 border-t border-white/25 pt-6 text-left" aria-live="polite">
            <LiveCaption />
          </div>
        </section>
      ) : (
        <StageCenter className="justify-center pb-16">
          <ListeningOrb paused={paused} busy={searching} />
          <CallStatus className="mt-8" busy={!paused && searching}>
            {paused ? t.call.paused : searching ? t.call.searching : t.call.listening}
          </CallStatus>
          <div className="mt-8 min-h-28" aria-live="polite">
            <LiveCaption />
          </div>
        </StageCenter>
      )}
    </StageLayout>
  );
}

/**
 * The employee's call: the desk, or one of its claims opened in the claim
 * review. Unmounted when the call ends, so the next call starts on the desk.
 */
export function EmployeeSession({
  live,
  onEnd,
  panel,
}: {
  live: boolean;
  onEnd: () => void;
  /** The session panel, beside the desk from lg up */
  panel: ReactNode;
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
  return <Desk onOpenClaim={show} panel={panel} live={live} onEnd={onEnd} />;
}
