"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client/api";
import { Button, Callout, Card } from "@/components/ui";
import { facetOptions, matchesFacets, matchesQuery, sortRows, type SortState } from "@/lib/table";

export interface ReviewRow {
  id: string;
  runId: string;
  findingId: string | null;
  shopName: string;
  category: string;
  reason: string;
  question: string;
  instruction: string;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  website: "Website",
  seo: "SEO",
  advertising: "Advertising",
  social: "Social",
  run: "Whole inspection",
};

const accessor = (r: ReviewRow, key: string) =>
  ({
    shopName: r.shopName,
    category: r.category,
    status: r.status,
    createdAt: r.createdAt,
    reason: r.reason,
  })[key] ?? null;

export function ReviewList({ rows, canAnswer }: { rows: ReviewRow[]; canAnswer: boolean }) {
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Record<string, string>>({ status: "open" });
  const [sort, setSort] = useState<SortState>({ key: "createdAt", direction: "desc" });

  const shops = useMemo(() => facetOptions(rows, "shopName", accessor), [rows]);
  const categories = useMemo(() => facetOptions(rows, "category", accessor), [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        matchesQuery([r.shopName, r.question, r.reason, r.instruction, r.findingId], query) &&
        matchesFacets(r, facets, accessor),
    );
    return sortRows(filtered, sort, accessor);
  }, [rows, query, facets, sort]);

  const openCount = rows.filter((r) => r.status === "open").length;

  return (
    <div>
      {/* -------------------------------------------------------- filters */}
      <div className="no-print mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Search
          </label>
          <input
            id="q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Shop, question, criterion…"
            className="w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
        </div>

        {[
          { key: "status", label: "Status", options: ["open", "resolved", "dismissed"] },
          { key: "shopName", label: "Shop", options: shops },
          { key: "category", label: "Area", options: categories },
        ].map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`f-${f.key}`}
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]"
            >
              {f.label}
            </label>
            <select
              id={`f-${f.key}`}
              value={facets[f.key] ?? "all"}
              onChange={(e) => setFacets((s) => ({ ...s, [f.key]: e.target.value }))}
              className="rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {f.key === "category" ? (CATEGORY_LABEL[o] ?? o) : o}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div>
          <label htmlFor="sort" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Sort
          </label>
          <select
            id="sort"
            value={`${sort.key}:${sort.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split(":");
              setSort({ key, direction: direction as "asc" | "desc" });
            }}
            className="rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="shopName:asc">Shop A→Z</option>
            <option value="category:asc">Area A→Z</option>
          </select>
        </div>

        <p className="ml-auto text-sm text-[var(--color-muted)]" aria-live="polite">
          {visible.length} shown · {openCount} open
        </p>
      </div>

      {!canAnswer && (
        <div className="mb-5">
          <Callout tone="warn" title="Read only">
            Guest sessions can read the queue but cannot change a score. Sign in with an account to
            answer these.
          </Callout>
        </div>
      )}

      {visible.length === 0 ? (
        <Card className="px-6 py-12 text-center text-[var(--color-muted)]">
          Nothing matches those filters.
        </Card>
      ) : (
        <ul className="space-y-4">
          {visible.map((item) => (
            <ReviewCard key={item.id} item={item} canAnswer={canAnswer} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ item, canAnswer }: { item: ReviewRow; canAnswer: boolean }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scorable = Boolean(item.findingId);
  const resolved = item.status !== "open";

  async function submit(outcome: "pass" | "fail" | "undetermined") {
    setBusy(true);
    setError(null);
    const res = await apiPatch(`/api/review/${encodeURIComponent(item.id)}`, {
      status: "resolved",
      resolution: resolution || null,
      outcome: scorable ? outcome : undefined,
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <li>
      <Card className={`p-5 ${resolved ? "opacity-70" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            {item.shopName} · {CATEGORY_LABEL[item.category] ?? item.category}
            {item.findingId ? ` · ${item.findingId}` : ""}
          </span>
          <div className="flex items-center gap-3">
            {resolved && (
              <span className="rounded-full bg-[var(--color-green-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-green)]">
                {item.status}
              </span>
            )}
            <Link
              href={`/dmi/${item.runId}`}
              className="text-xs font-medium text-[var(--color-brand)] hover:underline"
            >
              View DMI
            </Link>
          </div>
        </div>

        <p className="mt-2.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-yellow)" }}>
          {item.reason}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-[15px] font-medium">{item.question}</p>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">{item.instruction}</p>

        {resolved ? (
          <div className="mt-4 rounded-lg bg-[var(--color-raised)] p-3.5 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Answered by {item.resolvedBy ?? "unknown"}
              {item.resolvedAt ? ` · ${new Date(item.resolvedAt).toLocaleString()}` : ""}
            </p>
            {item.resolution && <p className="mt-1">{item.resolution}</p>}
          </div>
        ) : canAnswer ? (
          <div className="mt-4 border-t border-[var(--color-line)] pt-4">
            <label htmlFor={`res-${item.id}`} className="mb-1.5 block text-sm font-medium">
              What did you find?
            </label>
            <textarea
              id={`res-${item.id}`}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={2}
              placeholder="Stored as the evidence for this criterion."
              className="w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-2.5 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {scorable ? (
                <>
                  <Button variant="success" disabled={busy} onClick={() => submit("pass")}>
                    Criterion met — award the point
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => submit("fail")}>
                    Not met
                  </Button>
                </>
              ) : (
                <Button disabled={busy} onClick={() => submit("undetermined")}>
                  Mark handled
                </Button>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-[var(--color-red)]">{error}</p>}
          </div>
        ) : null}
      </Card>
    </li>
  );
}
