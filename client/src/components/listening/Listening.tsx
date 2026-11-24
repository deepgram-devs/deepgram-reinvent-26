"use client";

import {
  CallStatus,
  FoundCard,
  LiveCaption as KitLiveCaption,
  Notice,
  StageCenter,
  StageLayout,
  VoiceRing,
} from "@deepgram-devs/dg-brand-ui";
import type { ReactNode } from "react";

import { ViewOnlyPill } from "@/components/chrome/Pills";
import { SettingsButton } from "@/components/chrome/SettingsButton";
import { WrecklessWordmark } from "@/components/chrome/WrecklessMark";
import { SessionDock } from "@/components/voice/VoiceSessionPanel";
import { useTurnState } from "@/hooks/useTurnState";
import { useVoiceLevelRef } from "@/hooks/useVoiceLevelRef";
import { useLocale, useT, type Messages } from "@/i18n";
import { deriveProgress, financial, formatDate, formatTime, statusTone, vehicleName, type ClaimView } from "@/lib/claim";
import { useConversationTurns } from "@/lib/conversation";
import { usePersonaCopy } from "@/lib/persona";
import { useSession, type Verification } from "@/lib/session";
import { useSettings } from "@/lib/settings";

function noticeText(verification: Verification, t: Messages): string | null {
  switch (verification) {
    case "failed":
      return t.call.failed;
    case "locked":
      return t.call.locked;
    case "error":
      return t.call.error;
    default:
      return null;
  }
}

/**
 * Deepgram's voice ring: glass beads that ripple inward with the caller's voice, breathe while
 * the agent thinks (or while `busy`), and push outward as the agent speaks. While `paused` it
 * holds its listening shape and ignores the audio.
 */
export function ListeningOrb({ busy = false, paused = false }: { busy?: boolean; paused?: boolean }) {
  const turn = useTurnState();
  const level = useVoiceLevelRef(paused);
  return <VoiceRing state={busy ? "thinking" : turn} level={level} paused={paused} className="size-64 lg:size-[22rem]" />;
}

/** The caller's words, big and quoted; before they speak, what to say */
export function LiveCaption() {
  const { caption } = useConversationTurns();
  const copy = usePersonaCopy();
  return <KitLiveCaption text={caption?.text} live={caption?.live} placeholder={copy.caption} />;
}

/** Phones and tablets: the claim the agent found, with where it stands, before the page opens */
export function ClaimFoundCard({ claim, onOpen }: { claim: ClaimView; onOpen: () => void }) {
  const t = useT();
  const locale = useLocale();
  const { steps, current } = deriveProgress(claim, t, locale);
  const status = claim.status.split(",")[0];
  return (
    <FoundCard
      kicker={t.call.foundOne}
      recordId={claim.claim_id}
      status={{ label: status, tone: statusTone(claim.status) }}
      title={vehicleName(claim)}
      subtitle={`${claim.claim_type} · ${formatDate(claim.incident.date, locale)} · ${formatTime(claim.incident.time)}`}
      progress={{
        label: steps[current - 1].title,
        current,
        total: steps.length,
        done: steps.every((s) => s.state === "done"),
      }}
      stats={[
        { label: t.claim.adjuster, value: claim.adjuster.name },
        { label: t.claim.deductible, value: <span className="font-semibold">{financial(claim, "Deductible") || "—"}</span> },
      ]}
      action={{ label: t.call.viewDetails, onClick: onOpen }}
    />
  );
}

/** Connected, before a claim is on screen, or on a phone before the details open. */
export function Listening({
  onOpenClaim,
  panel,
  live,
  onEnd,
}: {
  onOpenClaim: () => void;
  /** The session panel, beside the stage from lg up */
  panel: ReactNode;
  live: boolean;
  onEnd: () => void;
}) {
  const { claim, verification } = useSession();
  const { paused } = useSettings();
  const t = useT();
  const notice = noticeText(verification, t);
  const checking = !paused && verification === "checking";
  return (
    <StageLayout
      brand={<WrecklessWordmark />}
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
      <StageCenter className={claim ? undefined : "justify-center pb-16"}>
        <ListeningOrb paused={paused} busy={verification === "checking"} />
        <CallStatus className="mt-8" busy={checking}>
          {paused ? t.call.paused : checking ? t.call.verifying : t.call.listening}
        </CallStatus>
        <div className="mt-8 min-h-28" aria-live="polite">
          <LiveCaption />
        </div>
        {notice && (
          <Notice tone="warning" className="mt-4 text-base">
            {notice}
          </Notice>
        )}
      </StageCenter>
      {claim && (
        <div className="mx-auto mt-6 w-full max-w-2xl">
          <ClaimFoundCard claim={claim} onOpen={onOpenClaim} />
        </div>
      )}
    </StageLayout>
  );
}
