import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getStore } from "@/lib/storage";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui";
import { ReviewList, type ReviewRow } from "./review-list";

export const dynamic = "force-dynamic";

export default async function ReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mode) redirect("/mode");

  const { runId } = await searchParams;
  const store = getStore();

  const [all, openAll] = await Promise.all([
    store.listReviewItems(runId ? { runId } : {}),
    store.listReviewItems({ status: "open" }),
  ]);

  const runIds = [...new Set(all.map((i) => i.runId))];
  const runs = await Promise.all(runIds.map((id) => store.getRun(id)));
  const prospects = await Promise.all(runs.map((r) => (r ? store.getProspect(r.prospectId) : null)));
  const shopByRun = new Map(runIds.map((id, i) => [id, prospects[i]?.shopName ?? "(unknown shop)"]));

  const rows: ReviewRow[] = all.map((i) => ({
    id: i.id,
    runId: i.runId,
    findingId: i.findingId,
    shopName: shopByRun.get(i.runId) ?? "(unknown shop)",
    category: i.category,
    reason: i.reason,
    question: i.question,
    instruction: i.instruction,
    status: i.status,
    resolution: i.resolution,
    resolvedBy: i.resolvedBy,
    resolvedAt: i.resolvedAt,
    createdAt: i.createdAt,
  }));

  const canAnswer = auth.user.role !== "guest" || auth.mode === "mock";

  return (
    <AppShell auth={auth} active="review" openReviews={openAll.length}>
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Review queue</h1>
        <p className="mt-1.5 max-w-3xl text-[15px] text-[var(--color-ink-soft)]">
          Questions the automation could not answer from public data. These are not errors — they are
          the parts of an inspection that need a person, so no point was awarded either way. Answering
          one updates the score, the band and the weekly tracking status straight away.
        </p>
        {runId && (
          <p className="mt-2 text-sm">
            Filtered to one inspection.{" "}
            <a href="/review" className="font-semibold text-[var(--color-brand)] hover:underline">
              Show all
            </a>
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting">
          Every inspection is either complete or still running.
        </EmptyState>
      ) : (
        <ReviewList rows={rows} canAnswer={canAnswer} />
      )}
    </AppShell>
  );
}
