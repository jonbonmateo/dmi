/**
 * PATCH /api/review/:itemId — a human answers an open question.
 *
 * Answering with an explicit outcome ("pass"/"fail") writes a human override
 * onto the finding, which recomputes the score, the classification and the
 * weekly tracking status. The automation's original conclusion is preserved
 * next to the override so the audit trail stays intact.
 */
import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { totals } from "@/lib/scoring/rubric";
import { refreshWeeklyStatus } from "@/lib/integrations/tracking";
import type { Outcome } from "@/lib/types";
import { requireAuth, WRITE_ROLES } from "@/lib/auth/guard";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  // Guests may read the queue but must not change anyone's score.
  const guard = await requireAuth(req, { roles: WRITE_ROLES });
  if (!guard.ok) return guard.response;

  const { itemId } = await params;
  const store = getStore();

  let body: { status?: "resolved" | "dismissed"; resolution?: string; outcome?: Outcome; by?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const items = await store.listReviewItems({});
  const item = items.find((i) => i.id === itemId);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  // Never trust a client-supplied identity for an audit field.
  const by = guard.auth.user.name ?? guard.auth.user.email ?? guard.auth.user.id;
  const updated = await store.updateReviewItem(itemId, {
    status: body.status ?? "resolved",
    resolution: body.resolution ?? null,
    resolvedBy: by,
    resolvedAt: now,
  });

  const run = await store.getRun(item.runId);
  if (run && item.findingId && body.outcome && body.outcome !== "undetermined") {
    for (const cat of run.categories) {
      const f = cat.findings.find((x) => x.id === item.findingId);
      if (!f) continue;
      f.humanOverride = { outcome: body.outcome, note: body.resolution ?? "", by, at: now };
      const outcomes = cat.findings.map((x) => x.humanOverride?.outcome ?? x.outcome);
      cat.score = outcomes.filter((o) => o === "pass").length;
      cat.potentialScore = cat.score + outcomes.filter((o) => o === "undetermined").length;
    }
    const t = totals(run.categories);
    run.totalScore = t.total;
    run.potentialTotalScore = t.potential;
    run.classification = t.classification;
  }

  if (run) {
    const stillOpen = (await store.listReviewItems({ runId: run.id, status: "open" })).length;
    if (stillOpen === 0 && run.state === "needs_review") {
      run.state = "completed";
      run.completedAt = now;
    }
    await store.saveRun(run);
    await refreshWeeklyStatus(run.id);
  }

  return NextResponse.json({ item: updated, run: run ? { id: run.id, state: run.state, totalScore: run.totalScore, classification: run.classification } : null });
}
