/**
 * Loads five sample discovery calls and runs a full DMI on each, entirely
 * offline. `DMI_FORCE_MOCK=1` makes every provider — including the web
 * crawler — read from fixtures/, so this works with no credentials and no
 * internet connection.
 *
 * The five samples deliberately cover different shapes of uncertainty, not
 * just different scores: a clean single-location match, incomplete intake
 * data, a shop with no social presence at all, a brand with three locations
 * (exercises the multiple-locations flag), and a shop with no website at all
 * (exercises the no-website path — SEO/ads/social still evaluate what they
 * can from other signals).
 *
 *   npm run seed
 */
// Loaded with Next's own env loader (not a plain `import "dotenv/config"`) so
// this CLI script sees .env.local/.env with the exact same file precedence
// as `next dev`/`build`/`start` — tsx does not auto-load either file on its
// own, and a mismatch there is exactly what caused a real "my data isn't
// showing up" support incident.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

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
  {
    // Three locations under one brand — exercises the multiple-locations
    // review flag. The discovery call is about the Springfield (main) shop.
    firstName: "Carlos", lastName: "Vega", email: "carlos@route9autogroup.example",
    phone: "(413) 555-0161", shopName: "Route 9 Auto Group",
    website: "https://route9autogroup.example",
    meetingType: "Discovery Call", discoveryCallAt: "2026-09-05T16:00:00Z",
    heardAboutUs: "Google search",
    marketingPainPoint: "Not sure our marketing budget is being split right across our three shops.",
  },
  {
    // No website at all — a very common real scenario. SEO/ads/social still
    // evaluate what they can; only the website criteria fail outright.
    firstName: "Deshawn", lastName: "Carter", email: "deshawn@quickfixautoshop.example",
    phone: "(251) 555-0119", shopName: "Quick Fix Auto Shop",
    meetingType: "Discovery Call", discoveryCallAt: "2026-09-08T13:00:00Z",
    heardAboutUs: "Walked past a truck wrap",
    marketingPainPoint: "We've never had a website — not sure if we even need one.",
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
