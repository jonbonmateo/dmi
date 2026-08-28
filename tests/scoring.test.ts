import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, finding, summariseCategory, totals } from "../src/lib/scoring/rubric";
import type { CategoryResult } from "../src/lib/types";

test("classification bands match the manual DMI", () => {
  assert.equal(classify(1), "red");
  assert.equal(classify(10), "red");
  assert.equal(classify(11), "yellow");
  assert.equal(classify(15), "yellow");
  assert.equal(classify(16), "green");
  assert.equal(classify(20), "green");
});

test("an unconfirmed pass is downgraded rather than scored", () => {
  const f = finding({
    category: "website", index: 1, outcome: "pass", status: "requires_human_review",
    summary: "", reasoning: "",
  });
  assert.equal(f.outcome, "undetermined", "a point must never be awarded on unconfirmed evidence");
});

test("an undetermined outcome cannot claim confirmed status", () => {
  const f = finding({
    category: "seo", index: 3, outcome: "undetermined", status: "confirmed",
    summary: "", reasoning: "",
  });
  assert.equal(f.status, "requires_human_review");
});

test("category score counts only confirmed passes, potential adds the unknowns", () => {
  const findings = [
    finding({ category: "social", index: 1, outcome: "pass", status: "confirmed", summary: "", reasoning: "" }),
    finding({ category: "social", index: 2, outcome: "fail", status: "confirmed", summary: "", reasoning: "" }),
    finding({ category: "social", index: 3, outcome: "undetermined", status: "unable_to_evaluate", summary: "", reasoning: "" }),
    finding({ category: "social", index: 4, outcome: "undetermined", status: "requires_human_review", summary: "", reasoning: "" }),
    finding({ category: "social", index: 5, outcome: "pass", status: "confirmed", summary: "", reasoning: "" }),
  ];
  const c = summariseCategory("social", findings, {});
  assert.equal(c.score, 2);
  assert.equal(c.potentialScore, 4);
});

test("a human override replaces the automated outcome in the score", () => {
  const f = finding({ category: "advertising", index: 5, outcome: "undetermined", status: "requires_human_review", summary: "", reasoning: "" });
  f.humanOverride = { outcome: "pass", note: "Called; Rita answered in two rings.", by: "jon", at: new Date().toISOString() };
  const c = summariseCategory("advertising", [f], {});
  assert.equal(c.score, 1);
  assert.equal(c.potentialScore, 1);
});

test("totals sum categories and classify the run", () => {
  const cats: CategoryResult[] = (["website", "seo", "advertising", "social"] as const).map((category) => ({
    category, findings: [], score: 4, potentialScore: 5, captured: {}, notes: [],
  }));
  const t = totals(cats);
  assert.equal(t.total, 16);
  assert.equal(t.potential, 20);
  assert.equal(t.classification, "green");
});
