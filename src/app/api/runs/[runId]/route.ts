import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [prospect, reviews, tracking, card] = await Promise.all([
    store.getProspect(run.prospectId),
    store.listReviewItems({ runId }),
    store.getTrackingRowByRun(runId),
    store.getBudgetCardByRun(runId),
  ]);
  return NextResponse.json({ run, prospect, reviewItems: reviews, trackingRow: tracking, budgetCard: card });
}
