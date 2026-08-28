/**
 * "Can this deployment actually run in live mode?"
 *
 * The mode chooser shown after sign-in uses this to decide what to offer and,
 * when something is missing, to print the exact steps to fix it rather than a
 * bare "not configured".
 */
import { env } from "@/lib/env";

export type Importance = "required" | "recommended" | "optional";

export interface ReadinessCheck {
  id: string;
  label: string;
  importance: Importance;
  ok: boolean;
  /** What the app does when this is missing. */
  consequence: string;
  envVars: string[];
  /** Numbered steps to make it green. */
  howTo: string[];
  docsUrl?: string;
}

export interface Readiness {
  checks: ReadinessCheck[];
  /** Live mode is offered only when every `required` check passes. */
  liveAvailable: boolean;
  requiredMissing: ReadinessCheck[];
  recommendedMissing: ReadinessCheck[];
  optionalMissing: ReadinessCheck[];
  /** 0-100, how much of a live run will be real rather than degraded. */
  liveCoveragePercent: number;
}

export function getReadiness(): Readiness {
  const checks: ReadinessCheck[] = [
    {
      id: "app_url",
      label: "Public app URL",
      importance: "required",
      ok: Boolean(env.appUrl && !env.appUrl.includes("localhost")) || process.env.NODE_ENV !== "production",
      consequence:
        "The DMI link written into the tracking spreadsheet would point at localhost and be useless to the team.",
      envVars: ["NEXT_PUBLIC_APP_URL"],
      howTo: [
        "Set NEXT_PUBLIC_APP_URL to the deployment's real URL, e.g. https://dmi.yourdomain.com",
        "Redeploy so the value is baked into the build.",
      ],
    },
    {
      id: "auth_secret",
      label: "Session signing secret",
      importance: "required",
      ok: Boolean(env.authSecret) || process.env.NODE_ENV !== "production",
      consequence:
        "Session cookies would be signed with a well-known development key, so anyone could forge a session.",
      envVars: ["AUTH_SECRET"],
      howTo: [
        "Generate one: openssl rand -base64 48",
        "Set it as AUTH_SECRET in your environment (Vercel → Settings → Environment Variables).",
        "Redeploy. Existing sessions are invalidated, which is intended.",
      ],
    },
    {
      id: "google_places",
      label: "Google Places API — business verification & Google Business Profile",
      importance: "required",
      ok: Boolean(env.googleMapsKey),
      consequence:
        "The shop's identity cannot be verified and the Google Business Profile criterion, plus the competitive-density input to the ad budget, all fall back to 'unable to evaluate'. This is the single biggest gap in a live run.",
      envVars: ["GOOGLE_MAPS_API_KEY"],
      howTo: [
        "Open console.cloud.google.com and select (or create) a project.",
        'APIs & Services → Library → enable "Places API (New)".',
        "APIs & Services → Credentials → Create credentials → API key.",
        "Restrict the key to the Places API and to your deployment's domain.",
        "Set it as GOOGLE_MAPS_API_KEY.",
      ],
      docsUrl: "https://developers.google.com/maps/documentation/places/web-service/overview",
    },
    {
      id: "supabase",
      label: "Supabase — persistent database",
      importance: "recommended",
      ok: env.storageDriver === "supabase",
      consequence:
        "Records are written to a local JSON file instead of Postgres. That is fine on a laptop and wrong on Vercel, where the filesystem is ephemeral — inspections would disappear between deployments.",
      envVars: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      howTo: [
        "Create a project at supabase.com.",
        "SQL Editor → paste supabase/schema.sql from this repo → Run.",
        "Project Settings → API → copy the Project URL and the service_role key.",
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      ],
      docsUrl: "https://supabase.com/docs",
    },
    {
      id: "pagespeed",
      label: "PageSpeed Insights API key",
      importance: "recommended",
      ok: Boolean(env.pageSpeedKey),
      consequence:
        "Performance still runs unkeyed, but Google's anonymous quota is low — a busy day will start returning 429s and the performance criterion will go unmeasured.",
      envVars: ["PAGESPEED_API_KEY"],
      howTo: [
        "console.cloud.google.com → APIs & Services → Library.",
        'Enable "PageSpeed Insights API".',
        "Credentials → Create credentials → API key → set as PAGESPEED_API_KEY.",
      ],
    },
    {
      id: "ghl",
      label: "GoHighLevel — contact fields and DMI note",
      importance: "recommended",
      ok: Boolean(env.ghlApiKey && env.ghlLocationId),
      consequence:
        "The CRM step becomes a dry run: the DMI still completes and the report still renders, but nothing is written back to the contact. The exact payloads are shown on the report so you can see what would have been sent.",
      envVars: ["GHL_API_KEY", "GHL_LOCATION_ID"],
      howTo: [
        "GoHighLevel → Settings → Custom Fields → create seven text fields on Contact with keys: dmi_total_score, dmi_classification, dmi_report_link, dmi_inspection_date, dmi_google_ads_budget, dmi_lsa_budget, dmi_open_review_items.",
        "Settings → Private Integrations → new token with scopes contacts.readonly, contacts.write, contacts/notes.write.",
        "Copy the token to GHL_API_KEY and the sub-account id to GHL_LOCATION_ID.",
      ],
    },
    {
      id: "meta_ads",
      label: "Meta Ad Library token",
      importance: "optional",
      ok: Boolean(env.metaAdLibraryToken),
      consequence:
        "Facebook/Instagram ad activity becomes a manual check with a deep link, instead of an API lookup.",
      envVars: ["META_AD_LIBRARY_TOKEN"],
      howTo: [
        "developers.facebook.com → your app → Marketing API.",
        "Generate an app access token and set it as META_AD_LIBRARY_TOKEN.",
      ],
    },
    {
      id: "zapier_tracking",
      label: "Zapier hook — tracking spreadsheet mirror",
      importance: "optional",
      ok: Boolean(env.zapierTrackingWebhook),
      consequence:
        "Tracking rows still exist in the database and on the Tracking page; they are not mirrored into the team's Google Sheet.",
      envVars: ["ZAPIER_TRACKING_WEBHOOK_URL"],
      howTo: [
        "Zapier → new Zap → Trigger: Webhooks by Zapier → Catch Hook.",
        "Copy the hook URL into ZAPIER_TRACKING_WEBHOOK_URL.",
        "Action: Google Sheets → Create or update spreadsheet row, keyed on row_id.",
      ],
    },
    {
      id: "zapier_budget",
      label: "Zapier hook — Ads Budget Card",
      importance: "optional",
      ok: Boolean(env.zapierBudgetCardWebhook),
      consequence: "Budget cards are stored and shown on the report but no card is created on the team's board.",
      envVars: ["ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL"],
      howTo: [
        "Zapier → new Zap → Trigger: Webhooks by Zapier → Catch Hook.",
        "Copy the hook URL into ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL.",
        "Action: create a card on whichever board the team uses.",
      ],
    },
    {
      id: "intake_secret",
      label: "Intake webhook secret",
      importance: "recommended",
      ok: Boolean(env.intakeSecret),
      consequence:
        "POST /api/intake accepts unauthenticated requests, so anyone who finds the URL can queue inspections and consume your API quota.",
      envVars: ["DMI_INTAKE_SECRET"],
      howTo: [
        "Generate one: openssl rand -hex 24",
        "Set it as DMI_INTAKE_SECRET.",
        "In the Zapier intake Zap, add the header x-dmi-secret with the same value.",
      ],
    },
  ];

  const missing = (i: Importance) => checks.filter((c) => c.importance === i && !c.ok);
  const requiredMissing = missing("required");
  const weighted = checks.filter((c) => c.importance !== "optional");
  const coverage = Math.round((weighted.filter((c) => c.ok).length / weighted.length) * 100);

  return {
    checks,
    liveAvailable: requiredMissing.length === 0,
    requiredMissing,
    recommendedMissing: missing("recommended"),
    optionalMissing: missing("optional"),
    liveCoveragePercent: coverage,
  };
}
