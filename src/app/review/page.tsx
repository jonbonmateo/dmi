import Link from "next/link";
import { getStore } from "@/lib/storage";
import { Card } from "@/components/ui";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export default async function ReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string; status?: string }>;
}) {
  const { runId, status } = await searchParams;
  const store = getStore();
  const items = await store.listReviewItems({ runId, status: status ?? "open" });
  const runs = await Promise.all([...new Set(items.map((i) => i.runId))].map((id) => store.getRun(id)));
  const prospects = await Promise.all(runs.map((r) => (r ? store.getProspect(r.prospectId) : null)));
  const shopByRun = new Map(runs.map((r, i) => [r?.id ?? "", prospects[i]?.shopName ?? "(unknown)"]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between text-sm">
        <Link href="/" className="text-[var(--color-brand)] underline underline-offset-2">← All inspections</Link>
        {runId && (
          <Link href={`/dmi/${runId}`} className="text-[var(--color-brand)] underline underline-offset-2">
            Open this DMI
          </Link>
        )}
      </div>

      <h1 className="text-2xl font-bold">Review queue</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Questions the automation could not answer from public data. Answering one updates the DMI score, the classification and
        the weekly tracking status straight away.
      </p>

      {items.length === 0 ? (
        <Card className="mt-8 p-8 text-center">
          <p className="font-medium">Nothing waiting.</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Every inspection is either complete or still running.</p>
        </Card>
      ) : (
        <div className="mt-8 space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {shopByRun.get(item.runId)} · {item.category}
                  {item.findingId ? ` · ${item.findingId}` : ""}
                </span>
                <Link href={`/dmi/${item.runId}`} className="text-xs text-[var(--color-brand)] underline underline-offset-2">
                  View DMI
                </Link>
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-yellow)]">{item.reason}</p>
              <p className="mt-1 whitespace-pre-wrap font-medium">{item.question}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{item.instruction}</p>
              <ReviewForm itemId={item.id} scorable={Boolean(item.findingId)} />
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
