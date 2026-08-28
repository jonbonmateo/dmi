"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { ClassificationDot } from "@/components/ui";
import type { Classification } from "@/lib/types";

export interface TrackingRowView {
  id: string;
  runId: string;
  shopName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  websiteUrl: string | null;
  discoveryCallAt: string | null;
  inspectionDate: string;
  totalScore: number | null;
  classification: Classification | null;
  dmiLink: string | null;
  weekOf: string;
  weeklyStatus: string;
}

const STATUS_TONE: Record<string, string> = {
  Completed: "var(--color-green)",
  "Needs Review": "var(--color-yellow)",
  "In Progress": "var(--color-brand)",
  "Not Started": "var(--color-muted)",
};

export function TrackingTable({ rows }: { rows: TrackingRowView[] }) {
  const columns: Column<TrackingRowView>[] = [
    {
      key: "shopName",
      header: "Shop",
      value: (r) => r.shopName,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.shopName}</p>
          {r.websiteUrl && (
            <a
              href={r.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-brand)] hover:underline"
            >
              {r.websiteUrl.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
        </div>
      ),
    },
    {
      key: "contactName",
      header: "Contact",
      value: (r) => r.contactName,
      render: (r) => (
        <div className="min-w-0">
          <p>{r.contactName ?? <span className="text-[var(--color-muted)]">—</span>}</p>
          {r.email && <p className="truncate text-xs text-[var(--color-muted)]">{r.email}</p>}
        </div>
      ),
    },
    {
      key: "discoveryCallAt",
      header: "Call booked",
      value: (r) => r.discoveryCallAt,
      render: (r) => (
        <span className="tabular whitespace-nowrap text-[var(--color-muted)]">
          {r.discoveryCallAt ? new Date(r.discoveryCallAt).toISOString().slice(0, 10) : "—"}
        </span>
      ),
    },
    {
      key: "inspectionDate",
      header: "Inspected",
      value: (r) => r.inspectionDate,
      render: (r) => (
        <span className="tabular whitespace-nowrap text-[var(--color-muted)]">{r.inspectionDate}</span>
      ),
    },
    {
      key: "totalScore",
      header: "Score",
      align: "right",
      value: (r) => r.totalScore,
      render: (r) =>
        r.classification ? (
          <span
            className="inline-flex items-center gap-2 whitespace-nowrap"
            title={`${r.classification} band`}
          >
            <ClassificationDot c={r.classification} />
            <span className="tabular font-semibold">{r.totalScore}/20</span>
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "weekOf",
      header: "Week of",
      value: (r) => r.weekOf,
      render: (r) => <span className="tabular whitespace-nowrap">{r.weekOf}</span>,
    },
    {
      key: "weeklyStatus",
      header: "Status",
      value: (r) => r.weeklyStatus,
      render: (r) => (
        <span className="font-medium whitespace-nowrap" style={{ color: STATUS_TONE[r.weeklyStatus] }}>
          {r.weeklyStatus}
        </span>
      ),
    },
    {
      key: "dmiLink",
      header: "DMI",
      sortable: false,
      value: (r) => r.dmiLink,
      render: (r) => (
        <Link href={`/dmi/${r.runId}`} className="font-medium text-[var(--color-brand)] hover:underline">
          Open
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      caption="DMI tracking spreadsheet"
      searchPlaceholder="Shop, contact, email…"
      initialSort={{ key: "weekOf", direction: "desc" }}
      facets={[
        { key: "weeklyStatus", label: "Weekly status" },
        { key: "classification", label: "Band" },
        { key: "weekOf", label: "Week of" },
      ]}
      emptyMessage="No rows match those filters."
    />
  );
}
