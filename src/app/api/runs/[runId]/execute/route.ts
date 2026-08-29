/**
 * POST /api/runs/:id/execute — run or resume an inspection synchronously.
 * Completed steps are reused from their checkpoints, so this is safe to call
 * repeatedly (it is how a partially failed run is recovered).
 */
import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { runPipeline } from "@/lib/pipeline";
import { requireAuth } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handlePost(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  // Inspections cost API quota and hit real third parties, so they are rate
  // limited harder than ordinary reads, and closed to guests unless they're
  // in mock mode (see the `write` option's docs in guard.ts).
  const guard = await requireAuth(req, { write: true, burstPerMinute: 10 });
  if (!guard.ok) return guard.response;

  const { runId } = await params;
  try {
    // runPipeline re-enters the mode the run was created in on its own.
    const run = await runPipeline(runId);
    return NextResponse.json({
      runId: run.id,
      state: run.state,
      mode: run.mode,
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

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    return await handlePost(req, { params });
  } catch (e) {
    return routeErrorResponse(e);
  }
}
