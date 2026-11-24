"use client";

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { FocusTarget, useFocus } from "../focus/Focus";
import { cx } from "../lib/cx";
import { Select } from "../primitives/Select";
import { useKitStrings } from "../strings";
import { sortBy, type GridSort, type SortValue } from "./sort";

export type { GridSort, SortValue };

export type DataGridColumn<Row> = {
  /** Names the column; also the sort key, and where the default cell reads its value: row[key] */
  key: string;
  /** Sentence case; the label utility uppercases it: "Owner", "Last update" */
  header: string;
  /** What the cell shows. Default: row[key] as text, or "—" when empty. */
  cell?: (row: Row) => ReactNode;
  /** What the column sorts by. Default: row[key]. Give one for formatted values: "$1,240" → 1240. */
  sortValue?: (row: Row) => SortValue;
  /** Whether the header sorts. Default true. */
  sortable?: boolean;
  /** Right-aligned tabular figures: amounts, counts, durations */
  numeric?: boolean;
  /**
   * The column that names the row (a person, a product). It's semibold, it's the open button
   * when rows open, and it heads each phone card. Default: the first column.
   */
  primary?: boolean;
  /** Leave the column out of the phone cards, for long or secondary details */
  hideOnPhone?: boolean;
  /** Classes for the column's header and cells, such as a width: "w-40" */
  className?: string;
};

const TONE = {
  /** A white card on paper: the record screen, a staff queue */
  paper: {
    frame: "card",
    title: "text-fg/80",
    head: "border-line text-muted",
    rows: "divide-line",
    hover: "hover:bg-paper",
    lit: "bg-magenta/10",
    muted: "text-muted",
    card: "card",
    cardHover: "hover:border-fg/30",
  },
  /** Frosted glass on the stage: search results during a call */
  stage: {
    frame: "glass rounded-3xl text-white",
    title: "text-white/90",
    head: "border-white/20 text-white/70",
    rows: "divide-white/15",
    hover: "hover:bg-white/10",
    lit: "bg-magenta/20",
    muted: "text-white/70",
    card: "glass rounded-3xl text-white",
    cardHover: "hover:border-white/40 hover:bg-white/15",
  },
};

export type DataGridProps<Row> = {
  rows: Row[];
  columns: DataGridColumn<Row>[];
  /**
   * Each row's id: its React key and the FocusTarget id the agent points at, usually the record's
   * id. pointAt(["CASE-20418"]) tints that row, glows it once, and scrolls it into view.
   */
  rowId: (row: Row) => string;
  /** Letter-spaced title over the grid, which also names the table: OPEN CASES */
  title?: string;
  /** The FocusTarget id of the whole grid, so the agent can point at all of it */
  id?: string;
  tone?: keyof typeof TONE;
  /**
   * Makes rows open: the primary cell becomes a button, the whole row is clickable, and phone
   * cards become buttons. Leave it out for a read-only grid.
   */
  onRowOpen?: (row: Row) => void;
  /** The phone card's action, after the arrow. Defaults to the kit's "Open". */
  actionLabel?: string;
  /** The first sort, before anyone picks one. Default: the rows' own order. */
  defaultSort?: GridSort;
  /** Control the sort yourself (with onSortChange), such as when the agent sorts by voice */
  sort?: GridSort | null;
  onSortChange?: (sort: GridSort) => void;
  /** Shown when there are no rows. Defaults to the kit's "No matches." */
  empty?: ReactNode;
  className?: string;
};

const EMPTY_VALUES = new Set<unknown>([null, undefined, ""]);

function read(row: unknown, key: string): unknown {
  return (row as Record<string, unknown>)?.[key];
}

function sortRows<Row>(rows: Row[], columns: DataGridColumn<Row>[], sort: GridSort | null): Row[] {
  const column = sort && columns.find((c) => c.key === sort.key);
  if (!sort || !column) return rows;
  return sortBy(rows, column.sortValue ?? ((row: Row) => read(row, column.key) as SortValue), sort.direction);
}

function defaultCell(row: unknown, key: string): ReactNode {
  const value = read(row, key);
  if (EMPTY_VALUES.has(value)) return "—";
  return typeof value === "string" || typeof value === "number" ? value : String(value);
}

