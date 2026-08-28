import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStore } from "@/lib/storage";

export const runtime = "nodejs";

/** Shows which half of the system is live and which is mocked. */
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
  return NextResponse.json({
    ok: storeOk,
    storage: { driver: store.driver, ok: storeOk, error: storeError },
    providers: {
      pageSpeed: env.pageSpeedKey ? "live (keyed)" : env.forceMock ? "mock" : "live (unkeyed, rate limited)",
      googlePlaces: env.googleMapsKey && !env.forceMock ? "live" : "mock/fixture",
      metaAdLibrary: env.metaAdLibraryToken && !env.forceMock ? "live" : "mock/manual review",
      googleAdsTransparency: "manual review (no public API)",
      citations: "approximation + manual review (no free API)",
      social: "discovery live, profile detail manual review",
      goHighLevel: env.ghlApiKey && env.ghlLocationId ? "live" : "dry run (payloads logged)",
      trackingSheet: env.zapierTrackingWebhook ? "live via Zapier" : "database only",
      adsBudgetCard: env.zapierBudgetCardWebhook ? "live via Zapier" : "database only",
    },
    forceMock: env.forceMock,
  });
}
