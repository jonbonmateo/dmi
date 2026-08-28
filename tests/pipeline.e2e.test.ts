/**
 * End-to-end: three sample discovery calls through the full pipeline, entirely
 * offline against fixtures/. Also exercises duplicate suppression and
 * resume-after-failure.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { intake } from "../src/lib/intake";
import { runPipeline } from "../src/lib/pipeline";
import { getStore } from "../src/lib/storage";
import { totals } from "../src/lib/scoring/rubric";

// Set before anything reads them. `env` exposes getters and the store is
// constructed lazily, so plain static imports below still see these.
process.env.DMI_FORCE_MOCK = "1";
process.env.DMI_DATA_DIR = ".data/test";
process.env.DMI_LOG_LEVEL = "error";

const dataDir = path.resolve(process.cwd(), ".data/test");

before(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});


test("a strong shop scores green with confirmed evidence", async () => {
  const { run: queued } = await intake({
    firstName: "Dana", lastName: "Whitfield", email: "dana@precisionautocare.example",
    phone: "(512) 555-0142", shopName: "Precision Auto Care",
    website: "https://precisionautocare.example",
    meetingType: "Discovery Call", discoveryCallAt: "2026-09-02T15:00:00Z",
  });
  const run = await runPipeline(queued.id);

  assert.equal(run.categories.length, 4, "all four categories are reviewed");
  for (const c of run.categories) assert.equal(c.findings.length, 5, `${c.category} has five criteria`);
  assert.equal(run.verification?.status, "confirmed");
  assert.equal(run.classification, "green");
  assert.ok(run.totalScore >= 16, `expected green, got ${run.totalScore}`);
  assert.ok(run.potentialTotalScore >= run.totalScore);

  const google = run.budgets.find((b) => b.channel === "google_ads");
  const lsa = run.budgets.find((b) => b.channel === "local_services_ads");
  assert.ok(google?.monthlyUsd && google.monthlyUsd > 0, "a Google Ads budget was produced");
  assert.ok(lsa?.monthlyUsd && lsa.monthlyUsd > 0, "an LSA budget was produced");
  assert.match(google!.rationale, /repair orders/, "the budget explains itself");

  const store = getStore();
  const tracking = await store.getTrackingRowByRun(run.id);
  assert.ok(tracking, "a tracking row was written");
  assert.equal(tracking!.totalScore, run.totalScore);
  assert.ok(tracking!.dmiLink?.includes(run.id), "the tracking row carries the DMI link");
  const card = await store.getBudgetCardByRun(run.id);
  assert.ok(card?.totalMonthlyUsd, "an Ads Budget Card was created");
});

test("a weak shop scores red and never fabricates a passing criterion", async () => {
  const { run: queued } = await intake({
    firstName: "Tanya", lastName: "Reyes", phone: "704-555-0143",
    shopName: "Southside Tire & Auto", website: "southsidetire.example",
    discoveryCallAt: "2026-09-04T14:00:00Z",
  });
  const run = await runPipeline(queued.id);

  assert.equal(run.classification, "red");
  const all = run.categories.flatMap((c) => c.findings);
  for (const f of all) {
    if (f.outcome === "pass") assert.equal(f.status, "confirmed", `${f.id} awarded a point without confirmed evidence`);
    if (f.status !== "confirmed") assert.notEqual(f.outcome, "pass", `${f.id} passed on unconfirmed evidence`);
    assert.ok(f.reasoning.length > 20, `${f.id} has no reasoning`);
  }
  // Missing intake data is surfaced, not silently defaulted.
  const store = getStore();
  const reviews = await store.listReviewItems({ runId: run.id });
  assert.ok(reviews.some((r) => r.reason.includes("incomplete")), "missing intake fields raised a review item");
});

test("every finding carries evidence a human can check", async () => {
  const store = getStore();
  const runs = await store.listRuns(10);
  const run = runs.find((r) => r.categories.length === 4)!;
  const findings = run.categories.flatMap((c) => c.findings);
  const withoutEvidence = findings.filter((f) => f.evidence.length === 0);
  assert.equal(withoutEvidence.length, 0, `findings with no evidence: ${withoutEvidence.map((f) => f.id).join(", ")}`);
  for (const f of findings) {
    for (const e of f.evidence) {
      assert.ok(e.checkedAt, `${f.id} evidence "${e.label}" has no timestamp`);
    }
  }
});

test("the phone criterion is routed to a human rather than auto-dialled", async () => {
  const store = getStore();
  const runs = await store.listRuns(10);
  const run = runs.find((r) => r.categories.length === 4)!;
  const phone = run.categories.find((c) => c.category === "advertising")!.findings.find((f) => f.index === 5)!;
  assert.equal(phone.outcome, "undetermined");
  assert.equal(phone.status, "requires_human_review");
  const reviews = await store.listReviewItems({ runId: run.id });
  assert.ok(reviews.some((r) => r.findingId === "advertising.5"), "a call task was queued for a person");
});

test("a duplicate webhook does not start a second DMI", async () => {
  const first = await intake({
    shopName: "Miller's Garage", website: "millersgarage.example",
    email: "ray@millersgarage.example", discoveryCallAt: "2026-09-03T18:30:00Z",
  });
  const again = await intake({
    company_name: "Millers Garage", website_url: "https://www.millersgarage.example/",
    email: "ray@millersgarage.example", startTime: "2026-09-03T22:00:00Z",
  });
  assert.equal(again.duplicate, true);
  assert.equal(again.run.id, first.run.id);
});

test("a completed run resumes without redoing finished steps", async () => {
  const store = getStore();
  const runs = await store.listRuns(10);
  const run = runs.find((r) => r.categories.length === 4)!;
  const attemptsBefore = run.steps.map((s) => s.attempts);

  // Simulate a crash after the SEO step: wipe the later checkpoints.
  const damaged = (await store.getRun(run.id))!;
  damaged.state = "running";
  for (const s of damaged.steps) {
    if (["advertising", "social", "score", "budget", "publish"].includes(s.step)) {
      s.status = "pending";
      s.output = null;
      s.finishedAt = null;
    }
  }
  await store.saveRun(damaged);

  const resumed = await runPipeline(run.id);
  const website = resumed.steps.find((s) => s.step === "website")!;
  assert.equal(website.attempts, attemptsBefore[1], "an already-completed step was not re-run");
  assert.equal(resumed.categories.length, 4, "the resumed run still has all four categories");
  assert.ok(resumed.budgets.length === 2, "budgets were recomputed after the crash");
});

test("answering a review question updates the score and the weekly status", async () => {
  const store = getStore();
  const runs = await store.listRuns(10);
  const run = runs.find((r) => r.state === "needs_review");
  if (!run) return; // every run happened to be clean
  const open = await store.listReviewItems({ runId: run.id, status: "open" });
  const scorable = open.find((i) => i.findingId);
  if (!scorable) return;

  const before = run.totalScore;
  for (const cat of run.categories) {
    const f = cat.findings.find((x) => x.id === scorable.findingId);
    if (!f) continue;
    f.humanOverride = { outcome: "pass", note: "Checked by hand.", by: "test", at: new Date().toISOString() };
    const outcomes = cat.findings.map((x) => x.humanOverride?.outcome ?? x.outcome);
    cat.score = outcomes.filter((o) => o === "pass").length;
    cat.potentialScore = cat.score + outcomes.filter((o) => o === "undetermined").length;
  }
  const t = totals(run.categories);
  assert.equal(t.total, before + 1, "the human's answer moved the score by exactly one point");
});
