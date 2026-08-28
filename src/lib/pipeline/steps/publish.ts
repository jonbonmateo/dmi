/**
 * Step 8 — record the finished DMI everywhere the manual process records it:
 * the tracking spreadsheet, the GoHighLevel contact, and the Ads Budget Card.
 *
 * Each destination reports its own status, so a GoHighLevel outage does not
 * lose the tracking row and vice versa.
 */
import { env } from "@/lib/env";
import { getStore } from "@/lib/storage";
import { upsertTracking } from "@/lib/integrations/tracking";
import { syncGhl } from "@/lib/integrations/gohighlevel";
import { createBudgetCard } from "@/lib/integrations/budget-card";
import type { PublishResult } from "@/lib/types";
import type { Ctx } from "../context";

export async function publish(ctx: Ctx): Promise<PublishResult> {
  const store = getStore();
  const run = ctx.run;
  run.reportUrl = `${env.appUrl}/dmi/${run.id}`;

  const openReviews = (await store.listReviewItems({ runId: run.id, status: "open" })).length;
  const weeklyStatus = openReviews > 0 ? "Needs Review" : "Completed";

  const [tracking, ghl, card] = await Promise.all([
    upsertTracking(ctx, weeklyStatus).catch((e) => ({
      status: "unable_to_evaluate" as const,
      id: null,
      note: `Tracking row failed: ${e instanceof Error ? e.message : String(e)}`,
    })),
    syncGhl(ctx).catch((e) => ({
      contact: { status: "unable_to_evaluate" as const, id: null, note: `GHL sync failed: ${e instanceof Error ? e.message : String(e)}` },
      note: { status: "unable_to_evaluate" as const, id: null, note: "skipped" },
    })),
    createBudgetCard(ctx).catch((e) => ({
      status: "unable_to_evaluate" as const,
      id: null,
      note: `Budget card failed: ${e instanceof Error ? e.message : String(e)}`,
    })),
  ]);

  // `requires_human_review` here means "this destination is not configured",
  // which is a deployment state, not a run failure. Only genuine breakage
  // (a 500 from GoHighLevel, a dead Zapier hook) goes in the error log.
  for (const r of [tracking, ghl.contact, ghl.note, card]) {
    if (r.status === "unable_to_evaluate") ctx.addError("publish", r.note);
  }

  return {
    trackingRow: tracking,
    ghlContact: ghl.contact,
    ghlNote: ghl.note,
    adsBudgetCard: card,
    weeklyStatus: {
      status: "confirmed",
      value: weeklyStatus,
      note:
        openReviews > 0
          ? `${openReviews} item(s) still need a human, so the week is marked "Needs Review" rather than "Completed". It flips to Completed automatically when the last review item is resolved.`
          : "No open review items — the week is marked Completed.",
    },
  };
}
