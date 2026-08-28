/**
 * Loads three sample discovery calls and runs a full DMI on each, entirely
 * offline. `DMI_FORCE_MOCK=1` makes every provider — including the web
 * crawler — read from fixtures/, so this works with no credentials and no
 * internet connection.
 *
 *   npm run seed
 */
process.env.DMI_FORCE_MOCK = "1";

import { intake } from "../src/lib/intake";
import { runPipeline } from "../src/lib/pipeline";
import { getStore } from "../src/lib/storage";

const SAMPLES = [
  {
    firstName: "Dana", lastName: "Whitfield", email: "dana@precisionautocare.example",
    phone: "(512) 555-0142", shopName: "Precision Auto Care",
    website: "https://precisionautocare.example",
    meetingType: "Discovery Call", discoveryCallAt: "2026-09-02T15:00:00Z",
    heardAboutUs: "Ratchet + Wrench podcast",
    marketingPainPoint: "We spend a lot on Google Ads but can't tell what's working.",
    ghlContactId: "ghl_demo_dana",
  },
  {
    firstName: "Ray", lastName: "Miller", email: "ray@millersgarage.example",
    phone: "(419) 555-0188", shopName: "Miller's Garage",
    website: "millersgarage.example",
    meetingType: "Discovery Call", discoveryCallAt: "2026-09-03T18:30:00Z",
    heardAboutUs: "Referred by another shop owner",
    marketingPainPoint: "Our website looks dated and we never post anything.",
  },
  {
    // Deliberately incomplete: no email, no meeting type, no website on file.
    firstName: "Tanya", lastName: "Reyes", phone: "704-555-0143",
    shopName: "Southside Tire & Auto", website: "southsidetire.example",
    discoveryCallAt: "2026-09-04T14:00:00Z",
    marketingPainPoint: "Phone stopped ringing this year.",
  },
];

async function main() {
  const store = getStore();
  console.log(`seeding into the "${store.driver}" store\n`);
  for (const sample of SAMPLES) {
    const result = await intake(sample);
    if (result.duplicate) {
      console.log(`· ${sample.shopName}: already inspected (run ${result.run.id})`);
      continue;
    }
    const run = await runPipeline(result.run.id);
    const open = await store.listReviewItems({ runId: run.id, status: "open" });
    console.log(
      `· ${sample.shopName}: ${run.totalScore}/20 ${String(run.classification).toUpperCase()}` +
        (run.potentialTotalScore > run.totalScore ? ` (up to ${run.potentialTotalScore} after review)` : "") +
        ` — ${run.state}, ${open.length} open question(s)\n  ${run.reportUrl}`,
    );
  }
  console.log("\nStart the app with `npm run dev` and open http://localhost:3000");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
