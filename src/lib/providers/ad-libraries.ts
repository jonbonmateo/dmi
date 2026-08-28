/**
 * Confirming paid-advertising activity.
 *
 *  - Meta:   the Ad Library Graph API is real and documented. It needs an app
 *            token; without one we emit a manual-review task with a deep link
 *            to the public Ad Library page.
 *  - Google: the Ads Transparency Center has no public API and its terms do
 *            not permit scraping. We therefore never claim "no Google ads" from
 *            an automated check alone — we produce corroborating on-site
 *            signals (conversion tag, gclid handling, LSA badge) plus a
 *            one-click manual verification link.
 */
import { env, providerMode } from "@/lib/env";
import { isMock } from "@/lib/runtime-mode";
import { fetchJson } from "./http";
import { fixtureSection, MOCK } from "./mock";
import type { EvidenceStatus } from "@/lib/types";

export interface AdRecord {
  id: string;
  platform: "google" | "meta";
  headline: string | null;
  body: string | null;
  firstSeen: string | null;
  landingUrl: string | null;
  sourceUrl: string;
}

export interface AdActivityResult {
  status: EvidenceStatus;
  mocked: boolean;
  running: boolean | null;
  ads: AdRecord[];
  /** Where a human can confirm this in ten seconds. */
  verifyUrl: string;
  note: string;
}

export function googleTransparencyUrl(domain: string): string {
  return `https://adstransparency.google.com/?region=US&domain=${encodeURIComponent(domain)}`;
}

export function metaAdLibraryUrl(pageNameOrId: string): string {
  const q = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "US",
    media_type: "all",
    search_type: "keyword_unordered",
    q: pageNameOrId,
  });
  return `https://www.facebook.com/ads/library/?${q}`;
}

/* ------------------------------------------------------------------ Meta */

 
export async function getMetaAds(
  shopName: string,
  fixtureKey: string,
): Promise<AdActivityResult> {
  const verifyUrl = metaAdLibraryUrl(shopName);
  const mode = providerMode("meta-ad-library", env.metaAdLibraryToken, isMock());

  if (mode.live) {
    const qs = new URLSearchParams({
      access_token: env.metaAdLibraryToken!,
      search_terms: shopName,
      ad_reached_countries: '["US"]',
      ad_active_status: "ALL",
      limit: "25",
      fields:
        "id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_delivery_start_time,ad_snapshot_url,page_name",
    });
    const res = await fetchJson<any>(
      `https://graph.facebook.com/v21.0/ads_archive?${qs}`,
    );
    if (!res.ok) {
      return {
        status: "unable_to_evaluate",
        mocked: false,
        running: null,
        ads: [],
        verifyUrl,
        note: `Meta Ad Library API error: ${res.error}. Note: the API only returns ads for a subset of categories in the US, so a miss is not proof of "no ads".`,
      };
    }
    const raw: any[] = res.data?.data ?? [];
    // The API matches on keywords, so filter to pages that plausibly match.
    const needle = shopName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const ads: AdRecord[] = raw
      .filter((a) =>
        (a.page_name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(needle.slice(0, 12)),
      )
      .map((a) => ({
        id: a.id,
        platform: "meta" as const,
        headline: a.ad_creative_link_titles?.[0] ?? null,
        body: a.ad_creative_bodies?.[0] ?? null,
        firstSeen: a.ad_delivery_start_time ?? null,
        landingUrl: a.ad_creative_link_captions?.[0] ?? null,
        sourceUrl: a.ad_snapshot_url ?? verifyUrl,
      }));
    return {
      status: ads.length > 0 ? "confirmed" : "not_found",
      mocked: false,
      running: ads.length > 0,
      ads,
      verifyUrl,
      note:
        ads.length > 0
          ? `${ads.length} ad(s) matched "${shopName}" in the Meta Ad Library.`
          : `No ads matched "${shopName}". The Ad Library only guarantees coverage for issue/political ads outside the EU, so this is evidence of absence, not proof.`,
    };
  }

  const fx = await fixtureSection<AdRecord[]>(fixtureKey, "metaAds");
  if (!fx) {
    return {
      status: "requires_human_review",
      mocked: true,
      running: null,
      ads: [],
      verifyUrl,
      note: `${mode.reason}. Open the Meta Ad Library link and record what you see.`,
    };
  }
  return {
    status: fx.length > 0 ? "confirmed" : "not_found",
    mocked: true,
    running: fx.length > 0,
    ads: fx,
    verifyUrl,
    note: `${MOCK} Meta ad activity from fixture (${mode.reason}).`,
  };
}

/* ---------------------------------------------------------------- Google */

export interface GoogleAdsSignals {
  /** On-site tags that only exist when someone is (or was) running Google Ads. */
  conversionTag: boolean;
  remarketingTag: boolean;
  gclidAware: boolean;
}

export async function getGoogleAds(
  domain: string,
  fixtureKey: string,
  onSite: GoogleAdsSignals,
): Promise<AdActivityResult> {
  const verifyUrl = googleTransparencyUrl(domain);
  // Only ever read the fixture in mock mode: in live mode a stale fixture
  // masquerading as a real observation is exactly the failure this system
  // exists to prevent.
  const fx = isMock() ? await fixtureSection<AdRecord[]>(fixtureKey, "googleAds") : null;
  if (fx) {
    return {
      status: fx.length > 0 ? "confirmed" : "not_found",
      mocked: true,
      running: fx.length > 0,
      ads: fx,
      verifyUrl,
      note: `${MOCK} Google ad activity from fixture. In production this is a human's 10-second check of the Ads Transparency Center.`,
    };
  }

  const corroborating = [
    onSite.conversionTag && "Google Ads conversion tag on the homepage",
    onSite.remarketingTag && "Google Ads remarketing tag on the homepage",
    onSite.gclidAware && "site handles the gclid click parameter",
  ].filter(Boolean) as string[];

  return {
    status: "requires_human_review",
    mocked: false,
    // On-site tags are strong evidence of *intent* but not of live spend.
    running: null,
    ads: [],
    verifyUrl,
    note:
      corroborating.length > 0
        ? `Google Ads has no public API and the Ads Transparency Center forbids automated access, so live spend cannot be auto-confirmed. On-site signals suggest Google Ads is at least configured: ${corroborating.join("; ")}. Open the Transparency Center link to confirm and count live ads.`
        : "Google Ads has no public API and no Google Ads tags were found on the site. Open the Ads Transparency Center link to confirm whether any ads are live.",
  };
}
