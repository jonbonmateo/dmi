import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { getStore } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/guard";

export const runtime = "nodejs";

async function handleGet(req: Request) {
  const guard = await requireAuth(req, { readOnly: true });
  if (!guard.ok) return guard.response;

  const store = getStore();
  const runs = await store.listRuns(100);
  const prospects = await Promise.all(runs.map((r) => store.getProspect(r.prospectId)));
  const open = await store.listReviewItems({ status: "open" });
  const openByRun = new Map<string, number>();
  for (const i of open) openByRun.set(i.runId, (openByRun.get(i.runId) ?? 0) + 1);

  return NextResponse.json({
    driver: store.driver,
    sessionMode: guard.auth.mode,
    runs: runs.map((r, i) => ({
      id: r.id,
      shopName: prospects[i]?.shopName ?? "(unknown)",
      websiteUrl: r.verification?.websiteResolvedUrl ?? prospects[i]?.websiteUrl ?? null,
      state: r.state,
      mode: r.mode,
      totalScore: r.totalScore,
      potentialTotalScore: r.potentialTotalScore,
      classification: r.classification,
      inspectionDate: r.inspectionDate,
      discoveryCallAt: prospects[i]?.discoveryCallAt ?? null,
      reportUrl: r.reportUrl,
      openReviews: openByRun.get(r.id) ?? 0,
      errors: r.errors.length,
    })),
  });
}

export async function GET(req: Request) {
  try {
    return await handleGet(req);
  } catch (e) {
    return routeErrorResponse(e);
  }
}
