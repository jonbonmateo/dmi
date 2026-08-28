/**
 * The DMI pipeline.
 *
 * Design points that matter:
 *  - Every step is checkpointed to the store the moment it finishes, so a
 *    crashed or timed-out run resumes at the first unfinished step instead of
 *    re-crawling the shop's website.
 *  - A step failing does not kill the run: the failure is recorded, the
 *    affected criteria come out `unable_to_evaluate`, and the report still
 *    renders with everything that did succeed.
 *  - The run is only `completed` when there is nothing left for a human; if
 *    anything is unresolved it lands in `needs_review`, which is a finished
 *    state too, just an honest one.
 */
import { getStore } from "@/lib/storage";
import { log } from "@/lib/logger";
import { totals } from "@/lib/scoring/rubric";
import { env } from "@/lib/env";
import type { CategoryResult, DmiRun, Prospect, StepName, StepRecord } from "@/lib/types";
import { STEP_ORDER } from "@/lib/types";
import { Ctx } from "./context";
import { verifyBusiness } from "./steps/verify-business";
import { reviewWebsite } from "./steps/website";
import { reviewSeo } from "./steps/seo";
import { reviewAdvertising } from "./steps/advertising";
import { reviewSocial } from "./steps/social";
import { recommendBudgets } from "./steps/budget";
import { publish } from "./steps/publish";

const MAX_ATTEMPTS = 3;

export function emptySteps(): StepRecord[] {
  return STEP_ORDER.map((step) => ({
    step,
    status: "pending" as const,
    attempts: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
    output: null,
  }));
}

function stepOf(run: DmiRun, name: StepName): StepRecord {
  let s = run.steps.find((x) => x.step === name);
  if (!s) {
    s = { step: name, status: "pending", attempts: 0, startedAt: null, finishedAt: null, error: null, output: null };
    run.steps.push(s);
  }
  return s;
}

/** Category results are stored by key so a resumed run keeps prior work. */
function setCategory(run: DmiRun, result: CategoryResult) {
  const i = run.categories.findIndex((c) => c.category === result.category);
  if (i >= 0) run.categories[i] = result;
  else run.categories.push(result);
  run.categories.sort(
    (a, b) =>
      ["website", "seo", "advertising", "social"].indexOf(a.category) -
      ["website", "seo", "advertising", "social"].indexOf(b.category),
  );
}

