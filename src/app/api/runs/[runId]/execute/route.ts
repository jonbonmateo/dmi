/**
 * POST /api/runs/:id/execute — run or resume an inspection synchronously.
 * Completed steps are reused from their checkpoints, so this is safe to call
 * repeatedly (it is how a partially failed run is recovered).
 */
import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const run = await runPipeline(runId);
    return NextResponse.json({
      runId: run.id,
      state: run.state,
      totalScore: run.totalScore,
      potentialTotalScore: run.potentialTotalScore,
      classification: run.classification,
      reportUrl: run.reportUrl,
      steps: run.steps.map((s) => ({ step: s.step, status: s.status, attempts: s.attempts, error: s.error })),
      errors: run.errors,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
