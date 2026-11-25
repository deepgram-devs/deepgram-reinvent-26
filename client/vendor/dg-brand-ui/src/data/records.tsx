"use client";

import type { ReactNode } from "react";

import { FocusTarget } from "../focus/Focus";
import { cx } from "../lib/cx";
import { useKitStrings } from "../strings";

/**
 * Components for the record screen: the light, paper page that shows what the agent found
 * (a support case, an order, an account, a claim). All of them sit on paper.
 */

export type DataCardProps = {
  /** The FocusTarget id the agent points at: "estimate", "coverage" */
  id: string;
  /** Letter-spaced section title: WHEN & WHERE */
  title: string;
  children: ReactNode;
  className?: string;
};

/** A white card with a letter-spaced title. The building block of the record screen. */
export function DataCard({ id, title, children, className }: DataCardProps) {
  return (
    <FocusTarget id={id} className={cx("card p-6", className)}>
      <h2 className="label text-fg/80">{title}</h2>
      <div className="mt-5">{children}</div>
    </FocusTarget>
  );
}

/**
 * A label over a value, inside a <dl>. Stack them with <dl className="space-y-4"> or lay them out
 * with <dl className="grid grid-cols-2 gap-4">.
 */
export function Field({ label, children, numeric = false }: { label: string; children: ReactNode; numeric?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cx("mt-0.5 text-lg leading-snug", numeric && "text-base tabular-nums")}>{children}</dd>
    </div>
  );
}

export type LineItem = { label: string; value: string; /** Indented and muted: a breakdown of the row above */ sub?: boolean };

/** Label and amount rows with hairlines, and an optional bold total: an estimate, payments. */
export function LineItems({ rows, total }: { rows: LineItem[]; total?: { label: string; value: string } }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className={cx("flex items-baseline justify-between gap-4 py-2.5", row.sub && "pl-3 text-muted")}>
          <dt className="min-w-0 text-[0.95rem]">{row.label}</dt>
          <dd className="max-w-[60%] shrink-0 text-right text-[0.95rem] text-balance tabular-nums">{row.value}</dd>
        </div>
      ))}
      {total && (
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <dt className="font-semibold">{total.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{total.value}</dd>
        </div>
      )}
    </dl>
  );
}

export type NoteItem = { date: string; text: ReactNode };

/** Dated notes, oldest first: an adjuster's log, an order's history. */
export function NoteList({ notes, className }: { notes: NoteItem[]; className?: string }) {
  return (
    <ol className={cx("space-y-4", className)}>
      {notes.map((note, i) => (
        <li key={i} className="grid grid-cols-[6.5rem_1fr] gap-4">
          <span className="label pt-0.5 text-muted">{note.date}</span>
          <span className="leading-snug">{note.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** Dashed placeholder tiles with captions, where photos or documents would go. */
export function PlaceholderGrid({ captions, columns = 3 }: { captions: string[]; columns?: 2 | 3 | 4 }) {
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[columns];
  return (
    <ul className={cx("grid gap-2.5", cols)}>
      {captions.map((caption) => (
        <li
          key={caption}
          title={caption}
          className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-fg/25 bg-paper p-2 text-center text-xs leading-tight text-muted"
        >
          <span className="line-clamp-3">{caption}</span>
        </li>
      ))}
    </ul>
  );
}

export type StepState = "done" | "active" | "pending" | "stopped";
export type Step = { title: string; detail?: string; state: StepState };

const STEP_DOT: Record<StepState, string> = {
  done: "bg-fg text-card",
  active: "bg-magenta text-ink ring-4 ring-magenta/25",
  pending: "border-2 border-fg/25 text-muted bg-card",
  stopped: "bg-red text-white",
};

/**
 * Where a process stands: Opened → Assigned → Working → Resolved. Done steps get a check,
 * the active one is magenta, a stopped one (denied, cancelled) is red. Two columns on phones.
 */
export function ProgressStepper({ id = "progress", steps, label }: { id?: string; steps: Step[]; label?: string }) {
  return (
    <FocusTarget id={id} className="card px-6 py-6 sm:px-9">
      <ol aria-label={label} className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="relative" aria-current={step.state === "active" ? "step" : undefined}>
            <div className="flex items-center">
              <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums", STEP_DOT[step.state])}>
                {step.state === "done" ? "✓" : step.state === "stopped" ? "✕" : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cx(
                    "mx-3 hidden h-0 flex-1 border-t-2 md:block",
                    steps[i + 1].state === "pending" ? "border-dashed border-fg/20" : "border-fg",
                  )}
                />
              )}
            </div>
            <p className={cx("mt-3 font-semibold", step.state === "active" && "text-violet dark:text-violet-3", step.state === "stopped" && "text-red")}>
              {step.title}
            </p>
            {step.detail && <p className="mt-0.5 text-sm text-muted">{step.detail}</p>}
          </li>
        ))}
      </ol>
    </FocusTarget>
  );
}

/** A frosted tile inside the HighlightBand: who and what the record is about. */
export function GlassTile({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
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

export type Stat = { label: string; value: ReactNode };

/**
 * The magenta band at the top of a record: two GlassTiles (who, what) and a strip of the four
 * numbers people ask about first. One per record screen.
 */
export function HighlightBand({ id = "summary", children, stats }: { id?: string; children: ReactNode; stats?: Stat[] }) {
  return (
    <FocusTarget id={id} className="magenta-band rounded-panel p-5 text-ink sm:p-7">
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
      {stats && (
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 px-2 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="label text-ink/80">{stat.label}</dt>
              <dd className="mt-1.5 text-lg font-semibold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </FocusTarget>
  );
}

export type PageHeaderProps = {
  /** CLAIMS / AUTO / — the record's own id follows in ink */
  breadcrumb?: string;
  /** The record's id, at the end of the breadcrumb and in the meta line */
  recordId?: string;
  /** A short imperative with a period: "Review this case." */
  title: string;
  /** StatusPill, LockPill */
  pills?: ReactNode;
  /** Under the title, muted: "Case CASE-1 · Last updated Nov 11" */
  meta?: ReactNode;
  id?: string;
};

/** The record screen's heading: breadcrumb, big title with pills, a muted meta line. */
export function PageHeader({ breadcrumb, recordId, title, pills, meta, id = "header" }: PageHeaderProps) {
  const s = useKitStrings();
  return (
    <FocusTarget id={id} as="div">
      {(breadcrumb || recordId) && (
        <nav aria-label={s.breadcrumb} className="label text-muted">
          {breadcrumb} {recordId && <span className="text-fg">{recordId}</span>}
        </nav>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display mr-2 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        {pills}
      </div>
      {meta && <p className="mt-3 text-muted">{meta}</p>}
    </FocusTarget>
  );
}

/**
 * Cards of different heights in balanced columns: two from md, three from 2xl. Put DataCards in
 * it in reading order; a full-width card goes after it.
 */
export function CardColumns({ children }: { children: ReactNode }) {
  return <div className="gap-6 md:columns-2 2xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">{children}</div>;
}
