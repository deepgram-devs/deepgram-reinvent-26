"use client";

import { VoiceVisualizer } from "@pipecat-ai/voice-ui-kit";
import { useState, type ReactNode } from "react";

import { StatusPill, ViewOnlyPill } from "@/components/chrome/Pills";
import { PartnerFooter } from "@/components/chrome/PartnerFooter";
import { SettingsButton } from "@/components/chrome/SettingsButton";
import { TriCountyLogo } from "@/components/chrome/TriCountyMark";
import { EndButton, MicButton, TryAsking, ViewOnlyNote, VoiceSessionPanel } from "@/components/voice/VoiceSessionPanel";
import { useLocale, useT } from "@/i18n";
import {
  deriveProgress,
  financial,
  firstClause,
  formatDate,
  initials,
  rentalPerDay,
  vehicleName,
  type ClaimView,
  type StepState,
} from "@/lib/claim";
import { useConversationTurns } from "@/lib/conversation";
import { usePersona } from "@/lib/persona";
import { useSettings } from "@/lib/settings";

import {
  AdjusterCard,
  CoverageCard,
  EstimateCard,
  IncidentCard,
  PaymentsCard,
  StoryCard,
  VehicleConditionCard,
  WhenWhereCard,
} from "./cards";
import { FocusCard } from "./FocusCard";

function TopBar({ claim, live, onBack }: { claim: ClaimView; live: boolean; onBack?: () => void }) {
  const { caption } = useConversationTurns();
  const persona = usePersona();
  const { paused } = useSettings();
  const t = useT();
  return (
    // Above the settings drawer's backdrop, so "Paused" stays in view
    <header data-top-bar className="sticky top-0 z-50 bg-ink text-white">
      <div className="mx-auto flex h-[4.5rem] max-w-[100rem] items-center gap-6 px-5 sm:px-8">
        <TriCountyLogo />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="label shrink-0 rounded-full border border-white/30 px-4 py-2 text-[0.7rem] text-white transition hover:bg-white/10"
          >
            <span aria-hidden="true">←</span> {t.review.results}
          </button>
        )}
        <div className="mx-auto hidden h-11 max-w-2xl flex-1 items-center gap-4 rounded-full border border-white/15 bg-white/5 pr-3 pl-5 md:flex">
          <span
            className={`size-2.5 shrink-0 rounded-full ${
              paused ? "border-[1.5px] border-white/80" : live ? "bg-magenta" : "bg-white/30"
            }`}
          />
          <span className="label shrink-0 text-white/75">{paused ? t.call.paused : live ? t.call.listening : t.call.ended}</span>
          <span className="min-w-0 flex-1 truncate text-[0.95rem]">
            {paused ? t.call.closeSettingsToTalk : caption?.text ? `“${caption.text}”` : ""}
          </span>
          {live && !paused && (
            <VoiceVisualizer
              participantType="local"
              barColor="#d946ef"
              barCount={7}
              barWidth={3}
              barGap={3}
              barMaxHeight={22}
              barOrigin="center"
              className="!h-6 !w-14 shrink-0"
            />
          )}
        </div>
        <div className="ml-auto flex items-center gap-4 md:ml-0">
          <span className="hidden font-mono text-sm text-white/80 xl:inline">{t.chrome.voiceAiBy}</span>
          <SettingsButton tone="solid" />
          <span className="label grid size-10 place-items-center rounded-full bg-violet text-[0.7rem] tracking-[0.06em]">
            {persona === "policyholder" ? initials(claim.policyholder.name) : t.chrome.you}
          </span>
        </div>
      </div>
    </header>
  );
}

const STEP_DOT: Record<StepState, string> = {
  done: "bg-ink text-white",
  active: "bg-magenta text-ink ring-4 ring-magenta/25",
  pending: "border-2 border-ink/25 text-muted bg-white",
  stopped: "bg-red text-white",
};

