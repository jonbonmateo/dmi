/**
 * Sorting and filtering for the app's tables.
 *
 * Kept as pure functions over plain rows so they can be unit-tested without a
 * DOM, and reused by every table rather than reimplemented per page.
 */

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

export type CellValue = string | number | null | undefined;

/**
 * Comparison that does the right thing for the three kinds of value these
 * tables actually hold: numbers, ISO dates, and text.
 *
 * Nulls always sort last regardless of direction — an empty cell is not
 * "smaller", it is absent, and burying it is what a reader expects.
 */
export function compareValues(a: CellValue, b: CellValue, direction: SortDirection): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  let result: number;
  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    const as = String(a);
    const bs = String(b);
    // localeCompare with numeric collation sorts "Shop 2" before "Shop 10".
    result = as.localeCompare(bs, "en", { numeric: true, sensitivity: "base" });
  }
  return direction === "asc" ? result : -result;
}

export function sortRows<T>(
  rows: T[],
  sort: SortState | null,
  accessor: (row: T, key: string) => CellValue,
): T[] {
  if (!sort) return rows;
  // Copy first: sorting the caller's array in place breaks React memoisation.
  return [...rows].sort((x, y) =>
    compareValues(accessor(x, sort.key), accessor(y, sort.key), sort.direction),
  );
}

/** Clicking a column cycles asc → desc → back to the default order. */
export function nextSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

/**
 * Free-text search across the given fields. Every whitespace-separated term
 * must match somewhere, so "miller yellow" narrows rather than widens.
 */
export function matchesQuery(haystacks: CellValue[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const blob = haystacks
    .filter((h) => h !== null && h !== undefined)
    .map((h) => String(h).toLowerCase())
    .join(" ");
  return q.split(/\s+/).every((term) => blob.includes(term));
}

export function matchesFacets<T>(
  row: T,
  facets: Record<string, string>,
  accessor: (row: T, key: string) => CellValue,
): boolean {
  return Object.entries(facets).every(([key, want]) => {
    if (!want || want === "all") return true;
    const value = accessor(row, key);
    return value !== null && value !== undefined && String(value) === want;
  });
}

/** Distinct non-empty values for a column, for building a filter dropdown. */
export function facetOptions<T>(
  rows: T[],
  key: string,
  accessor: (row: T, key: string) => CellValue,
): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = accessor(r, key);
    if (v !== null && v !== undefined && v !== "") seen.add(String(v));
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
