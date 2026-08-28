import Link from "next/link";
import { getStore } from "@/lib/storage";
import { env } from "@/lib/env";
import { Card } from "@/components/ui";
import type { Classification } from "@/lib/types";

export const dynamic = "force-dynamic";

const dot: Record<Classification, string> = {
  red: "bg-[var(--color-red)]",
  yellow: "bg-[var(--color-yellow)]",
  green: "bg-[var(--color-green)]",
};

const stateLabel: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  needs_review: "Needs review",
  completed: "Completed",
  failed: "Failed",
};

export default async function Dashboard() {
  const store = getStore();
  const [runs, tracking, openReviews] = await Promise.all([
    store.listRuns(50),
    store.listTrackingRows(),
    store.listReviewItems({ status: "open" }),
  ]);
  const prospects = await Promise.all(runs.map((r) => store.getProspect(r.prospectId)));
  const byRun = new Map(tracking.map((t) => [t.runId, t]));
  const reviewsByRun = new Map<string, number>();
  for (const i of openReviews) reviewsByRun.set(i.runId, (reviewsByRun.get(i.runId) ?? 0) + 1);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Digital Marketing Inspections</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Every discovery call that came in, and where its DMI stands.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/review" className="rounded border border-[var(--color-line)] bg-white px-3 py-2 font-medium hover:border-[var(--color-brand)]">
            Review queue{openReviews.length ? ` (${openReviews.length})` : ""}
          </Link>
          <span className="rounded bg-[var(--color-grey-soft)] px-3 py-2 text-[var(--color-muted)]">
            store: {store.driver}
          </span>
        </div>
      </header>

      {runs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-medium">No inspections yet.</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Send a discovery call to <code className="rounded bg-[var(--color-grey-soft)] px-1.5 py-0.5">POST {env.appUrl}/api/intake</code>, or run{" "}
            <code className="rounded bg-[var(--color-grey-soft)] px-1.5 py-0.5">npm run seed</code> to load the sample shops.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-canvas)] text-left text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Shop</th>
                <th className="px-4 py-3 font-semibold">Inspected</th>
                <th className="px-4 py-3 font-semibold">Score</th>
                <th className="px-4 py-3 font-semibold">State</th>
                <th className="px-4 py-3 font-semibold">Week of</th>
                <th className="px-4 py-3 font-semibold">Weekly status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => {
                const t = byRun.get(r.id);
                const open = reviewsByRun.get(r.id) ?? 0;
                return (
                  <tr key={r.id} className="border-t border-[var(--color-line)]">
                    <td className="px-4 py-3 font-medium">{prospects[i]?.shopName ?? "(unknown)"}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{r.inspectionDate}</td>
                    <td className="px-4 py-3">
                      {r.classification ? (
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${dot[r.classification]}`} />
                          {r.totalScore}/20
                          {r.potentialTotalScore > r.totalScore && (
                            <span className="text-[var(--color-muted)]">(→{r.potentialTotalScore})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {stateLabel[r.state] ?? r.state}
                      {open > 0 && <span className="ml-2 text-[var(--color-yellow)]">{open} open</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{t?.weekOf ?? "—"}</td>
                    <td className="px-4 py-3">{t?.weeklyStatus ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dmi/${r.id}`} className="font-medium text-[var(--color-brand)] underline underline-offset-2">
                        Open DMI
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
