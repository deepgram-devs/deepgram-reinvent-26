"use client";

import type { ReactNode } from "react";

import { cx } from "../lib/cx";
import { LockPill, StatusPill, Chip } from "../primitives/Pill";
import { SketchMap } from "./SketchMap";
import {
  CardColumns,
  DataCard,
  Field,
  GlassTile,
  HighlightBand,
  LineItems,
  NoteList,
  PageHeader,
  PlaceholderGrid,
  ProgressStepper,
  type LineItem,
  type NoteItem,
  type Stat,
  type Step,
} from "./records";
import type { FoundCardProps, StatusSpec } from "./results";

/**
 * A record as data: whatever the agent looks up, in any domain (a support case, an order, a
 * claim, a card dispute, an appointment). Describe it once and RecordBody draws the whole record
 * screen. Keep values to strings and numbers and the bot can send it as JSON in a server message.
 *
 * Every section has an id: the name the agent uses to point at it (see FocusTarget).
 */
export type RecordView = {
  /** The record's own id, shown in tabular figures: CASE-20418, ORD-58213 */
  id: string;
  /** Before the id, letter-spaced: "Support / Cases /" */
  breadcrumb?: string;
  /** A short imperative with a period: "Review this case." */
  title: string;
  /** What the record is called, for the meta line and the found card: "Case", "Order" */
  noun?: string;
  status?: StatusSpec;
  /** Shows a lock pill: true for "View only", or your own words */
  readOnly?: boolean | string;
  /** Muted, after the id: "Last updated Nov 11, 2026" */
  updated?: string;
  /** Three to five steps of the record's process */
  steps?: Step[];
  /** The highlight band's two tiles: who it's about, and what */
  tiles?: RecordTile[];
  /** The highlight band's strip: the four numbers people ask about first */
  stats?: Stat[];
  /** The cards, in reading order, balanced into columns */
  sections: RecordSection[];
  /** Full-width cards after the columns: history, notes */
  wideSections?: RecordSection[];
};

export type RecordTile = {
  /** Letter-spaced: CUSTOMER, INSURED VEHICLE */
  label: string;
  /** Big: the person's name, the product */
  title: string;
  /** Up to three short lines under it: an account number, a date */
  lines?: string[];
  /** A 20px stroke icon on the right (UserIcon, BoxIcon, ...) */
  icon?: ReactNode;
};

export type RecordField = { label: string; value: ReactNode; /** Tabular figures, a little smaller: ids, numbers */ numeric?: boolean };

type SectionBase = {
  /** The agent's name for this card, and its DOM id: "billing", "delivery" */
  id: string;
  /** Letter-spaced card title: BILLING, WHEN & WHERE */
  title: string;
};

/** The kinds of card a record is made of */
export type RecordSection = SectionBase &
  (
    | {
        /** Labelled values. columns: 1 stacks them; 2 or 4 lays them out in a grid. */
        type: "fields";
        fields: RecordField[];
        columns?: 1 | 2 | 4;
        /** More fields under a hairline, such as the other party */
        more?: RecordField[];
      }
    | {
        /** Money: label and amount rows with a bold total */
        type: "amounts";
        rows: LineItem[];
        total?: { label: string; value: string };
      }
    | {
        /** A paragraph: what happened, the customer's own words */
        type: "text";
        text: string;
      }
    | {
        /** Dated notes, oldest first, with optional fields above them */
        type: "notes";
        notes: NoteItem[];
        fields?: RecordField[];
      }
    | {
        /** A place: a sketched map from road names, then fields */
        type: "place";
        roads?: string[];
        city?: string;
        fields?: RecordField[];
      }
    | {
        /** Photos or documents on file, as captioned placeholders */
        type: "files";
        captions: string[];
        /** A line above the tiles: "5 photos on file" */
        summary?: string;
      }
    | {
        /** A one-line condition with a colored dot, then chips: damage areas, flags, symptoms */
        type: "tags";
        summary?: string;
        /** The summary's dot: ok (lime), warn (orange), bad (red) */
        level?: "ok" | "warn" | "bad";
        tags: { label: string; tone?: "danger" | "neutral" }[];
      }
    | {
        /** Anything else: a diagram, a chart. Not serializable; build it in the app. */
        type: "custom";
        render: () => ReactNode;
      }
  );

const LEVEL_DOT = { ok: "bg-lime", warn: "bg-orange", bad: "bg-red" };

function FieldList({ fields, columns = 1, className }: { fields: RecordField[]; columns?: 1 | 2 | 4; className?: string }) {
  const layout = columns === 1 ? "space-y-4" : columns === 2 ? "grid grid-cols-2 gap-4" : "grid grid-cols-2 gap-4 sm:grid-cols-4";
  return (
    <dl className={cx(layout, className)}>
      {fields.map((field) => (
        <Field key={field.label} label={field.label} numeric={field.numeric}>
          {field.value}
        </Field>
      ))}
    </dl>
  );
}

