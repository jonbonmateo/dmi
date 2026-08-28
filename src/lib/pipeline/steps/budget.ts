/**
 * Step 7 — Advertising budget recommendations.
 *
 * Two numbers land on the Ads Budget Card: a monthly Google Ads budget and a
 * monthly Local Services Ads budget. Both are derived from an explicit model
 * whose every input is printed on the report, so a human can disagree with a
 * specific assumption rather than with a black box.
 */
import { ASSUMPTIONS, inferMarketTier } from "@/lib/providers/keyword-demand";
import { searchBusiness } from "@/lib/providers/places";
import type { BudgetRecommendation } from "@/lib/types";
import type { Ctx } from "../context";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round50(n: number): number {
  return Math.round(n / 50) * 50;
}

export async function recommendBudgets(ctx: Ctx): Promise<BudgetRecommendation[]> {
  const gbp = ctx.gbp;

  // Competitive density is measured from the local map pack around the shop.
  let competitorCount = 0;
  let medianReviews = 0;
  let densitySource = "not measured";

  if (gbp?.formattedAddress) {
    const city = gbp.formattedAddress.split(",").slice(-3).join(",").trim();
    const nearby = await searchBusiness(`auto repair shops near ${city}`, ctx.fixtureKey);
    const others = nearby.candidates.filter((c) => c.placeId !== gbp.placeId);
    ctx.competitors = others;
    competitorCount = others.length;
    const reviews = others.map((c) => c.reviewCount ?? 0).sort((a, b) => a - b);
    medianReviews = reviews.length ? reviews[Math.floor(reviews.length / 2)] : 0;
    densitySource = nearby.mocked ? `fixture (${city})` : `Google Places text search: "auto repair shops near ${city}"`;
  }

  if (competitorCount === 0) {
    const reason =
      "The advertising budget model needs local competitive density, which comes from the Google Business Profile's city. No verified profile or address is available, so no defensible budget can be produced.";
    ctx.review({
      category: "advertising",
      reason: "Budget model has no market data",
      question: `What city and state is ${ctx.prospect.shopName} in?`,
      instruction:
        "Confirm the location, add it to the prospect record, and re-run. The budget model then measures local competitive density automatically.",
    });
    return (["google_ads", "local_services_ads"] as const).map((channel) => ({
      channel,
      monthlyUsd: null,
      low: null,
      high: null,
      status: "unable_to_evaluate" as const,
      rationale: reason,
      inputs: { competitorCount: 0, source: densitySource },
    }));
  }

  const { tier, reasoning } = inferMarketTier({ competitorCount, medianCompetitorReviews: medianReviews });
  const a = ASSUMPTIONS;
  const cpc = a.cpcByTier[tier];
  const cpl = a.lsaCostPerLead[tier];
  const targetRo = a.targetIncrementalRoPerMonth;

  // Google Ads: the campaign is sized to add `targetRo` repair orders a month.
  // Two thirds of that target is put behind search ads, one third behind LSAs,
  // which is the split the agency uses when both channels run together.
  const googleRo = targetRo * (2 / 3);
  const googleClicks = googleRo * a.clicksPerRo;
  const googleRaw = googleClicks * cpc;
  const google = round50(clamp(googleRaw, a.googleFloorUsd, a.googleCeilingUsd));

  const lsaRo = targetRo * (1 / 3);
  const lsaLeads = lsaRo * a.leadsPerRo;
  const lsaRaw = lsaLeads * cpl;
  const lsa = round50(clamp(lsaRaw, a.lsaFloorUsd, a.lsaCeilingUsd));

  const clampNote = (raw: number, final: number, floor: number, ceil: number) =>
    raw < floor
      ? ` Raw model output was $${Math.round(raw)}, raised to the $${floor} floor below which a campaign cannot gather enough data.`
      : raw > ceil
        ? ` Raw model output was $${Math.round(raw)}, capped at the $${ceil} ceiling for a first engagement.`
        : "";

  const shared = {
    marketTier: tier,
    competitorCount,
    medianCompetitorReviews: medianReviews,
    densitySource,
    assumptionsVersion: a.version,
    targetIncrementalRoPerMonth: targetRo,
  };

  return [
    {
      channel: "google_ads",
      monthlyUsd: google,
      low: round50(google * 0.8),
      high: round50(google * 1.25),
      status: "confirmed",
      rationale:
        `Sized to add roughly ${Math.round(googleRo)} repair orders a month through paid search (two thirds of a ${targetRo} RO/month target). ` +
        `At ${a.clicksPerRo} clicks per booked RO that is ${Math.round(googleClicks)} clicks; at a ${tier}-market CPC of $${cpc} that is $${Math.round(googleRaw)}/month.` +
        clampNote(googleRaw, google, a.googleFloorUsd, a.googleCeilingUsd) +
        ` Market tier: ${reasoning} CPC and conversion assumptions come from the agency's assumptions table (version ${a.version}), not from Google — replace them with Keyword Planner data once a Google Ads developer token is connected.`,
      inputs: { ...shared, cpcUsd: cpc, clicksPerRo: a.clicksPerRo, targetRoFromSearch: Math.round(googleRo), estimatedClicks: Math.round(googleClicks), rawModelUsd: Math.round(googleRaw) },
    },
    {
      channel: "local_services_ads",
      monthlyUsd: lsa,
      low: round50(lsa * 0.8),
      high: round50(lsa * 1.25),
      status: "confirmed",
      rationale:
        `Sized to add roughly ${Math.round(lsaRo)} repair orders a month through Local Services Ads (the remaining third of the ${targetRo} RO/month target). ` +
        `At ${a.leadsPerRo} LSA leads per booked RO that is ${Math.round(lsaLeads)} leads; at a ${tier}-market cost per lead of $${cpl} that is $${Math.round(lsaRaw)}/month.` +
        clampNote(lsaRaw, lsa, a.lsaFloorUsd, a.lsaCeilingUsd) +
        ` LSAs also require Google Screened verification (licence and insurance checks), which is a prerequisite to spending this budget.`,
      inputs: { ...shared, costPerLeadUsd: cpl, leadsPerRo: a.leadsPerRo, targetRoFromLsa: Math.round(lsaRo), estimatedLeads: Math.round(lsaLeads), rawModelUsd: Math.round(lsaRaw) },
    },
  ];
}