/** Restart an element's CSS animation, so pointing at the same row again glows again */
function replay(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

function SortArrow({ direction }: { direction?: "asc" | "desc" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={cx("size-3.5 shrink-0 transition", !direction && "opacity-0 group-hover:opacity-50")}>
      <path
        d={direction === "desc" ? "M8 3v10M4 9l4 4 4-4" : "M8 13V3M4 7l4-4 4 4"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Rows of records with sortable columns: a staff queue on paper, or many search results on the
 * stage. Rows can open, and the agent can point at a row by its id. Below sm the rows become
 * stacked cards, with a Sort by select in place of the headers.
 */
export function DataGrid<Row>({
  rows,
  columns,
  rowId,
  title,
  id,
  tone = "paper",
  onRowOpen,
  actionLabel,
  defaultSort,
  sort: controlledSort,
  onSortChange,
  empty,
  className,
}: DataGridProps<Row>) {
  const s = useKitStrings();
  const t = TONE[tone];
  const titleId = useId();
  const sortId = useId();
  const [ownSort, setOwnSort] = useState<GridSort | null>(defaultSort ?? null);
  const sort = controlledSort === undefined ? ownSort : controlledSort;
  const setSort = (next: GridSort) => {
    if (controlledSort === undefined) setOwnSort(next);
    onSortChange?.(next);
  };
  const toggle = (key: string) =>
    setSort({ key, direction: sort?.key === key && sort.direction === "asc" ? "desc" : "asc" });

  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);
  const primaryKey = (columns.find((c) => c.primary) ?? columns[0])?.key;
  const sortable = columns.filter((c) => c.sortable !== false);
  const head = columns.find((c) => c.key === primaryKey);
  const rest = columns.filter((c) => c.key !== primaryKey && !c.hideOnPhone);

  // The agent points at rows: tint them, glow them once, and bring the first into view
  const { highlight } = useFocus();
  const lit = (rid: string) => highlight?.ids.includes(rid) ?? false;
  const tableRows = useRef(new Map<string, HTMLElement>());
  const cards = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (!highlight) return;
    for (const rid of highlight.ids) {
      replay(tableRows.current.get(rid));
      replay(cards.current.get(rid));
    }
    // Only one layout is showing; scroll the row or card that is
    const first = highlight.ids[0];
    const shown = [tableRows.current.get(first), cards.current.get(first)].find((el) => el && el.getClientRects().length > 0);
    shown?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight]);

  const register = (map: Map<string, HTMLElement>, rid: string) => (el: HTMLElement | null) => {
    if (el) map.set(rid, el);
    else map.delete(rid);
  };

  const open = onRowOpen;
  const body = !sorted.length ? (
    <p className={cx("px-1 py-4 text-lg sm:px-6 sm:py-8", t.muted)}>{empty ?? s.noRows}</p>
  ) : (
    <>
      {/* sm and up: a table */}
      <div className="hidden overflow-x-auto sm:block">
        <table aria-labelledby={title ? titleId : undefined} className="w-full text-left">
          <thead>
            <tr className={cx("border-b", t.head)}>
              {columns.map((column) => {
                const active = sort?.key === column.key ? sort.direction : undefined;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
                    className={cx("label px-4 py-3 text-[0.7rem] font-medium first:pl-6 last:pr-6", column.numeric && "text-right", column.className)}
                  >
                    {column.sortable === false ? (
                      column.header
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggle(column.key)}
                        className={cx(
                          "group label inline-flex items-center gap-1.5 rounded-full text-[0.7rem] font-medium transition hover:text-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta",
                          column.numeric && "flex-row-reverse",
                          active && (tone === "paper" ? "text-fg" : "text-white"),
                        )}
                      >
                        {column.header}
                        <SortArrow direction={active} />
                      </button>
                    )}
                  </th>
                );
              })}
              {open && <td aria-hidden="true" className="w-10 pr-6" />}
            </tr>
          </thead>
          <tbody className={cx("divide-y", t.rows)}>
            {sorted.map((row) => {
              const rid = rowId(row);
              const on = lit(rid);
              return (
                <tr
                  key={rid}
                  ref={register(tableRows.current, rid)}
                  onClick={
                    open &&
                    ((event) => {
                      // Other controls in a cell (a link, a button) keep their own clicks
                      const hit = (event.target as Element).closest("a,button,input,select,textarea,label");
                      if (hit && !hit.hasAttribute("data-row-open")) return;
                      open(row);
                    })
                  }
                  className={cx(
                    "group/row scroll-m-24 transition-colors",
                    open && cx("cursor-pointer", t.hover),
                    on && cx("animate-glow", t.lit),
                  )}
                >
                  {columns.map((column, i) => {
                    const content = column.cell ? column.cell(row) : defaultCell(row, column.key);
                    const primary = column.key === primaryKey;
                    return (
                      <td
                        key={column.key}
                        className={cx(
                          "px-4 py-3.5 align-middle first:pl-6 last:pr-6",
                          column.numeric && "text-right tabular-nums",
                          primary && "font-semibold whitespace-nowrap",
                          i === 0 && on && "shadow-[inset_3px_0_0_var(--color-magenta)]",
                          column.className,
                        )}
                      >
                        {primary && open ? (
                          <button
                            type="button"
                            data-row-open
                            className="rounded-sm text-left underline-offset-4 group-hover/row:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta"
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                  {open && (
                    <td aria-hidden="true" className={cx("pr-6 text-right transition group-hover/row:text-magenta", t.muted)}>
                      →
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked cards, and a select for the sort */}
      <div className="space-y-4 sm:hidden">
        {sortable.length > 0 && (
          <div className="flex items-center gap-3 px-1">
            <label htmlFor={sortId} className={cx("label shrink-0 text-[0.7rem]", t.muted)}>
              {s.sortBy}
            </label>
            <Select
              id={sortId}
              className="min-w-0 flex-1"
              value={sort ? `${sort.key}:${sort.direction}` : ""}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(":");
                if (key) setSort({ key, direction: direction as GridSort["direction"] });
              }}
            >
              {!sort && <option value="">—</option>}
              {sortable.flatMap((column) =>
                (["asc", "desc"] as const).map((direction) => (
                  <option key={`${column.key}:${direction}`} value={`${column.key}:${direction}`}>
                    {s.sortOption(column.header, direction, Boolean(column.numeric))}
                  </option>
                )),
              )}
            </Select>
          </div>
        )}
        <ul aria-labelledby={title ? titleId : undefined} className="space-y-3">
          {sorted.map((row) => {
            const rid = rowId(row);
            const on = lit(rid);
            const cell = (column: DataGridColumn<Row>) => (column.cell ? column.cell(row) : defaultCell(row, column.key));
            const Facts = open ? "span" : "dl";
            const Pair = open ? "span" : "div";
            const Term = open ? "span" : "dt";
            const Value = open ? "span" : "dd";
            const inner = (
              <>
                {head && <span className="block text-xl font-semibold tracking-tight">{cell(head)}</span>}
                <Facts className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                  {rest.map((column) => (
                    <Pair key={column.key} className="block max-w-full min-w-0">
                      <Term className={cx("label block text-[0.65rem]", t.muted)}>{column.header}</Term>
                      <Value className={cx("mt-1 block", column.numeric && "tabular-nums")}>{cell(column)}</Value>
                    </Pair>
                  ))}
                </Facts>
                {open && (
                  <span className={cx("label mt-4 flex justify-end border-t pt-3 text-[0.7rem]", t.head)}>
                    {actionLabel ?? s.open} <span aria-hidden="true">&nbsp;→</span>
                  </span>
                )}
              </>
            );
            const classes = cx(
              "block w-full scroll-m-24 p-5 text-left transition",
              t.card,
              on && cx("animate-glow ring-2 ring-magenta", t.lit),
            );
            return (
              <li key={rid}>
                {open ? (
                  <button
                    type="button"
                    ref={register(cards.current, rid)}
                    onClick={() => open(row)}
                    className={cx(classes, t.cardHover, "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta")}
                  >
                    {inner}
                  </button>
                ) : (
                  <div ref={register(cards.current, rid)} className={classes}>
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );

  const content = (
    <>
      {title && (
        <h2 id={titleId} className={cx("label px-1 pb-4 sm:px-6 sm:pt-6", t.title)}>
          {title}
        </h2>
      )}
      {body}
    </>
  );

  // Phones drop the frame: each row is its own card
  const frame = cx("sm:pb-2", "max-sm:border-0 max-sm:bg-transparent max-sm:backdrop-blur-none", t.frame, className);
  return id ? (
    <FocusTarget id={id} className={frame}>
      {content}
    </FocusTarget>
  ) : (
    <section className={frame}>{content}</section>
  );
}
