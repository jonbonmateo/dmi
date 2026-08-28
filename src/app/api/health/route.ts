import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStore } from "@/lib/storage";
import { getReadiness } from "@/lib/readiness";
import { googleConfigured } from "@/lib/auth/google";
import { guestsAllowed, signupsAllowed } from "@/lib/auth/accounts";

export const runtime = "nodejs";

/**
 * Unauthenticated liveness + capability report.
 *
 * Deliberately says nothing about *who* has accounts or what any of them are —
 * only whether the machinery is wired up.
 */
export async function GET() {
  const store = getStore();
  let storeOk = true;
  let storeError: string | null = null;
  try {
    await store.listRuns(1);
  } catch (e) {
    storeOk = false;
    storeError = e instanceof Error ? e.message : String(e);
  }

  const readiness = getReadiness();

  return NextResponse.json({
    ok: storeOk,
    storage: { driver: store.driver, ok: storeOk, error: storeError },
    auth: {
      google: googleConfigured(),
      guest: guestsAllowed(),
      signup: signupsAllowed(),
      secretConfigured: Boolean(env.authSecret),
      domainAllowList: env.allowedEmailDomains,
    },
    liveMode: {
      available: readiness.liveAvailable,
      coveragePercent: readiness.liveCoveragePercent,
      requiredMissing: readiness.requiredMissing.map((c) => c.id),
      recommendedMissing: readiness.recommendedMissing.map((c) => c.id),
    },
    providers: {
      pageSpeed: env.pageSpeedKey ? "live (keyed)" : "live (unkeyed, rate limited)",
      googlePlaces: env.googleMapsKey ? "live" : "fixture only",
      metaAdLibrary: env.metaAdLibraryToken ? "live" : "manual review",
      googleAdsTransparency: "manual review (no public API)",
      citations: "approximation + manual review (no free API)",
      social: "discovery live, profile detail manual review",
      goHighLevel: env.ghlApiKey && env.ghlLocationId ? "live" : "dry run (payloads logged)",
      trackingSheet: env.zapierTrackingWebhook ? "live via Zapier" : "database only",
      adsBudgetCard: env.zapierBudgetCardWebhook ? "live via Zapier" : "database only",
    },
    forceMockEnv: env.forceMock,
  });
}
