/**
 * GoHighLevel sync.
 *
 * Two things happen on every completed run:
 *   1. custom fields on the contact are set (DMI score, colour, link, date)
 *   2. a note is appended with the salesperson-facing summary
 *
 * Without GHL_API_KEY the calls are skipped and the exact payloads that would
 * have been sent are returned in the note, so the wiring can be reviewed
 * before any credential exists.
 */
import { env } from "@/lib/env";
import { CLASSIFICATION_LABEL } from "@/lib/scoring/rubric";
import { CATEGORY_LABELS } from "@/lib/types";
import type { EvidenceStatus } from "@/lib/types";
import type { Ctx } from "@/lib/pipeline/context";
import { getStore } from "@/lib/storage";
import { log } from "@/lib/logger";

const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

/** Custom-field keys to create in GoHighLevel (Settings → Custom Fields). */
export const GHL_FIELDS = {
  score: "dmi_total_score",
  classification: "dmi_classification",
  link: "dmi_report_link",
  date: "dmi_inspection_date",
  googleBudget: "dmi_google_ads_budget",
  lsaBudget: "dmi_lsa_budget",
  reviewCount: "dmi_open_review_items",
} as const;

export function buildNote(ctx: Ctx, openReviews: number): string {
  const run = ctx.run;
  const lines: string[] = [];
  lines.push(`DIGITAL MARKETING INSPECTION — ${ctx.prospect.shopName}`);
  lines.push(`Inspected ${run.inspectionDate}`);
  lines.push(`Score ${run.totalScore}/20 — ${run.classification ? CLASSIFICATION_LABEL[run.classification] : "not scored"}`);
  if (run.potentialTotalScore > run.totalScore) {
    lines.push(`(${run.potentialTotalScore - run.totalScore} criteria could not be confirmed automatically — the score could reach ${run.potentialTotalScore}/20 once reviewed.)`);
  }
  lines.push("");
  for (const c of run.categories) {
    lines.push(`${CATEGORY_LABELS[c.category]}: ${c.score}/5`);
    for (const f of c.findings) {
      const mark = (f.humanOverride?.outcome ?? f.outcome) === "pass" ? "[+]" : (f.humanOverride?.outcome ?? f.outcome) === "fail" ? "[-]" : "[?]";
      lines.push(`  ${mark} ${f.summary}`);
    }
    lines.push("");
  }
  const g = run.budgets.find((b) => b.channel === "google_ads");
  const l = run.budgets.find((b) => b.channel === "local_services_ads");
  if (g?.monthlyUsd || l?.monthlyUsd) {
    lines.push("Suggested monthly ad budgets:");
    if (g?.monthlyUsd) lines.push(`  Google Ads: $${g.monthlyUsd} (range $${g.low}-$${g.high})`);
    if (l?.monthlyUsd) lines.push(`  Local Services Ads: $${l.monthlyUsd} (range $${l.low}-$${l.high})`);
    lines.push("");
  }
  if (openReviews > 0) lines.push(`${openReviews} item(s) need a human before this DMI is final.`);
  lines.push(`Full report: ${run.reportUrl}`);
  return lines.join("\n");
}

