import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getStore } from "@/lib/storage";
import { getReadiness } from "@/lib/readiness";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader, ModeBadge } from "@/components/ui";
import { SetupChecklist } from "./checklist";

export const dynamic = "force-dynamic";

/** A standing view of what is connected and what a live run would degrade. */
export default async function SetupPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mode) redirect("/mode");

  const store = getStore();
  const open = await store.listReviewItems({ status: "open" });
  const readiness = getReadiness();

  return (
    <AppShell auth={auth} active="setup" openReviews={open.length}>
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dev Setup</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-[var(--color-ink-soft)]">
          What this deployment is wired to, and exactly what happens when something is missing.
          Nothing here fails silently: an unconnected service degrades to a question in the review
          queue rather than to a guess.
        </p>
      </header>

      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            This session
          </p>
          <div className="mt-2">
            <ModeBadge mode={auth.mode} size="lg" />
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Live coverage
          </p>
          <p className="tabular mt-1 text-3xl font-bold">{readiness.liveCoveragePercent}%</p>
          <p className="text-sm text-[var(--color-muted)]">of required + recommended connections</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Database
          </p>
          <p className="mt-1 text-lg font-bold">{store.driver === "supabase" ? "Supabase" : "Local file"}</p>
          <p className="text-sm text-[var(--color-muted)]">
            {store.driver === "supabase"
              ? "Postgres, persistent."
              : "Ephemeral on Vercel — connect Supabase before production."}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Connections"
          description={`${readiness.checks.filter((c) => c.ok).length} of ${readiness.checks.length} passing`}
        />
        <SetupChecklist checks={readiness.checks} />
      </Card>

      <Card className="mt-7 p-6">
        <h2 className="font-semibold">Three things are manual by design</h2>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          No credential will turn these on, because no credential exists that should.
        </p>
        <ul className="mt-4 space-y-3 text-sm">
          {[
            ["The phone test", "An automated call to a prospect's business line is a robocall under the TCPA, and judging whether someone answered helpfully is not a job for a classifier. The number and every observable lead-response signal are gathered for you."],
            ["Google ad confirmation", "Google publishes no ads API and its Transparency Center forbids automated access. On-site tags are collected as corroboration and a one-click link is provided."],
            ["The citation score", "The 60% benchmark is calibrated against a paid aggregator with no free API. A first-party estimate is shown, labelled as an estimate."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-lg border border-[var(--color-line)] p-3.5">
              <p className="font-semibold">{t}</p>
              <p className="mt-0.5 text-[var(--color-muted)]">{d}</p>
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}
