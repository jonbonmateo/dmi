/**
 * Inputs for the advertising-budget recommendation.
 *
 * The Google Ads Keyword Planner API requires an approved Google Ads developer
 * token tied to a manager account, which most agencies have but which cannot
 * be assumed here. So the model is explicit and auditable:
 *
 *   monthly budget = target clicks x market CPC
 *
 * with every input either measured (review count, competitor density from
 * Places) or taken from a documented, versioned assumptions table that a human
 * can edit. Nothing here is presented as a Google-sourced number.
 */
export interface MarketAssumptions {
  version: string;
  /** Typical automotive-repair search CPC by market tier, USD. */
  cpcByTier: Record<MarketTier, number>;
  /** Local Services Ads cost per lead for auto services, USD. */
  lsaCostPerLead: Record<MarketTier, number>;
  /** Clicks needed per booked repair order. */
  clicksPerRo: number;
  /** LSA leads needed per booked repair order. */
  leadsPerRo: number;
  /** Repair orders per month the campaign is sized to add. */
  targetIncrementalRoPerMonth: number;
  /** Budgets are clamped into this range so the card is always sane. */
  googleFloorUsd: number;
  googleCeilingUsd: number;
  lsaFloorUsd: number;
  lsaCeilingUsd: number;
}

export type MarketTier = "small" | "mid" | "large" | "metro";

export const ASSUMPTIONS: MarketAssumptions = {
  version: "2026-08-dmi-v1",
  cpcByTier: { small: 4.5, mid: 6.5, large: 9.0, metro: 12.0 },
  lsaCostPerLead: { small: 22, mid: 28, large: 35, metro: 45 },
  clicksPerRo: 12,
  leadsPerRo: 4,
  targetIncrementalRoPerMonth: 25,
  googleFloorUsd: 750,
  googleCeilingUsd: 8000,
  lsaFloorUsd: 500,
  lsaCeilingUsd: 4000,
};

/**
 * Competitive tier inferred from how crowded the local map pack is and how
 * many reviews the leaders have — both measured from the Places response.
 */
export function inferMarketTier(input: {
  competitorCount: number;
  medianCompetitorReviews: number;
}): { tier: MarketTier; reasoning: string } {
  const { competitorCount, medianCompetitorReviews } = input;
  const score = competitorCount * 2 + medianCompetitorReviews / 100;
  let tier: MarketTier = "small";
  if (score >= 30) tier = "metro";
  else if (score >= 20) tier = "large";
  else if (score >= 10) tier = "mid";
  return {
    tier,
    reasoning: `${competitorCount} nearby repair shops returned by Google, median ${medianCompetitorReviews} reviews → density score ${score.toFixed(1)} → "${tier}" market tier.`,
  };
}