function ProgressStepper({ claim }: { claim: ClaimView }) {
  const t = useT();
  const locale = useLocale();
  const { steps } = deriveProgress(claim, t, locale);
  return (
    <FocusCard id="claim-progress" className="card px-6 py-6 sm:px-9">
      <ol className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="relative">
            <div className="flex items-center">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full font-mono text-sm font-semibold ${STEP_DOT[step.state]}`}>
                {step.state === "done" ? "✓" : step.state === "stopped" ? "✕" : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={`mx-3 hidden h-0 flex-1 border-t-2 md:block ${
                    steps[i + 1].state === "pending" ? "border-dashed border-ink/20" : "border-ink"
                  }`}
                />
              )}
            </div>
            <p className={`mt-3 font-semibold ${step.state === "active" ? "text-violet" : step.state === "stopped" ? "text-red" : ""}`}>
              {step.title}
            </p>
            <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
    </FocusCard>
  );
}

function GlassCard({ label, children, icon }: { label: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/20 p-6 backdrop-blur-sm sm:p-7">
      <div className="flex items-start justify-between">
        <p className="label text-ink/85">{label}</p>
        {icon}
      </div>
      {children}
    </div>
  );
}

function CarIcon() {
  return (
    <svg viewBox="0 0 40 20" className="h-5 w-10 text-ink" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 14V11l4-1 5-5h13l6 5 5 1v3h-3M9 14H6M28 14H14" strokeLinejoin="round" />
      <circle cx="11.5" cy="14.5" r="2.5" />
      <circle cx="30.5" cy="14.5" r="2.5" />
    </svg>
  );
}

function SummaryBand({ claim }: { claim: ClaimView }) {
  const t = useT();
  const locale = useLocale();
  // The labels are the UI's; the values are the record's, in English
  const strip = [
    [t.claim.coverage, claim.claim_type],
    [t.claim.deductible, financial(claim, "Deductible") || "—"],
    [t.review.rental, rentalPerDay(claim, t)],
    [t.claim.fault, firstClause(claim.incident.fault)],
  ];
  return (
    <FocusCard
      id="claim-summary"
      className="rounded-[1.75rem] bg-[linear-gradient(120deg,#e35cf5_0%,#d946ef_45%,#c13be0_100%)] p-5 text-ink sm:p-7"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard label={t.claim.policyholder}>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{claim.policyholder.name}</p>
          <p className="mt-3 font-mono">{t.review.policy(claim.policy_number)}</p>
          <p className="mt-1 text-ink/75">{t.review.reported(formatDate(claim.date_reported, locale))}</p>
        </GlassCard>
        <GlassCard label={t.claim.insuredVehicle} icon={<CarIcon />}>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{vehicleName(claim)}</p>
          <p className="mt-3 font-mono">VIN {claim.vehicle.vin_last4}</p>
          <p className="mt-1 font-mono">
            {t.review.plate} {claim.vehicle.plate_last4}
          </p>
        </GlassCard>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 px-2 md:grid-cols-4">
        {strip.map(([label, value]) => (
          <div key={label}>
            <dt className="label text-ink/80">{label}</dt>
            <dd className="mt-1.5 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </FocusCard>
  );
}

function ClaimHeader({ claim }: { claim: ClaimView }) {
  const updated = claim.notes.at(-1)?.date ?? claim.date_reported;
  const t = useT();
  const locale = useLocale();
  return (
    <FocusCard id="claim-header" as="div">
      <nav aria-label={t.review.breadcrumbLabel} className="label text-muted">
        {t.review.breadcrumb} <span className="text-ink">{claim.claim_id}</span>
      </nav>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-4xl font-semibold tracking-tight sm:text-5xl">{t.review.title}</h1>
        <StatusPill status={claim.status} />
        <ViewOnlyPill />
      </div>
      <p className="mt-3 text-muted">
        {t.review.claim} <span className="font-mono font-medium text-ink">{claim.claim_id}</span>
        <span className="mx-3">{t.review.lastUpdated(formatDate(updated, locale))}</span>
      </p>
    </FocusCard>
  );
}

/** The verified claim, with the voice session beside it (below it on phones). */
export function ClaimReview({
  claim,
  live,
  onEnd,
  onBack,
}: {
  claim: ClaimView;
  live: boolean;
  onEnd: () => void;
  /** Staff only: back to the search results this claim came from */
  onBack?: () => void;
}) {
  const [sheet, setSheet] = useState(false);
  const { caption } = useConversationTurns();
  const t = useT();

  return (
    <div className="min-h-dvh bg-paper">
      <TopBar claim={claim} live={live} onBack={onBack} />

      <div className="mx-auto grid max-w-[100rem] gap-8 px-5 pt-8 pb-36 sm:px-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:pb-16 xl:px-12">
        <main className="min-w-0 space-y-7">
          <ClaimHeader claim={claim} />
          <ProgressStepper claim={claim} />
          <SummaryBand claim={claim} />
          {/* Cards differ a lot in height, so they flow into balanced columns */}
          <div className="gap-6 md:columns-2 2xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
            <WhenWhereCard claim={claim} />
            <IncidentCard claim={claim} />
            <VehicleConditionCard claim={claim} />
            <EstimateCard claim={claim} />
            <PaymentsCard claim={claim} />
            <CoverageCard claim={claim} />
            <StoryCard claim={claim} />
          </div>
          <AdjusterCard claim={claim} />
        </main>

        {/* Wide screens: the session stays beside the claim */}
        <aside className="hidden space-y-5 lg:block">
          <div className="sticky top-24 space-y-5">
            <VoiceSessionPanel onEnd={onEnd} live={live} />
            <TryAsking />
            <ViewOnlyNote />
          </div>
        </aside>
      </div>

      <footer className="bg-ink py-10">
        <PartnerFooter />
      </footer>

      {/* Phones: a dock with the caption and controls, and the session as a sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-violet p-4 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="flex w-full items-center gap-3 text-left"
          aria-label={t.review.openConversation}
        >
          <span className={`size-2.5 shrink-0 rounded-full ${live ? "bg-lime" : "bg-white/40"}`} />
          <span className="min-w-0 flex-1 truncate">{caption?.text ? `“${caption.text}”` : t.review.dockLive}</span>
          <span className="label text-[0.65rem] text-white/80">{t.review.transcript}</span>
        </button>
        <div className="mt-3 flex items-center gap-3">
          <MicButton live={live} />
          <EndButton onEnd={onEnd} live={live} />
        </div>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-40 flex flex-col bg-ink/60 p-3 pt-16 backdrop-blur-sm lg:hidden" role="dialog" aria-label={t.review.conversation}>
          <button
            type="button"
            onClick={() => setSheet(false)}
            className="label absolute top-4 right-4 rounded-full bg-white px-4 py-2 text-ink"
          >
            {t.session.close}
          </button>
          <VoiceSessionPanel onEnd={onEnd} live={live} />
        </div>
      )}
    </div>
  );
}