async function ghl(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.ghlApiKey}`,
      Version: VERSION,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, body };
}

type Outcome = { status: EvidenceStatus; id: string | null; note: string };

export async function syncGhl(ctx: Ctx): Promise<{ contact: Outcome; note: Outcome }> {
  const store = getStore();
  const { run, prospect } = ctx;
  const openReviews = (await store.listReviewItems({ runId: run.id, status: "open" })).length;
  const noteBody = buildNote(ctx, openReviews);

  const g = run.budgets.find((b) => b.channel === "google_ads");
  const l = run.budgets.find((b) => b.channel === "local_services_ads");
  const customFields = [
    { key: GHL_FIELDS.score, field_value: String(run.totalScore) },
    { key: GHL_FIELDS.classification, field_value: run.classification ?? "" },
    { key: GHL_FIELDS.link, field_value: run.reportUrl ?? "" },
    { key: GHL_FIELDS.date, field_value: run.inspectionDate },
    { key: GHL_FIELDS.googleBudget, field_value: g?.monthlyUsd === null || g?.monthlyUsd === undefined ? "" : String(g.monthlyUsd) },
    { key: GHL_FIELDS.lsaBudget, field_value: l?.monthlyUsd === null || l?.monthlyUsd === undefined ? "" : String(l.monthlyUsd) },
    { key: GHL_FIELDS.reviewCount, field_value: String(openReviews) },
  ];

  if (!env.ghlApiKey || !env.ghlLocationId) {
    return {
      contact: {
        status: "requires_human_review",
        id: prospect.ghlContactId,
        note: `GoHighLevel is not configured (GHL_API_KEY / GHL_LOCATION_ID missing). Would have set on contact ${prospect.ghlContactId ?? `(lookup by ${prospect.email})`}: ${customFields.map((f) => `${f.key}=${f.field_value || "(blank)"}`).join(", ")}`,
      },
      note: {
        status: "requires_human_review",
        id: null,
        note: `Would have appended this note to the contact:\n${noteBody}`,
      },
    };
  }

  /* ---------------------------------------------- 1. find or create contact */
  let contactId = prospect.ghlContactId;
  if (!contactId && prospect.email) {
    const found = await ghl(`/contacts/search/duplicate?locationId=${env.ghlLocationId}&email=${encodeURIComponent(prospect.email)}`, { method: "GET" });
     
    contactId = (found.body as any)?.contact?.id ?? null;
  }

  let contactOutcome: Outcome;
  if (contactId) {
    const upd = await ghl(`/contacts/${contactId}`, {
      method: "PUT",
      body: JSON.stringify({ customFields }),
    });
    contactOutcome = upd.ok
      ? { status: "confirmed", id: contactId, note: `Updated GoHighLevel contact ${contactId} with the DMI score, colour, link and budgets.` }
      : { status: "unable_to_evaluate", id: contactId, note: `GoHighLevel returned HTTP ${upd.status} updating contact ${contactId}: ${JSON.stringify(upd.body).slice(0, 200)}` };
  } else {
    const created = await ghl(`/contacts/`, {
      method: "POST",
      body: JSON.stringify({
        locationId: env.ghlLocationId,
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        email: prospect.email,
        phone: prospect.phone,
        companyName: prospect.shopName,
        website: prospect.websiteUrl,
        customFields,
      }),
    });
     
    const newId = (created.body as any)?.contact?.id ?? null;
    contactId = newId;
    contactOutcome = created.ok && newId
      ? { status: "confirmed", id: newId, note: `Created GoHighLevel contact ${newId} for ${prospect.shopName}.` }
      : { status: "unable_to_evaluate", id: null, note: `Could not create the GoHighLevel contact (HTTP ${created.status}). The DMI is still complete and recorded; only the CRM sync is missing.` };
  }

  /* ---------------------------------------------------------- 2. the note */
  let noteOutcome: Outcome;
  if (!contactId) {
    noteOutcome = { status: "unable_to_evaluate", id: null, note: "No contact id, so the DMI note could not be attached." };
  } else {
    const res = await ghl(`/contacts/${contactId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: noteBody }),
    });
     
    const noteId = (res.body as any)?.note?.id ?? null;
    noteOutcome = res.ok
      ? { status: "confirmed", id: noteId, note: `DMI summary note attached to contact ${contactId}.` }
      : { status: "unable_to_evaluate", id: null, note: `GoHighLevel returned HTTP ${res.status} attaching the note.` };
  }

  if (contactId && contactId !== prospect.ghlContactId) {
    prospect.ghlContactId = contactId;
    await store.upsertProspect(prospect);
  }
  log.info("ghl sync", { run: run.id, contactId, ok: contactOutcome.status === "confirmed" });
  return { contact: contactOutcome, note: noteOutcome };
}