/** One section of a RecordView as a DataCard */
export function RecordSectionCard({ section }: { section: RecordSection }) {
  const { id, title } = section;
  switch (section.type) {
    case "fields":
      return (
        <DataCard id={id} title={title}>
          <FieldList fields={section.fields} columns={section.columns} />
          {section.more && <FieldList className="mt-5 border-t border-line pt-5" fields={section.more} columns={section.columns} />}
        </DataCard>
      );
    case "amounts":
      return (
        <DataCard id={id} title={title}>
          <LineItems rows={section.rows} total={section.total} />
        </DataCard>
      );
    case "text":
      return (
        <DataCard id={id} title={title}>
          <p className="text-[1.05rem] leading-relaxed">{section.text}</p>
        </DataCard>
      );
    case "notes":
      return (
        <DataCard id={id} title={title}>
          {section.fields && <FieldList fields={section.fields} columns={4} className="mb-6 border-b border-line pb-5" />}
          <NoteList notes={section.notes} />
        </DataCard>
      );
    case "place":
      return (
        <DataCard id={id} title={title}>
          <SketchMap roads={section.roads} city={section.city} />
          {section.fields && <FieldList className="mt-5" fields={section.fields} />}
        </DataCard>
      );
    case "files":
      return (
        <DataCard id={id} title={title}>
          {section.summary && <p className="mb-3 text-sm text-muted">{section.summary}</p>}
          <PlaceholderGrid captions={section.captions} />
        </DataCard>
      );
    case "tags":
      return (
        <DataCard id={id} title={title}>
          {section.summary && (
            <p className="flex items-start gap-2.5 text-lg leading-snug">
              <span className={cx("mt-2 size-2.5 shrink-0 rounded-full", LEVEL_DOT[section.level ?? "warn"])} aria-hidden="true" />
              {section.summary}
            </p>
          )}
          <ul className={cx("flex flex-wrap gap-2", section.summary && "mt-4")}>
            {section.tags.map((tag) => (
              <li key={tag.label}>
                <Chip tone={tag.tone ?? "danger"}>{tag.label}</Chip>
              </li>
            ))}
          </ul>
        </DataCard>
      );
    case "custom":
      return (
        <DataCard id={id} title={title}>
          {section.render()}
        </DataCard>
      );
  }
}

/**
 * The whole record screen's content from a RecordView: PageHeader, ProgressStepper, HighlightBand,
 * the sections in balanced columns, and the wide sections. Put it in RecordLayout's main slot, inside
 * a FocusProvider. To change one part, build the screen from the pieces instead (RecordSectionCard
 * renders any one section).
 */
export function RecordBody({ record, before, after }: { record: RecordView; /** Above the stepper */ before?: ReactNode; /** At the end */ after?: ReactNode }) {
  const lock = record.readOnly ? <LockPill>{typeof record.readOnly === "string" ? record.readOnly : undefined}</LockPill> : null;
  return (
    <>
      <PageHeader
        breadcrumb={record.breadcrumb}
        recordId={record.id}
        title={record.title}
        pills={
          (record.status || lock) && (
            <>
              {record.status && <StatusPill tone={record.status.tone}>{record.status.label}</StatusPill>}
              {lock}
            </>
          )
        }
        meta={
          (record.noun || record.updated) && (
            <>
              {record.noun && (
                <>
                  {record.noun} <span className="font-medium text-fg tabular-nums">{record.id}</span>
                </>
              )}
              {record.updated && <span className="mx-3">{record.updated}</span>}
            </>
          )
        }
      />
      {before}
      {!!record.steps?.length && <ProgressStepper steps={record.steps} label={record.noun ? `${record.noun} progress` : undefined} />}
      {(!!record.tiles?.length || !!record.stats?.length) && (
        <HighlightBand stats={record.stats}>
          {record.tiles?.map((tile) => (
            <GlassTile key={tile.label} label={tile.label} icon={tile.icon && <span className="text-ink [&>svg]:size-5">{tile.icon}</span>}>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{tile.title}</p>
              {tile.lines?.map((line, i) => (
                <p key={line} className={cx("tabular-nums", i === 0 ? "mt-3" : "mt-1 text-ink/75")}>
                  {line}
                </p>
              ))}
            </GlassTile>
          ))}
        </HighlightBand>
      )}
      <CardColumns>
        {record.sections.map((section) => (
          <RecordSectionCard key={section.id} section={section} />
        ))}
      </CardColumns>
      {record.wideSections?.map((section) => (
        <RecordSectionCard key={section.id} section={section} />
      ))}
      {after}
    </>
  );
}

/**
 * Where a process stands, from its steps: the active (or stopped) step's title, its number, and the
 * total. For FoundCard's progress.
 */
export function stepProgress(steps: Step[]): NonNullable<FoundCardProps["progress"]> | undefined {
  if (!steps.length) return undefined;
  const index = steps.findIndex((s) => s.state === "active" || s.state === "stopped");
  const done = index < 0 && steps.every((s) => s.state === "done");
  const current = index >= 0 ? index : done ? steps.length - 1 : 0;
  return { label: steps[current].title, current: current + 1, total: steps.length, done };
}

/** The props for a FoundCard from a RecordView: id, status, the first tile, and progress */
export function foundCardFor(
  record: RecordView,
  { kicker, action, stats }: Pick<FoundCardProps, "kicker" | "action" | "stats">,
): FoundCardProps {
  const tile = record.tiles?.[1] ?? record.tiles?.[0];
  return {
    kicker,
    recordId: record.id,
    status: record.status,
    title: tile?.title ?? record.title,
    subtitle: tile?.lines?.join(" · "),
    progress: record.steps ? stepProgress(record.steps) : undefined,
    stats: stats ?? record.stats?.slice(0, 2),
    action,
  };
}
