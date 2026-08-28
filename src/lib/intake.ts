/**
 * Discovery-call intake.
 *
 * Accepts the shape Zapier sends from a GoHighLevel appointment trigger, plus
 * the looser shapes a form or a manual test will send. Everything is optional
 * except a shop name, because the whole point of the uncertainty handling
 * downstream is that we cope with missing intake data rather than rejecting it.
 */
import { z } from "zod";
import { getStore } from "@/lib/storage";
import { normaliseUrl } from "@/lib/providers/http";
import { hash, newId } from "@/lib/pipeline/context";
import { emptySteps } from "@/lib/pipeline";
import type { DmiRun, Prospect } from "@/lib/types";
import { log } from "@/lib/logger";
import { currentMode } from "@/lib/runtime-mode";

const nonEmpty = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export const IntakeSchema = z
  .object({
    firstName: z.string().optional(),
    first_name: z.string().optional(),
    lastName: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    shopName: z.string().optional(),
    shop_name: z.string().optional(),
    companyName: z.string().optional(),
    company_name: z.string().optional(),
    businessName: z.string().optional(),
    website: z.string().optional(),
    websiteUrl: z.string().optional(),
    website_url: z.string().optional(),
    meetingType: z.string().optional(),
    meeting_type: z.string().optional(),
    calendarName: z.string().optional(),
    discoveryCallAt: z.string().optional(),
    discovery_call_at: z.string().optional(),
    appointmentStartTime: z.string().optional(),
    startTime: z.string().optional(),
    heardAboutUs: z.string().optional(),
    heard_about_us: z.string().optional(),
    howDidYouHear: z.string().optional(),
    marketingPainPoint: z.string().optional(),
    marketing_pain_point: z.string().optional(),
    whatDoYouDislike: z.string().optional(),
    ghlContactId: z.string().optional(),
    contact_id: z.string().optional(),
    contactId: z.string().optional(),
    ghlOpportunityId: z.string().optional(),
    opportunity_id: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export type IntakePayload = z.infer<typeof IntakeSchema>;

const KNOWN_KEYS = new Set(Object.keys(IntakeSchema.shape));

export interface NormalisedIntake {
  prospect: Omit<Prospect, "id" | "createdAt">;
  /** Fields the form did not supply — surfaced, never silently defaulted. */
  missing: string[];
}

export function normaliseIntake(raw: IntakePayload): NormalisedIntake {
  const pick = (...keys: (keyof IntakePayload)[]) => {
    for (const k of keys) {
      const v = nonEmpty(raw[k]);
      if (v) return v;
    }
    return null;
  };

  const shopName =
    pick("shopName", "shop_name", "companyName", "company_name", "businessName") ?? "";
  const website = normaliseUrl(pick("website", "websiteUrl", "website_url"));
  const rawDate = pick("discoveryCallAt", "discovery_call_at", "appointmentStartTime", "startTime");
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const discoveryCallAt =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(k) && v !== undefined && v !== null && v !== "") extra[k] = v;
  }

  const prospect: Omit<Prospect, "id" | "createdAt"> = {
    firstName: pick("firstName", "first_name"),
    lastName: pick("lastName", "last_name"),
    email: pick("email"),
    phone: pick("phone"),
    shopName,
    websiteUrl: website,
    meetingType: pick("meetingType", "meeting_type", "calendarName"),
    discoveryCallAt,
    heardAboutUs: pick("heardAboutUs", "heard_about_us", "howDidYouHear"),
    marketingPainPoint: pick("marketingPainPoint", "marketing_pain_point", "whatDoYouDislike"),
    ghlContactId: pick("ghlContactId", "contact_id", "contactId"),
    ghlOpportunityId: pick("ghlOpportunityId", "opportunity_id"),
    extra: { ...extra, ...(nonEmpty(raw.notes) ? { notes: raw.notes } : {}) },
  };

  const missing = (
    [
      ["first name", prospect.firstName],
      ["last name", prospect.lastName],
      ["email address", prospect.email],
      ["phone number", prospect.phone],
      ["shop name", prospect.shopName || null],
      ["website address", prospect.websiteUrl],
      ["meeting type", prospect.meetingType],
      ["discovery-call date and time", prospect.discoveryCallAt],
      ["how they heard about us", prospect.heardAboutUs],
      ["what they want to improve", prospect.marketingPainPoint],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([label]) => label);

  return { prospect, missing };
}

/**
 * Duplicate protection: the same shop + website + calendar day collapses onto
 * one run, no matter how many times Zapier retries the webhook.
 */
export function idempotencyKeyFor(p: Omit<Prospect, "id" | "createdAt">): string {
  const day = p.discoveryCallAt ? p.discoveryCallAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const site = p.websiteUrl ? p.websiteUrl.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "no-site";
  const name = p.shopName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${name}|${site}|${day}|${hash(`${name}${site}${day}`)}`;
}

export interface IntakeResult {
  run: DmiRun;
  prospect: Prospect;
  duplicate: boolean;
  missing: string[];
}

export async function intake(raw: IntakePayload): Promise<IntakeResult> {
  const store = getStore();
  const { prospect: fields, missing } = normaliseIntake(raw);

  if (!fields.shopName) {
    throw new Error(
      "A shop name is required to start a DMI. Everything else is optional and will be reported as missing.",
    );
  }

  const key = idempotencyKeyFor(fields);
  const existingRun = await store.findRunByIdempotencyKey(key);
  if (existingRun) {
    const p = await store.getProspect(existingRun.prospectId);
    log.info("duplicate intake collapsed onto existing run", { run: existingRun.id, key });
    return { run: existingRun, prospect: p!, duplicate: true, missing };
  }

  const existingProspect = fields.email ? await store.findProspectByEmail(fields.email) : null;
  const prospect: Prospect = existingProspect
    ? { ...existingProspect, ...fields, id: existingProspect.id, createdAt: existingProspect.createdAt }
    : { ...fields, id: newId("psp"), createdAt: new Date().toISOString() };
  await store.upsertProspect(prospect);

  const now = new Date().toISOString();
  const run: DmiRun = {
    id: newId("dmi"),
    prospectId: prospect.id,
    state: "queued",
    idempotencyKey: key,
    inspectionDate: now.slice(0, 10),
    mode: currentMode(),
    verification: null,
    categories: [],
    budgets: [],
    totalScore: 0,
    potentialTotalScore: 0,
    classification: null,
    steps: emptySteps(),
    errors: [],
    reportUrl: null,
    publish: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await store.createRun(run);

  if (missing.length > 0) {
    await store.addReviewItems([
      {
        id: `${run.id}:intake:missing`,
        runId: run.id,
        findingId: null,
        category: "run",
        reason: "Discovery-call information is incomplete",
        question: `The discovery-call form did not supply: ${missing.join(", ")}.`,
        instruction:
          "Fill in what you can from the GoHighLevel record before the call. Missing fields do not stop the inspection, but a missing website or phone number limits what can be verified.",
        status: "open",
        resolution: null,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: now,
      },
    ]);
  }

  log.info("intake accepted", { run: run.id, shop: prospect.shopName, missing });
  return { run, prospect, duplicate: false, missing };
}
