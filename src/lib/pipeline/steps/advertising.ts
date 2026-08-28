/**
 * Step 4 — Digital Advertising review (5 criteria).
 *
 * On criterion 5 (a real person answers the phone): see the long note near
 * the bottom of this file. We deliberately do not place the call.
 */
import { detectTech } from "@/lib/providers/tech";
import { getGoogleAds, getMetaAds, googleTransparencyUrl, metaAdLibraryUrl } from "@/lib/providers/ad-libraries";
import { evidence, finding, summariseCategory } from "@/lib/scoring/rubric";
import { parse } from "@/lib/providers/html";
import type { CategoryResult, Finding } from "@/lib/types";
import type { Ctx } from "../context";

export async function reviewAdvertising(ctx: Ctx): Promise<CategoryResult> {
  const findings: Finding[] = [];
  const domain = ctx.siteUrl ? new URL(ctx.siteUrl).hostname.replace(/^www\./, "") : null;
  const captured: Record<string, string | null> = {
    "Google Ads Transparency Center": domain ? googleTransparencyUrl(domain) : null,
    "Meta Ad Library": metaAdLibraryUrl(ctx.prospect.shopName),
    "Meta Pixel": null,
    "Google Ads tags": null,
  };

  const home = ctx.siteUrl ? await ctx.page(ctx.siteUrl) : null;
  const html = home?.ok ? home.body : "";
  const tech = html ? detectTech(html, home!.headers) : [];
  const metaPixel = tech.find((t) => t.name === "Meta Pixel") ?? null;
  const gConversion = tech.find((t) => t.name === "Google Ads conversion tag") ?? null;
  const gRemarketing = tech.find((t) => t.name === "Google Ads remarketing") ?? null;
  const otherRetargeting = tech.filter((t) => t.category === "ads" && !["Meta Pixel"].includes(t.name));
  const gclidAware = /gclid/i.test(html);
  captured["Meta Pixel"] = metaPixel ? "Present" : html ? "Not found" : "Not checked";
  captured["Google Ads tags"] = [gConversion && "conversion tag", gRemarketing && "remarketing tag"].filter(Boolean).join(", ") || (html ? "None found" : "Not checked");

  const google = await getGoogleAds(domain ?? ctx.prospect.shopName, ctx.fixtureKey, {
    conversionTag: Boolean(gConversion),
    remarketingTag: Boolean(gRemarketing),
    gclidAware,
  });
  const meta = await getMetaAds(ctx.prospect.shopName, ctx.fixtureKey);

  /* ------------------------------------------- 1. Google ads confirmed? */
  findings.push(
    finding({
      category: "advertising", index: 1,
      outcome: google.status === "confirmed" ? (google.running ? "pass" : "fail") : "undetermined",
      status: google.status,
      confidence: google.status === "confirmed" ? 0.85 : 0.35,
      summary: google.status === "confirmed"
        ? google.running ? `${google.ads.length} Google ad(s) confirmed running.` : "No Google ads found in the Transparency Center."
        : "Google advertising activity could not be confirmed automatically.",
      reasoning: google.note,
      evidence: [
        evidence("url", "Google Ads Transparency Center", { source: google.verifyUrl, value: "Verify here in ~10 seconds" }),
        evidence("observed_value", "Google Ads conversion tag on site", { source: ctx.siteUrl ?? undefined, value: gConversion ? gConversion.matchedOn : "not found", checkedAt: home?.checkedAt }),
        evidence("observed_value", "Google Ads remarketing tag on site", { value: gRemarketing ? gRemarketing.matchedOn : "not found" }),
        evidence("observed_value", "Site handles gclid parameter", { value: gclidAware ? "yes" : "no" }),
      ],
    }),
  );

  /* --------------------------------------- 2. Facebook/Instagram ads? */
  findings.push(
    finding({
      category: "advertising", index: 2,
      outcome: meta.status === "confirmed" ? (meta.running ? "pass" : "fail") : "undetermined",
      status: meta.status,
      confidence: meta.status === "confirmed" ? 0.8 : 0.35,
      summary: meta.status === "confirmed"
        ? meta.running ? `${meta.ads.length} Meta ad(s) found in the Ad Library.` : "No Meta ads found in the Ad Library."
        : "Meta advertising activity could not be confirmed automatically.",
      reasoning: meta.note,
      evidence: [
        evidence("url", "Meta Ad Library", { source: meta.verifyUrl, value: "Verify here in ~10 seconds" }),
        ...meta.ads.slice(0, 3).map((a) =>
          evidence("api_response", "Meta ad", { source: a.sourceUrl, value: `${a.headline ?? "(no headline)"} — started ${a.firstSeen ?? "unknown"}` }),
        ),
        evidence("observed_value", "Meta Pixel on site (supporting signal)", { value: metaPixel ? "present" : "not found" }),
      ],
    }),
  );

  /* ------------------------------- 3. at least three Google ads/campaigns */
  findings.push(
    finding({
      category: "advertising", index: 3,
      outcome: google.status === "confirmed" ? (google.ads.length >= 3 ? "pass" : "fail") : "undetermined",
      status: google.status === "confirmed" ? "confirmed" : google.status,
      confidence: google.status === "confirmed" ? 0.85 : 0.3,
      summary: google.status === "confirmed"
        ? `${google.ads.length} distinct Google ad(s) identified (benchmark: 3).`
        : "Could not count Google ads automatically.",
      reasoning: google.status === "confirmed"
        ? `Distinct creatives found: ${google.ads.map((a) => a.headline ?? a.id).slice(0, 5).join(" | ") || "none"}.`
        : `${google.note} Counting distinct creatives requires opening the Transparency Center.`,
      evidence: [
        evidence("url", "Google Ads Transparency Center", { source: google.verifyUrl }),
        ...google.ads.slice(0, 5).map((a) => evidence("api_response", "Google ad creative", { source: a.sourceUrl, value: a.headline ?? a.id })),
      ],
    }),
  );

  if (google.status !== "confirmed") {
    ctx.review({
      category: "advertising",
      findingId: "advertising.1",
      reason: "Google Ads has no public API and the Transparency Center forbids automated access",
      question: `Open ${google.verifyUrl} — is ${ctx.prospect.shopName} running Google ads, and how many distinct ads/campaigns are shown?`,
      instruction: "Record 'yes/no' and the ad count. Criterion 1 = any Google ads running. Criterion 3 = at least three distinct ads. This resolves both.",
    });
  }
  if (meta.status !== "confirmed") {
    ctx.review({
      category: "advertising",
      findingId: "advertising.2",
      reason: "Meta Ad Library coverage is incomplete without a token",
      question: `Open ${meta.verifyUrl} — is ${ctx.prospect.shopName} running Facebook or Instagram ads?`,
      instruction: "Search the shop's page name. Record yes/no and how many active ads.",
    });
  }

  /* --------------------------------------- 4. retargeting pixel present */
  {
    const anyPixel = metaPixel ?? otherRetargeting[0] ?? null;
    findings.push(
      finding({
        category: "advertising", index: 4,
        outcome: !html ? "undetermined" : anyPixel ? "pass" : "fail",
        status: !html ? "unable_to_evaluate" : "confirmed",
        confidence: html ? 0.9 : 0.1,
        summary: !html
          ? "The website could not be read, so retargeting tags could not be checked."
          : metaPixel
            ? "Meta Pixel is installed on the homepage."
            : anyPixel
              ? `No Meta Pixel, but a comparable retargeting tag is present: ${anyPixel.name}.`
              : "No Meta Pixel or comparable retargeting tag was found on the homepage.",
        reasoning: !html
          ? "Homepage HTML was unavailable."
          : `Searched the homepage HTML for fbevents.js / fbq('init') and for comparable retargeting tags (Google Ads remarketing, TikTok Pixel, LinkedIn Insight). Found: ${tech.filter((t) => t.category === "ads").map((t) => t.name).join(", ") || "none"}. Note this only checks the homepage — a pixel could live on a separate landing page.`,
        evidence: [
          evidence("html_excerpt", "Retargeting tags in homepage HTML", { source: ctx.siteUrl ?? undefined, value: tech.filter((t) => t.category === "ads").map((t) => `${t.name} (${t.matchedOn})`).join("; ") || "none found", checkedAt: home?.checkedAt }),
        ],
      }),
    );
  }

  /* ---------------------------------- 5. does a real person answer? */
  {
    /*
     * We do NOT auto-dial the shop.
     *
     * Reasons, in order of weight:
     *  1. Legal — an automated outbound call to a business line is a robocall
     *     under the TCPA unless a human initiates it. Doing it at scale from a
     *     server is exactly the pattern the FCC enforces against.
     *  2. Accuracy — "a real person answered" is a judgement about tone, hold
     *     time and whether they could book an appointment. A speech classifier
     *     guessing at that is precisely the kind of invented certainty this
     *     system is built to avoid.
     *  3. Relationship — this is a prospect the salesperson is about to call
     *     anyway. A mystery-shop call is a natural part of that conversation.
     *
     * What we DO automate: pull the number to call from the verified sources,
     * assemble the readiness signals we can observe without dialling (online
     * booking, live chat, call tracking, published hours, review responses),
     * and put a one-question task in front of the human who is already calling.
     */
    const $ = html ? parse(html) : null;
    const phone = ctx.gbp?.phone ?? ctx.prospect.phone ?? null;
    const booking = tech.filter((t) => t.category === "booking").map((t) => t.name);
    const chat = tech.filter((t) => t.category === "chat").map((t) => t.name);
    const callTracking = tech.find((t) => t.name === "CallRail");
    const bookingLink = $ ? $('a[href*="appointment" i], a[href*="schedule" i], a[href*="book" i]').length : 0;
    const hoursPublished = ctx.gbp?.hasHours ?? false;

    const readiness = [
      booking.length > 0 && `online booking (${booking.join(", ")})`,
      bookingLink > 0 && `${bookingLink} appointment/booking link(s) on the homepage`,
      chat.length > 0 && `live chat (${chat.join(", ")})`,
      callTracking && "call tracking installed (CallRail)",
      hoursPublished && "business hours published on Google",
    ].filter(Boolean) as string[];

    findings.push(
      finding({
        category: "advertising", index: 5,
        outcome: "undetermined",
        status: "requires_human_review",
        confidence: 0.3,
        summary: `Not automated by design. Lead-response signals observed: ${readiness.length ? readiness.join("; ") : "none"}. Call ${phone ?? "the shop"} to confirm a person answers.`,
        reasoning:
          "Placing an automated call to a prospect's business line would be a robocall under the TCPA and a poor way to open a sales relationship, and machine-judging 'a real person answered helpfully' would be exactly the kind of unfounded certainty this inspection avoids. Instead the automation gathers every lead-response signal observable from public data and hands the salesperson a single question to answer during the call they are already making.",
        evidence: [
          evidence("observed_value", "Phone number to call", { value: phone ?? "not found", source: ctx.gbp?.mapsUrl ?? ctx.siteUrl ?? undefined }),
          evidence("observed_value", "Lead-response tooling on site", { value: readiness.join("; ") || "none detected", source: ctx.siteUrl ?? undefined, checkedAt: home?.checkedAt }),
          evidence("reasoning", "Why this is not automated", { value: "TCPA robocall exposure; judgement call; salesperson is already calling this prospect." }),
        ],
      }),
    );
    ctx.review({
      category: "advertising",
      findingId: "advertising.5",
      reason: "Phone test is intentionally human",
      question: `Call ${phone ?? ctx.prospect.shopName} as a customer. Did a real person answer, and could they book you in?`,
      instruction: `Do this during the discovery call prep. Record: who answered (person / voicemail / IVR / no answer), rings before pickup, and whether they offered an appointment. Observed lead-response tooling: ${readiness.join("; ") || "none"}.`,
    });
  }

  return summariseCategory("advertising", findings, captured, [
    "Ad-platform confirmation links are one click away in the evidence for each criterion.",
  ]);
}
