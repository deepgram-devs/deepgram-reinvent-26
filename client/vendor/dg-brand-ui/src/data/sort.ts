/**
 * Sorting for DataGrid and <deepgram-data-grid>, with no React, so both sort the same way.
 */

/** Which column the rows are sorted by, and which way */
export type GridSort = { key: string; direction: "asc" | "desc" };

/** What a column sorts by. Empty values (null, undefined, "") sort last either way. */
export type SortValue = string | number | boolean | Date | null | undefined;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** A sort value as a number, a string, or null for empty */
export function normalizeSortValue(value: SortValue): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/**
 * Sort items by a value, stably. Numbers compare as numbers; strings compare naturally
 * ("CASE-9" before "CASE-10"), ignoring case; empty values go last in both directions.
 */
export function sortBy<T>(items: T[], valueOf: (item: T) => SortValue, direction: GridSort["direction"]): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return items
    .map((item) => ({ item, value: normalizeSortValue(valueOf(item)) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? 0 : a.value === null ? 1 : -1;
      if (typeof a.value === "number" && typeof b.value === "number") return sign * (a.value - b.value);
      return sign * collator.compare(String(a.value), String(b.value));
    })
    .map(({ item }) => item);
}

/** "status:desc" → { key: "status", direction: "desc" }; a bare key sorts ascending */
export function parseSort(text: string | null | undefined): GridSort | null {
  if (!text) return null;
  const [key, direction] = text.trim().split(":");
  if (!key) return null;
  return { key, direction: direction === "desc" ? "desc" : "asc" };
}
