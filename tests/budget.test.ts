import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSUMPTIONS, inferMarketTier } from "../src/lib/providers/keyword-demand";

test("market tier rises with competitive density", () => {
  assert.equal(inferMarketTier({ competitorCount: 2, medianCompetitorReviews: 30 }).tier, "small");
  assert.equal(inferMarketTier({ competitorCount: 5, medianCompetitorReviews: 100 }).tier, "mid");
  assert.equal(inferMarketTier({ competitorCount: 9, medianCompetitorReviews: 200 }).tier, "large");
  assert.equal(inferMarketTier({ competitorCount: 14, medianCompetitorReviews: 300 }).tier, "metro");
});

test("tier reasoning names the numbers it used", () => {
  const { reasoning } = inferMarketTier({ competitorCount: 5, medianCompetitorReviews: 100 });
  assert.match(reasoning, /5 nearby repair shops/);
  assert.match(reasoning, /median 100 reviews/);
});

test("assumptions are ordered and bounded so budgets stay sane", () => {
  const t = ASSUMPTIONS.cpcByTier;
  assert.ok(t.small < t.mid && t.mid < t.large && t.large < t.metro);
  assert.ok(ASSUMPTIONS.googleFloorUsd < ASSUMPTIONS.googleCeilingUsd);
  assert.ok(ASSUMPTIONS.lsaFloorUsd < ASSUMPTIONS.lsaCeilingUsd);
});
