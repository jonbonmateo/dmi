"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { ClassificationDot } from "@/components/ui";
import type { Classification, RunState } from "@/lib/types";

export interface RunRow {
  id: string;
  shopName: string;
  contact: string | null;
  inspectionDate: string;
  totalScore: number | null;
  potentialScore: number;
  classification: Classification | null;
  state: RunState;
  mode: "live" | "mock";
  openReviews: number;
  weekOf: string | null;
  weeklyStatus: string | null;
}

const STATE_LABEL: Record<RunState, string> = {
  queued: "Queued",
  running: "Running",
  needs_review: "Needs review",
  completed: "Completed",
  failed: "Failed",
};

export function RunsTable({ rows }: { rows: RunRow[] }) {
  const columns: Column<RunRow>[] = [
    {
      key: "shopName",
      header: "Shop",
      value: (r) => r.shopName,
      render: (r) => (
        <div className="min-w-0">
          <Link href={`/dmi/${r.id}`} className="font-medium text-[var(--color-brand)] hover:underline">
            {r.shopName}
          </Link>
          {r.contact && <p className="text-xs text-[var(--color-muted)]">{r.contact}</p>}
        </div>
      ),
    },
    {
      key: "inspectionDate",
      header: "Inspected",
      value: (r) => r.inspectionDate,
      render: (r) => <span className="tabular text-[var(--color-muted)]">{r.inspectionDate}</span>,
    },
    {
      key: "totalScore",
      header: "Score",
      value: (r) => r.totalScore,
      align: "right",
      render: (r) =>
        r.classification ? (
          <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
            <ClassificationDot c={r.classification} />
            <span className="tabular font-semibold">{r.totalScore}/20</span>
            {r.potentialScore > (r.totalScore ?? 0) && (
              <span className="tabular text-xs text-[var(--color-muted)]">→{r.potentialScore}</span>
            )}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "classification",
      header: "Band",
      value: (r) => r.classification,
      render: (r) =>
        r.classification ? (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
            style={{
              color: `var(--color-${r.classification})`,
              background: `var(--color-${r.classification}-soft)`,
            }}
          >
            {r.classification}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "state",
      header: "State",
      value: (r) => r.state,
      render: (r) => (
        <span className="whitespace-nowrap">
          {STATE_LABEL[r.state]}
          {r.openReviews > 0 && (
            <span className="ml-2 rounded-full bg-[var(--color-yellow-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-yellow)]">
              {r.openReviews} open
            </span>
          )}
        </span>
      ),
    },
    {
      key: "mode",
      header: "Data",
      value: (r) => r.mode,
      render: (r) => (
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            color: r.mode === "live" ? "var(--color-live)" : "var(--color-mock)",
            background: r.mode === "live" ? "var(--color-live-soft)" : "var(--color-mock-soft)",
          }}
        >
          {r.mode}
        </span>
      ),
    },
    {
      key: "weekOf",
      header: "Week of",
      value: (r) => r.weekOf,
      render: (r) => <span className="tabular text-[var(--color-muted)]">{r.weekOf ?? "—"}</span>,
    },
    { key: "weeklyStatus", header: "Weekly status", value: (r) => r.weeklyStatus },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      caption="Digital Marketing Inspections"
      searchPlaceholder="Shop, contact, band…"
      initialSort={{ key: "inspectionDate", direction: "desc" }}
      facets={[
        { key: "classification", label: "Band" },
        {
          key: "state",
          label: "State",
          options: (["queued", "running", "needs_review", "completed", "failed"] as RunState[]).map((s) => ({
            value: s,
            label: STATE_LABEL[s],
          })),
        },
        { key: "mode", label: "Data" },
        { key: "weeklyStatus", label: "Weekly status" },
      ]}
      emptyMessage="No inspections match those filters."
    />
  );
}
