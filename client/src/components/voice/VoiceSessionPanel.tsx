"use client";

import { usePipecatClientMicControl } from "@pipecat-ai/client-react";
import {
  AsideNote,
  DOCK_CLEARANCE,
  SessionDock as KitSessionDock,
  VoiceSessionPanel as KitVoiceSessionPanel,
  type SessionSurface,
  type Turn as KitTurn,
} from "@deepgram-devs/dg-brand-ui";
import { useMemo, type ReactNode } from "react";

import { useTurnState } from "@/hooks/useTurnState";
import { useLocale, useT, type Messages } from "@/i18n";
import { initials, sectionLabel, type ClaimView, type Section } from "@/lib/claim";
import { useConversationTurns, type Turn } from "@/lib/conversation";
import { usePersona, usePersonaCopy } from "@/lib/persona";
import { useSession, useSetMic } from "@/lib/session";
import { useSettings } from "@/lib/settings";

/**
 * The voice session, drawn by the UI kit's panel and dock, fed from this app's call: the
 * conversation, the claim the agent points at, the mic, and the prompts for what's on screen.
 * The kit picks the look from where it sits: frosted on the call screens (StageLayout), violet
 * beside the claim page.
 */

export { DOCK_CLEARANCE };

// Short names for the one-line function call summary, so the argument fits beside them.
// The full request shows the real function name.
const SHORT_NAMES: Record<string, string> = {
  search_knowledge_base: "claim.lookup",
  search_claims: "claims.search",
  set_voice: "voice.set",
  list_voices: "voice.list",
  reset_voice: "voice.reset",
  show_on_screen: "screen.show",
};

/** This app's turns as the kit draws them: focus sections become chips that point at cards */
function toKitTurns(turns: Turn[], claim: ClaimView | null, t: Messages): KitTurn[] {
  return turns.map((turn) => ({
    id: turn.id,
    role: turn.role,
    text: turn.spoken,
    pending: turn.unspoken || undefined,
    final: turn.final,
    at: turn.at,
    chips: claim ? turn.focus.map((section) => ({ id: section, label: sectionLabel(section, claim, t) })) : undefined,
    call: turn.call?.function_name
      ? {
          name: turn.call.function_name,
          args: turn.call.args,
          status: turn.call.status === "completed" ? "completed" : "running",
          cancelled: turn.call.cancelled,
          ms: turn.ms,
        }
      : undefined,
  }));
}

/**
 * Tap-to-ask prompts for what's on screen. `open` is the claim the review screen shows. Staff
 * prompts follow it, not the session's claim, which stays set after staff go back to the results.
 * In the UI's language: a tapped prompt is sent as the caller's own words.
 */
function usePrompts(open?: ClaimView): string[] {
  const { claim } = useSession();
  const persona = usePersona();
  const copy = usePersonaCopy();
  const t = useT();
  if (persona === "policyholder" && claim) {
    return [
      t.session.askDeductible,
      t.session.askNextReview,
      t.session.askLocationNotes,
      claim.other_party ? t.session.askOtherDriver : t.session.askDamage,
    ];
  }
  if (persona === "employee" && open) {
    return [
      "What’s the status of this claim?",
      "Who’s the adjuster?",
      open.valuation ? "What’s the total loss valuation?" : "What’s the repair estimate?",
      "What’s the latest note?",
    ];
  }
  return copy.prompts;
}

/** The mute button's state and what it does */
function useMic(live: boolean) {
  const { isMicEnabled } = usePipecatClientMicControl();
  const setMic = useSetMic();
  return { micOn: isMicEnabled, onToggleMic: (on: boolean) => setMic(on), live };
}

type SessionProps = {
  onEnd: () => void;
  live: boolean;
  /** The claim open on screen, if any, for the staff prompts */
  claim?: ClaimView;
  /** Frosted or violet. Left out, it follows the layout the panel sits in. */
  surface?: SessionSurface;
};

export function VoiceSessionPanel({ onEnd, live, claim: open, surface }: SessionProps) {
  const { claim, voice, latencyMs, pointAt } = useSession();
  const { turns, sendText } = useConversationTurns();
  const persona = usePersona();
  const { paused } = useSettings();
  const turnState = useTurnState();
  const locale = useLocale();
  const t = useT();
  const prompts = usePrompts(open);
  const mic = useMic(live);
  const kitTurns = useMemo(() => toKitTurns(turns, claim, t), [turns, claim, t]);

  const meta = [voice?.stt_model ?? "flux-general-en", voice?.language ?? "en", latencyMs !== null ? `${latencyMs} ms` : null]
    .filter(Boolean)
    .join(" · ");
  // A policyholder is the person on their claim; staff browse other people's
  const you = persona === "policyholder" && claim ? initials(claim.policyholder.name) : t.chrome.you;

  return (
    <KitVoiceSessionPanel
      {...mic}
      turns={kitTurns}
      onEnd={onEnd}
      meta={meta}
      paused={paused}
      thinking={live && turnState === "thinking"}
      prompts={prompts}
      onPrompt={sendText ?? undefined}
      you={you}
      locale={locale}
      shortNames={SHORT_NAMES}
      onChip={(chip) => pointAt([chip.id as Section])}
      surface={surface}
    />
  );
}

/**
 * Narrow screens have no session panel, so its prompts and call controls dock at the bottom.
 * Pages that show it pad their bottom by DOCK_CLEARANCE so their last content clears it.
 */
export function SessionDock({
  onEnd,
  live,
  claim,
  surface,
  className,
  children,
}: SessionProps & {
  className?: string;
  /** A row above the prompts, such as the claim review's caption */
  children?: ReactNode;
}) {
  const { sendText } = useConversationTurns();
  const prompts = usePrompts(claim);
  const mic = useMic(live);
  return (
    <KitSessionDock {...mic} onEnd={onEnd} prompts={prompts} onPrompt={sendText ?? undefined} surface={surface} className={className}>
      {children}
    </KitSessionDock>
  );
}

/** What the caller can and can't do here, muted, with a lock, under the panel on the claim page */
export function ViewOnlyNote() {
  const copy = usePersonaCopy();
  return <AsideNote>{copy.viewOnly}</AsideNote>;
}
