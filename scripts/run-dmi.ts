/**
 * Run a DMI from the command line against a real shop.
 *
 *   npm run dmi -- --shop "Precision Auto Care" --website https://example.com \
 *                  --phone "(512) 555-0142" --email owner@example.com
 *
 * Add --mock to force fixture mode.
 */
import { intake } from "../src/lib/intake";
import { runPipeline } from "../src/lib/pipeline";
import { getStore } from "../src/lib/storage";
import { CATEGORY_LABELS } from "../src/lib/types";
import { CLASSIFICATION_LABEL } from "../src/lib/scoring/rubric";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--mock")) process.env.DMI_FORCE_MOCK = "1";

  const shopName = arg("shop");
  if (!shopName) {
    console.error('Usage: npm run dmi -- --shop "Shop Name" [--website url] [--phone p] [--email e] [--mock]');
    process.exit(1);
  }

  const result = await intake({
    shopName,
    website: arg("website"),
    phone: arg("phone"),
    email: arg("email"),
    firstName: arg("first"),
    lastName: arg("last"),
    discoveryCallAt: arg("call") ?? new Date().toISOString(),
    meetingType: arg("meeting") ?? "Discovery Call",
  });

  if (result.missing.length) {
    console.log(`Missing intake fields (reported, not guessed): ${result.missing.join(", ")}\n`);
  }
  if (result.duplicate) {
    console.log(`A DMI already exists for this shop and call date: ${result.run.reportUrl ?? result.run.id}`);
    return;
  }

  console.log(`Running DMI ${result.run.id} for ${shopName}…\n`);
  const run = await runPipeline(result.run.id);
  const store = getStore();
  const open = await store.listReviewItems({ runId: run.id, status: "open" });

  for (const c of run.categories) {
    console.log(`${CATEGORY_LABELS[c.category]} — ${c.score}/5${c.potentialScore > c.score ? ` (up to ${c.potentialScore})` : ""}`);
    for (const f of c.findings) {
      const o = f.humanOverride?.outcome ?? f.outcome;
      console.log(`  ${o === "pass" ? "[+]" : o === "fail" ? "[-]" : "[?]"} ${f.index}. ${f.summary}`);
    }
    console.log("");
  }
  for (const b of run.budgets) {
    console.log(`${b.channel}: ${b.monthlyUsd === null ? `no recommendation (${b.status})` : `$${b.monthlyUsd}/mo`}`);
  }
  console.log(`\nTOTAL ${run.totalScore}/20 — ${run.classification ? CLASSIFICATION_LABEL[run.classification] : "unscored"}`);
  if (run.potentialTotalScore > run.totalScore) {
    console.log(`${run.potentialTotalScore - run.totalScore} criteria unconfirmed; the score could reach ${run.potentialTotalScore}/20.`);
  }
  console.log(`State: ${run.state}. Open questions for a human: ${open.length}`);
  for (const o of open) console.log(`  ? ${o.question.split("\n")[0]}`);
  console.log(`\nReport: ${run.reportUrl}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
