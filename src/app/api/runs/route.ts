import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const store = getStore();
  const runs = await store.listRuns(100);
  const prospects = await Promise.all(runs.map((r) => store.getProspect(r.prospectId)));
  return NextResponse.json({
    driver: store.driver,
    runs: runs.map((r, i) => ({
      id: r.id,
      shopName: prospects[i]?.shopName ?? "(unknown)",
      state: r.state,
      totalScore: r.totalScore,
      potentialTotalScore: r.potentialTotalScore,
      classification: r.classification,
      inspectionDate: r.inspectionDate,
      reportUrl: r.reportUrl,
      errors: r.errors.length,
    })),
  });
}