export async function runPipeline(runId: string): Promise<DmiRun> {
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run) throw new Error(`run ${runId} not found`);
  const prospect = await store.getProspect(run.prospectId);
  if (!prospect) throw new Error(`prospect ${run.prospectId} not found`);

  if (run.state === "completed") {
    log.info("run already completed, nothing to do", { run: run.id });
    return run;
  }

  run.state = "running";
  if (run.steps.length === 0) run.steps = emptySteps();
  await store.saveRun(run);

  const ctx = new Ctx(run, prospect);
  ctx.verification = run.verification;

  /** Run one step, or reuse its cached output if it already succeeded. */
  async function step<T>(name: StepName, fn: () => Promise<T>, apply: (out: T) => void, onFail: () => void): Promise<void> {
    const rec = stepOf(run!, name);
    if (rec.status === "done") {
      // Rehydrate in-memory state from the checkpoint so later steps still work.
      apply(rec.output as T);
      log.debug("step already done, reusing checkpoint", { run: run!.id, step: name });
      return;
    }
    if (rec.attempts >= MAX_ATTEMPTS) {
      rec.status = "failed";
      onFail();
      return;
    }
    rec.status = "running";
    rec.attempts += 1;
    rec.startedAt = new Date().toISOString();
    await store.saveRun(run!);
    try {
      const out = await fn();
      rec.output = out;
      rec.status = "done";
      rec.error = null;
      rec.finishedAt = new Date().toISOString();
      apply(out);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      rec.status = "failed";
      rec.error = message;
      rec.finishedAt = new Date().toISOString();
      ctx.addError(name, `Step "${name}" failed: ${message}`, {
        detail: e instanceof Error ? e.stack : undefined,
        fatal: rec.attempts >= MAX_ATTEMPTS,
      });
      onFail();
    }
    await store.saveRun(run!);
    await store.addReviewItems(ctx.reviewItems);
  }

  /* -------------------------------------------------------------- steps */
  await step(
    "verify_business",
    () => verifyBusiness(ctx),
    (v) => {
      ctx.verification = v;
      run.verification = v;
      ctx.siteUrl = v.websiteResolvedUrl;
      if (v.websiteResolvedUrl) {
        try { ctx.fixtureKey = new URL(v.websiteResolvedUrl).hostname.replace(/^www\./, ""); } catch { /* keep slug */ }
      }
    },
    () => {
      ctx.review({
        category: "run",
        reason: "Business verification failed",
        question: `Automated verification of ${prospect.shopName} failed. Confirm the shop's website, phone and Google listing by hand.`,
        instruction: "Correct the prospect record, then re-run the DMI.",
      });
    },
  );

  const categorySteps: [StepName, () => Promise<CategoryResult>][] = [
    ["website", () => reviewWebsite(ctx)],
    ["seo", () => reviewSeo(ctx)],
    ["advertising", () => reviewAdvertising(ctx)],
    ["social", () => reviewSocial(ctx)],
  ];
  for (const [name, fn] of categorySteps) {
    await step(
      name,
      fn,
      (result) => setCategory(run, result),
      () => {
        ctx.review({
          category: name as CategoryResult["category"],
          reason: `The ${name} review step failed`,
          question: `Complete the ${name} section of the DMI for ${prospect.shopName} by hand.`,
          instruction: "Score the five criteria manually and record them here. The rest of the DMI is unaffected.",
        });
      },
    );
  }

  /* ------------------------------------------------------------ scoring */
  await step(
    "score",
    async () => totals(run.categories),
    (t) => {
      run.totalScore = t.total;
      run.potentialTotalScore = t.potential;
      run.classification = t.classification;
    },
    () => {},
  );

  await step(
    "budget",
    () => recommendBudgets(ctx),
    (b) => { run.budgets = b; },
    () => { run.budgets = []; },
  );

  await store.addReviewItems(ctx.reviewItems);

  await step(
    "publish",
    () => publish(ctx),
    (p) => { run.publish = p; },
    () => {},
  );

  /* ------------------------------------------------------------ verdict */
  const open = await store.listReviewItems({ runId: run.id, status: "open" });
  const fatal = run.steps.filter((s) => s.status === "failed" && s.attempts >= MAX_ATTEMPTS);
  const anyResults = run.categories.length > 0;

  if (!anyResults && fatal.length > 0) {
    run.state = "failed";
  } else if (open.length > 0 || fatal.length > 0) {
    run.state = "needs_review";
  } else {
    run.state = "completed";
    run.completedAt = new Date().toISOString();
  }
  if (!run.reportUrl) run.reportUrl = `${env.appUrl}/dmi/${run.id}`;

  await store.saveRun(run);
  log.info("run finished", {
    run: run.id,
    state: run.state,
    score: run.totalScore,
    potential: run.potentialTotalScore,
    classification: run.classification,
    openReviews: open.length,
    pagesFetched: ctx.pagesFetched,
  });
  return run;
}

/** Used by the cron endpoint to drain queued and stuck runs. */
export async function drainQueue(staleMs = 10 * 60_000): Promise<{ processed: string[]; skipped: number }> {
  const store = getStore();
  const claimable = await store.claimableRuns(staleMs);
  const processed: string[] = [];
  for (const run of claimable.slice(0, 5)) {
    try {
      await runPipeline(run.id);
      processed.push(run.id);
    } catch (e) {
      log.error("drain failed", { run: run.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { processed, skipped: Math.max(0, claimable.length - processed.length) };
}

export type { Prospect };
