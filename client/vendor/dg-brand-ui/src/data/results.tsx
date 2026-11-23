"use client";

import type { ReactNode } from "react";

import { useKitStrings } from "../strings";
import { CtaButton } from "../primitives/Button";
import { ProgressBar } from "../primitives/misc";
import { StatusPill, type Tone } from "../primitives/Pill";

/**
 * Cards for the dark stage: what the agent found, shown while the call goes on.
 */

export type StatusSpec = { label: string; tone: Tone };

export type ResultCardProps = {
  /** The record's id, in tabular figures: CLM-2026-159827 */
  recordId: string;
  status?: StatusSpec;
  /** Who or what: the policyholder's name */
  title: string;
  /** One muted line: "2019 Honda Civic Sport · Theft" */
  subtitle?: string;
  /** One labelled fact at the bottom: Adjuster / Luis Ortega */
  meta?: { label: string; value: string };
  /** Read to screen readers after the card: defaults to the kit's "Open" */
  actionLabel?: string;
  onOpen: () => void;
};

/**
 * One match in a search: a frosted button card on the stage, the whole card pressable. Lay up to
 * four out two by two from md, in a <ul className="grid gap-5 md:grid-cols-2">.
 */
export function ResultCard({ recordId, status, title, subtitle, meta, actionLabel, onOpen }: ResultCardProps) {
  const s = useKitStrings();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass block h-full w-full animate-rise rounded-xl px-7 py-6 text-left text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta"
    >
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="label whitespace-nowrap text-white/70 tabular-nums">{recordId}</span>
        {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
      </span>
      <span className="mt-4 block text-2xl leading-none font-semibold tracking-tight">{title}</span>
      {subtitle && <span className="mt-3.5 block text-sm leading-[1.3]">{subtitle}</span>}
      {meta && (
        <span className="mt-3 block border-t border-white/25 pt-4">
          <span className="label block text-white/70">{meta.label}</span>
          <span className="mt-3 block font-medium">{meta.value || "—"}</span>
        </span>
      )}
      <span className="sr-only">{actionLabel ?? s.open}</span>
    </button>
  );
}

export type FoundCardProps = {
  /** Over the card, with a lime dot: "Found 1 order" */
  kicker: string;
  recordId: string;
  status?: StatusSpec;
  title: string;
  subtitle?: string;
  /** Where it stands: the step's title, and the step number of the total */
  progress?: { label: string; current: number; total: number; done?: boolean };
  /** Two labelled facts at the bottom */
  stats?: { label: string; value: ReactNode }[];
  /** The magenta button under the card: "View order details" */
  action?: { label: string; onClick: () => void };
};

/**
 * The one record the agent found, on the stage, on phones and tablets, before the full record
 * opens. Rises in when it appears.
 */
export function FoundCard({ kicker, recordId, status, title, subtitle, progress, stats, action }: FoundCardProps) {
  return (
    <section className="animate-rise text-white">
      <p className="label flex items-center gap-2.5">
        <span className="size-2.5 rounded-full bg-lime" aria-hidden="true" />
        {kicker}
      </p>
      <div className="glass mt-4 rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="text-lg font-medium whitespace-nowrap tabular-nums">{recordId}</span>
          {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-lg text-white/75">{subtitle}</p>}
        {progress && (
          <>
            <div className="mt-5 flex items-center justify-between font-semibold">
              <span>{progress.label}</span>
              <span className="label text-white/80">
                {progress.current} / {progress.total}
              </span>
            </div>
            <ProgressBar
              className="mt-2"
              label={progress.label}
              value={progress.done ? 1 : (progress.current - 0.5) / progress.total}
            />
          </>
        )}
        {stats && (
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="label text-white/75">{stat.label}</dt>
                <dd className="mt-1 text-lg">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {action && (
        <CtaButton className="mt-5" onClick={action.onClick}>
          {action.label} <span aria-hidden="true">→</span>
        </CtaButton>
      )}
    </section>
  );
}
