/**
 * Step 1 — prove that everything we are about to inspect belongs to THIS shop.
 *
 * Nothing downstream is trusted until this step produces a verification
 * record. It is the difference between "we inspected the prospect" and "we
 * inspected a shop with a similar name two states away".
 */
import { normaliseUrl, originOf } from "@/lib/providers/http";
import { parse, visibleText, excerpt } from "@/lib/providers/html";
import { searchBusiness, type PlaceCandidate } from "@/lib/providers/places";
import { normalisePhone } from "@/lib/providers/citations";
import { discoverSocialLinks } from "@/lib/providers/social";
import type { BusinessVerification } from "@/lib/types";
import type { Ctx } from "../context";
import { slug } from "../context";

function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(llc|l\.l\.c|inc|incorporated|co|company|the|and|auto|automotive|repair|service|services|center|centre|shop|garage)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

function nameSimilarity(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.includes(kb) || kb.includes(ka)) return 0.85;
  // token overlap on the raw names as a softer signal
  const t = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const ta = t(a);
  const tb = t(b);
  const inter = [...ta].filter((w) => tb.has(w)).length;
  return inter / Math.max(1, Math.min(ta.size, tb.size));
}

export async function verifyBusiness(ctx: Ctx): Promise<BusinessVerification> {
  const { prospect } = ctx;
  const signals: string[] = [];
  const conflicts: string[] = [];
  const ambiguities: string[] = [];

  /* ------------------------------------------------- 1. resolve the website */
  const submitted = normaliseUrl(prospect.websiteUrl);
  let resolved: string | null = null;

  if (!submitted) {
    signals.push("No website address was supplied on the discovery-call form.");
  } else {
    const res = await ctx.page(submitted);
    if (res.ok) {
      resolved = originOf(res.finalUrl);
      signals.push(`Website ${submitted} responded ${res.status} in ${res.elapsedMs}ms.`);
      if (originOf(res.finalUrl) !== originOf(submitted)) {
        signals.push(`Redirected to ${resolved}.`);
      }
      const body = visibleText(parse(res.body)).slice(0, 6000);
      const sim = nameSimilarity(prospect.shopName, body.slice(0, 1500));
      if (body.toLowerCase().includes(prospect.shopName.toLowerCase())) {
        signals.push(`The shop name "${prospect.shopName}" appears verbatim on the homepage.`);
      } else if (sim >= 0.5) {
        signals.push(`Homepage text is a partial name match for "${prospect.shopName}".`);
      } else {
        conflicts.push(
          `The submitted website does not mention "${prospect.shopName}" on its homepage. Excerpt: "${excerpt(body, 180)}"`,
        );
      }
      const phone = normalisePhone(prospect.phone);
      if (phone && res.body.replace(/\D/g, "").includes(phone)) {
        signals.push("The prospect's phone number appears on the website.");
      }
    } else if (res.blocked) {
      conflicts.push(
        `The website blocked automated inspection (HTTP ${res.status}). Findings that depend on reading the site will need a human.`,
      );
      resolved = originOf(submitted);
    } else {
      conflicts.push(
        `The submitted website ${submitted} could not be reached (${res.error ?? `HTTP ${res.status}`}).`,
      );
    }
  }
  ctx.siteUrl = resolved;
  if (resolved) {
    try {
      ctx.fixtureKey = new URL(resolved).hostname.replace(/^www\./, "");
    } catch {
      ctx.fixtureKey = slug(prospect.shopName);
    }
  }

  /* --------------------------------------- 2. corroborate against Google */
  const query = [prospect.shopName, resolved ? new URL(resolved).hostname : ""]
    .filter(Boolean)
    .join(" ");
  const places = await searchBusiness(query, ctx.fixtureKey);

  let matched: PlaceCandidate | null = null;
  if (places.candidates.length > 0) {
    const scored = places.candidates.map((c) => {
      let score = nameSimilarity(prospect.shopName, c.name);
      if (resolved && c.website && originOf(c.website) === resolved) score += 0.6;
      const p = normalisePhone(prospect.phone);
      if (p && normalisePhone(c.phone) === p) score += 0.6;
      return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const runnerUp = scored[1];

    if (best.score >= 0.8) {
      matched = best.c;
      signals.push(
        `Google Business Profile matched: "${best.c.name}" — ${best.c.formattedAddress ?? "address not published"} (match score ${best.score.toFixed(2)}).`,
      );
    } else if (best.score >= 0.45) {
      matched = best.c;
      ambiguities.push(
        `Best Google match "${best.c.name}" is only a partial match (score ${best.score.toFixed(2)}). Confirm this is the right business before relying on the SEO and advertising findings.`,
      );
    } else {
      ambiguities.push(
        `No Google result matched "${prospect.shopName}" confidently. Best candidate was "${best.c.name}" (score ${best.score.toFixed(2)}).`,
      );
    }

    if (runnerUp && best.score - runnerUp.score < 0.25) {
      ambiguities.push(
        `Two similarly-named businesses returned: "${best.c.name}" and "${runnerUp.c.name}". A human must pick the right one.`,
      );
    }

    if (matched?.website && resolved && originOf(matched.website) !== resolved) {
      conflicts.push(
        `The Google profile lists ${matched.website} but the prospect supplied ${resolved}.`,
      );
    }
    const p = normalisePhone(prospect.phone);
    if (p && matched?.phone && normalisePhone(matched.phone) !== p) {
      conflicts.push(
        `Phone mismatch: form says ${prospect.phone}, Google profile says ${matched.phone}.`,
      );
    }
  } else {
    ambiguities.push(
      `No Google Business Profile was found for "${query}". ${places.note}`,
    );
  }
  ctx.gbp = matched;

  /* --------------------------------------------- 3. multiple locations? */
  const brandMatches = places.candidates.filter(
    (c) => nameSimilarity(prospect.shopName, c.name) >= 0.8,
  );
  const locations = brandMatches
    .map((c) => c.formattedAddress)
    .filter((a): a is string => Boolean(a));
  const multipleLocations = new Set(locations).size > 1;
  if (multipleLocations) {
    signals.push(
      `${locations.length} locations found under this brand. The DMI is scoped to the location matching the discovery-call record; other locations are listed for the salesperson.`,
    );
  }

  /* -------------------------------------------------------- 4. verdict */
  let status: BusinessVerification["status"];
  let confidence: number;
  if (conflicts.length > 0 && signals.length === 0) {
    status = "conflicting_information";
    confidence = 0.2;
  } else if (conflicts.length > 0) {
    status = "conflicting_information";
    confidence = 0.5;
  } else if (matched && resolved) {
    status = "confirmed";
    confidence = 0.95;
  } else if (matched || resolved) {
    status = "requires_human_review";
    confidence = 0.6;
  } else {
    status = "not_found";
    confidence = 0.1;
  }

  const verification: BusinessVerification = {
    status,
    confidence,
    matchedName: matched?.name ?? null,
    matchedAddress: matched?.formattedAddress ?? null,
    matchedPhone: matched?.phone ?? null,
    websiteResolvedUrl: resolved,
    signals,
    conflicts,
    ambiguities,
    multipleLocations,
    locations: [...new Set(locations)],
  };

  /* ------------------------------------------ 5. raise human review tasks */
  if (!submitted) {
    ctx.review({
      category: "run",
      reason: "No website supplied",
      question: `Does ${prospect.shopName} have a website?`,
      instruction:
        "Search Google for the shop name plus city. If a site exists, add it to the prospect record and re-run the DMI. If the shop genuinely has no website, record that — it is a legitimate red-flag finding, not an error.",
    });
  }
  if (status === "conflicting_information") {
    ctx.review({
      category: "run",
      reason: "Public information conflicts with the discovery-call form",
      question: `Which details are correct for ${prospect.shopName}?\n${conflicts.map((c) => `• ${c}`).join("\n")}`,
      instruction:
        "Confirm the correct website, phone and address with the prospect or from the GoHighLevel record, correct the prospect record, then re-run.",
    });
  }
  if (ambiguities.length > 0) {
    ctx.review({
      category: "run",
      reason: "Business identity is ambiguous",
      question: ambiguities.join("\n"),
      instruction:
        "Open Google Maps, confirm the correct listing, and paste the correct Google Business Profile link into the resolution box.",
    });
  }
  if (multipleLocations) {
    ctx.review({
      category: "run",
      reason: "Multiple locations detected",
      question: `This brand has ${verification.locations.length} locations:\n${verification.locations.map((l) => `• ${l}`).join("\n")}\nWhich one is the discovery call about?`,
      instruction:
        "Confirm the target location with the prospect. Website, ads and social findings are usually brand-wide; the Google Business Profile and citation findings are per-location.",
    });
  }

  // Social links harvested here so later steps do not re-fetch the homepage.
  if (resolved) {
    const res = await ctx.page(resolved);
    if (res.ok) {
      const found = discoverSocialLinks(res.body);
      if (found.facebook) signals.push(`Facebook link on the website: ${found.facebook}`);
      if (found.instagram) signals.push(`Instagram link on the website: ${found.instagram}`);
    }
  }

  return verification;
}
