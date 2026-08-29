import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getStore } from "@/lib/storage";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState } from "@/components/ui";
import { RunsTable, type RunRow } from "./runs-table";
import { InspectForm } from "./inspect-form";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mode) redirect("/mode");
  if (!auth.user.onboardedAt) redirect("/onboarding");

  const store = getStore();
  const [runs, tracking, open] = await Promise.all([
    store.listRuns(200),
    store.listTrackingRows(),
    store.listReviewItems({ status: "open" }),
  ]);
  const prospects = await Promise.all(runs.map((r) => store.getProspect(r.prospectId)));
  const trackingByRun = new Map(tracking.map((t) => [t.runId, t]));
  const openByRun = new Map<string, number>();
  for (const i of open) openByRun.set(i.runId, (openByRun.get(i.runId) ?? 0) + 1);

  const rows: RunRow[] = runs.map((r, i) => ({
    id: r.id,
    shopName: prospects[i]?.shopName ?? "(unknown shop)",
    contact: [prospects[i]?.firstName, prospects[i]?.lastName].filter(Boolean).join(" ") || null,
    inspectionDate: r.inspectionDate,
    totalScore: r.classification ? r.totalScore : null,
    potentialScore: r.potentialTotalScore,
    classification: r.classification,
    state: r.state,
    mode: r.mode,
    openReviews: openByRun.get(r.id) ?? 0,
    weekOf: trackingByRun.get(r.id)?.weekOf ?? null,
    weeklyStatus: trackingByRun.get(r.id)?.weeklyStatus ?? null,
  }));

  const bands = { green: 0, yellow: 0, red: 0 };
  for (const r of rows) if (r.classification) bands[r.classification] += 1;

  return (
    <AppShell auth={auth} active="runs" openReviews={open.length}>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inspections</h1>
          <p className="mt-1.5 text-[15px] text-[var(--color-ink-soft)]">
            Every discovery call that came in, and where its DMI stands.
          </p>
        </div>
      </header>

      {(auth.user.role !== "guest" || auth.mode === "mock") && <InspectForm />}

      {rows.length === 0 ? (
        <EmptyState title="No inspections yet">
          Point the intake webhook at{" "}
          <code className="rounded bg-[var(--color-grey-soft)] px-1.5 py-0.5">POST /api/intake</code>, or
          run <code className="rounded bg-[var(--color-grey-soft)] px-1.5 py-0.5">npm run seed</code> to
          load three sample shops.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            {[
              ["Inspections", String(rows.length), "var(--color-ink)"],
              ["Green", String(bands.green), "var(--color-green)"],
              ["Yellow", String(bands.yellow), "var(--color-yellow)"],
              ["Red", String(bands.red), "var(--color-red)"],
            ].map(([label, value, colour]) => (
              <Card key={label} className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {label}
                </p>
                <p className="tabular mt-1 text-3xl font-bold" style={{ color: colour }}>
                  {value}
                </p>
              </Card>
            ))}
          </div>

          <RunsTable rows={rows} />
        </>
      )}
    </AppShell>
  );
}
