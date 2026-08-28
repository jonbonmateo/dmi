/**
 * The DMI Tracking Spreadsheet.
 *
 * Source of truth is the `dmi_tracking_rows` table — a spreadsheet is a poor
 * database and a worse audit log. The actual Google Sheet the team already
 * uses is kept in sync by pushing each row to a Zapier catch hook, which is
 * how the rest of this stack talks to Sheets. When the hook is not
 * configured, the row still lands in Postgres and the report renders; only
 * the mirror is skipped, and it says so.
 */
import { env } from "@/lib/env";
import { getStore } from "@/lib/storage";
import { newId } from "@/lib/pipeline/context";
import type { Ctx } from "@/lib/pipeline/context";
import type { EvidenceStatus, TrackingRow } from "@/lib/types";
import { log } from "@/lib/logger";

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export async function upsertTracking(
  ctx: Ctx,
  weeklyStatus: TrackingRow["weeklyStatus"],
): Promise<{ status: EvidenceStatus; id: string | null; note: string }> {
  const store = getStore();
  const { run, prospect } = ctx;
  const existing = await store.getTrackingRowByRun(run.id);

  const row: TrackingRow = {
    id: existing?.id ?? newId("trk"),
    runId: run.id,
    prospectId: prospect.id,
    shopName: prospect.shopName,
    websiteUrl: run.verification?.websiteResolvedUrl ?? prospect.websiteUrl,
    contactName: [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || null,
    email: prospect.email,
    phone: prospect.phone,
    discoveryCallAt: prospect.discoveryCallAt,
    inspectionDate: run.inspectionDate,
    totalScore: run.totalScore,
    classification: run.classification,
    dmiLink: run.reportUrl,
    weekOf: weekOf(prospect.discoveryCallAt ? new Date(prospect.discoveryCallAt) : new Date(run.inspectionDate)),
    weeklyStatus,
    updatedAt: new Date().toISOString(),
  };

  await store.upsertTrackingRow(row);

  if (!env.zapierTrackingWebhook) {
    return {
      status: "confirmed",
      id: row.id,
      note: `Tracking row saved to the ${store.driver} store as ${row.id} (week of ${row.weekOf}, status "${weeklyStatus}"). ZAPIER_TRACKING_WEBHOOK_URL is not set, so the Google Sheet mirror was skipped.`,
    };
  }

  try {
    const res = await fetch(env.zapierTrackingWebhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // Flat payload: Zapier's Sheets action maps fields by name.
        row_id: row.id,
        run_id: row.runId,
        shop_name: row.shopName,
        contact_name: row.contactName,
        email: row.email,
        phone: row.phone,
        website: row.websiteUrl,
        discovery_call_at: row.discoveryCallAt,
        inspection_date: row.inspectionDate,
        dmi_score: row.totalScore,
        classification: row.classification,
        dmi_link: row.dmiLink,
        week_of: row.weekOf,
        weekly_status: row.weeklyStatus,
      }),
    });
    if (!res.ok) {
      return { status: "unable_to_evaluate", id: row.id, note: `Row saved locally, but the Zapier tracking hook returned HTTP ${res.status}.` };
    }
    log.info("tracking row mirrored to sheet", { run: run.id, row: row.id });
    return {
      status: "confirmed",
      id: row.id,
      note: `Tracking row ${row.id} saved and mirrored to the spreadsheet via Zapier (week of ${row.weekOf}, status "${weeklyStatus}").`,
    };
  } catch (e) {
    return {
      status: "unable_to_evaluate",
      id: row.id,
      note: `Row saved locally, but the Zapier tracking hook failed: ${e instanceof Error ? e.message : String(e)}.`,
    };
  }
}

/**
 * Flip a run's week to Completed once its last review item is resolved.
 * Called from the review-resolution API so the spreadsheet stays honest.
 */
export async function refreshWeeklyStatus(runId: string): Promise<TrackingRow | null> {
  const store = getStore();
  const row = await store.getTrackingRowByRun(runId);
  if (!row) return null;
  const open = await store.listReviewItems({ runId, status: "open" });
  const next: TrackingRow["weeklyStatus"] = open.length > 0 ? "Needs Review" : "Completed";
  if (next === row.weeklyStatus) return row;
  const updated = { ...row, weeklyStatus: next, updatedAt: new Date().toISOString() };
  await store.upsertTrackingRow(updated);
  if (env.zapierTrackingWebhook) {
    await fetch(env.zapierTrackingWebhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ row_id: row.id, run_id: runId, weekly_status: next, dmi_link: row.dmiLink }),
    }).catch((e) => log.warn("weekly status mirror failed", { runId, error: String(e) }));
  }
  return updated;
}
