"use client";

import { useMemo, useState } from "react";
import {
  facetOptions,
  matchesFacets,
  matchesQuery,
  nextSort,
  sortRows,
  type CellValue,
  type SortState,
} from "@/lib/table";

export interface Column<T> {
  key: string;
  header: string;
  /** Value used for sorting, filtering and search. */
  value: (row: T) => CellValue;
  /** Rendered cell. Defaults to the raw value. */
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  align?: "left" | "right";
}

export interface Facet {
  key: string;
  label: string;
  /** Overrides the values derived from the data. */
  options?: { value: string; label: string }[];
}

export function DataTable<T>({
  rows,
  columns,
  facets = [],
  searchPlaceholder = "Search…",
  initialSort = null,
  emptyMessage = "Nothing matches those filters.",
  rowKey,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  facets?: Facet[];
  searchPlaceholder?: string;
  initialSort?: SortState | null;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  caption?: string;
}) {
  const [sort, setSort] = useState<SortState | null>(initialSort);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});

  const accessor = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c.value]));
    return (row: T, key: string): CellValue => byKey.get(key)?.(row) ?? null;
  }, [columns]);

  const facetChoices = useMemo(
    () =>
      facets.map((f) => ({
        ...f,
        options: f.options ?? facetOptions(rows, f.key, accessor).map((v) => ({ value: v, label: v })),
      })),
    [facets, rows, accessor],
  );

  const visible = useMemo(() => {
    const searchable = columns.map((c) => c.value);
    const filtered = rows.filter(
      (r) =>
        matchesQuery(searchable.map((f) => f(r)), query) && matchesFacets(r, selected, accessor),
    );
    return sortRows(filtered, sort, accessor);
  }, [rows, columns, query, selected, sort, accessor]);

  const activeFilters =
    (query.trim() ? 1 : 0) + Object.values(selected).filter((v) => v && v !== "all").length;

  return (
    <div>
      {/* ------------------------------------------------------- controls */}
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="table-search" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Search
          </label>
          <input
            id="table-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
        </div>

        {facetChoices.map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`facet-${f.key}`}
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]"
            >
              {f.label}
            </label>
            <select
              id={`facet-${f.key}`}
              value={selected[f.key] ?? "all"}
              onChange={(e) => setSelected((s) => ({ ...s, [f.key]: e.target.value }))}
              className="rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {activeFilters > 0 && (
          <button
            onClick={() => {
              setQuery("");
              setSelected({});
            }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]"
          >
            Clear filters ({activeFilters})
          </button>
        )}

        <p className="ml-auto text-sm text-[var(--color-muted)]" aria-live="polite">
          {visible.length === rows.length
            ? `${rows.length} row${rows.length === 1 ? "" : "s"}`
            : `${visible.length} of ${rows.length}`}
        </p>
      </div>

      {/* ---------------------------------------------------------- table */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[720px] text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-raised)]">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const sortable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={`whitespace-nowrap px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] ${
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => setSort((s) => nextSort(s, c.key))}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--color-ink)] ${
                          active ? "text-[var(--color-ink)]" : ""
                        }`}
                        title={
                          active
                            ? sort!.direction === "asc"
                              ? "Sorted A→Z. Click to reverse."
                              : "Sorted Z→A. Click to clear."
                            : `Sort by ${c.header}`
                        }
                      >
                        {c.header}
                        <span aria-hidden className="text-[10px] leading-none">
                          {active ? (sort!.direction === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-t border-[var(--color-line)] hover:bg-[var(--color-raised)]"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-3 align-middle ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}
                    >
                      {c.render ? c.render(row) : (c.value(row) ?? <span className="text-[var(--color-muted)]">—</span>)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
