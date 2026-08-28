/**
 * Step 3 — Search Engine Optimization review (5 criteria).
 */
import { parse, visibleText, links, sameHost, attr, excerpt } from "@/lib/providers/html";
import { getCitations } from "@/lib/providers/citations";
import { evidence, finding, summariseCategory } from "@/lib/scoring/rubric";
import type { CategoryResult, Finding } from "@/lib/types";
import type { Ctx } from "../context";

const BLOG_HINTS = ["/blog", "/news", "/articles", "/tips", "/resources", "/posts"];
const SERVICE_HINTS = [
  "brake", "oil-change", "oil change", "transmission", "alignment", "tire",
  "engine", "diagnostic", "ac-repair", "air conditioning", "battery",
  "suspension", "exhaust", "inspection", "tune-up", "fleet", "electrical",
  "cooling", "steering", "clutch", "differential",
];

function parseDates(html: string): Date[] {
  const out: Date[] = [];
  const iso = html.match(/\b(20\d{2}-\d{2}-\d{2})\b/g) ?? [];
  const long =
    html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*20\d{2}\b/g) ?? [];
  for (const s of [...iso, ...long]) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2015) out.push(d);
  }
  return out.sort((a, b) => b.getTime() - a.getTime());
}

export async function reviewSeo(ctx: Ctx): Promise<CategoryResult> {
  const findings: Finding[] = [];
  const captured: Record<string, string | null> = {
    "Google Business Profile": ctx.gbp?.mapsUrl ?? null,
    "Blog URL": null,
    "Service pages found": null,
    "Citation score": null,
  };

  const site = ctx.siteUrl;
  const home = site ? await ctx.page(site) : null;
  const homeOk = Boolean(home?.ok);

  /* ------------------------------------------------------------ 1. blog */
  if (!homeOk) {
    findings.push(
      finding({
        category: "seo", index: 1, outcome: "undetermined", status: "unable_to_evaluate",
        summary: "No readable website, so the blog could not be checked.",
        reasoning: site ? "The homepage could not be fetched." : "No website was supplied.",
        evidence: [evidence("observed_value", "Website", { value: site ?? "(none)" })],
      }),
    );
  } else {
    const $ = parse(home!.body);
    const all = links($, home!.finalUrl).filter((l) => sameHost(l.href, home!.finalUrl));
    const blogLink =
      all.find((l) => BLOG_HINTS.some((h) => new URL(l.href).pathname.toLowerCase().startsWith(h))) ??
      all.find((l) => /\b(blog|news|articles)\b/i.test(l.text));

    if (!blogLink) {
      findings.push(
        finding({
          category: "seo", index: 1, outcome: "fail", status: "confirmed", confidence: 0.8,
          summary: "No blog or news section was linked from the homepage.",
          reasoning: `Checked ${all.length} internal links for ${BLOG_HINTS.join(", ")} and for link text mentioning blog/news/articles. None matched.`,
          evidence: [evidence("observed_value", "Internal links scanned", { source: home!.finalUrl, value: String(all.length), checkedAt: home!.checkedAt })],
        }),
      );
    } else {
      captured["Blog URL"] = blogLink.href;
      const blog = await ctx.page(blogLink.href);
      if (!blog.ok) {
        findings.push(
          finding({
            category: "seo", index: 1, outcome: "undetermined", status: "unable_to_evaluate",
            summary: `A blog exists at ${blogLink.href} but could not be read.`,
            reasoning: `Fetch failed: ${blog.error ?? `HTTP ${blog.status}`}.`,
            evidence: [evidence("url", "Blog", { source: blogLink.href, value: `HTTP ${blog.status ?? "error"}`, checkedAt: blog.checkedAt })],
          }),
        );
        ctx.review({
          category: "seo", findingId: "seo.1", reason: "Blog page unreadable",
          question: `Open ${blogLink.href} — is it a properly formatted blog, and when was it last updated?`,
          instruction: "Award the point only if posts are dated and the most recent is within the last month.",
        });
      } else {
        const dates = parseDates(blog.body);
        const newest = dates[0] ?? null;
        const daysOld = newest ? Math.round((Date.now() - newest.getTime()) / 86_400_000) : null;
        const $b = parse(blog.body);
        const postLinks = links($b, blog.finalUrl).filter((l) => sameHost(l.href, blog.finalUrl) && l.text.length > 15);
        const formatted = postLinks.length >= 3;

        if (daysOld === null) {
          findings.push(
            finding({
              category: "seo", index: 1, outcome: "undetermined", status: "requires_human_review", confidence: 0.4,
              summary: `A blog exists at ${blogLink.href} but no post dates could be read.`,
              reasoning: `Found ${postLinks.length} post-like links but no parseable publication dates, so update frequency cannot be confirmed.`,
              evidence: [evidence("url", "Blog", { source: blog.finalUrl, value: `${postLinks.length} post links, 0 dates`, checkedAt: blog.checkedAt })],
            }),
          );
          ctx.review({
            category: "seo", findingId: "seo.1", reason: "Blog post dates not readable",
            question: `When was ${blogLink.href} last updated?`,
            instruction: "Award the point if the newest post is within the last ~31 days and the blog is properly formatted.",
          });
        } else {
          const pass = formatted && daysOld <= 45;
          findings.push(
            finding({
              category: "seo", index: 1, outcome: pass ? "pass" : "fail", status: "confirmed", confidence: 0.85,
              summary: `Blog at ${blogLink.href}; most recent post ${daysOld} day(s) ago (${newest!.toISOString().slice(0, 10)}).`,
              reasoning: `The benchmark is monthly updates. ${postLinks.length} post links and ${dates.length} dates were found on the index page. Newest post is ${daysOld} days old, which ${daysOld <= 45 ? "meets" : "misses"} a monthly cadence (45-day tolerance).`,
              evidence: [
                evidence("url", "Blog index", { source: blog.finalUrl, checkedAt: blog.checkedAt }),
                evidence("observed_value", "Most recent post date", { value: newest!.toISOString().slice(0, 10) }),
                evidence("observed_value", "Post links on index", { value: String(postLinks.length) }),
              ],
            }),
          );
        }
      }
    }
  }

  /* --------------------------------------------------- 2. service pages */
  if (!homeOk) {
    findings.push(
      finding({
        category: "seo", index: 2, outcome: "undetermined", status: "unable_to_evaluate",
        summary: "No readable website, so service pages could not be checked.",
        reasoning: "The homepage could not be fetched.",
      }),
    );
  } else {
    const $ = parse(home!.body);
    const internal = links($, home!.finalUrl).filter((l) => sameHost(l.href, home!.finalUrl));
    const servicePages = internal.filter((l) => {
      const p = `${new URL(l.href).pathname} ${l.text}`.toLowerCase();
      return SERVICE_HINTS.some((h) => p.includes(h)) || /\/services?\//.test(p);
    });
    const unique = [...new Map(servicePages.map((l) => [l.href, l])).values()];
    captured["Service pages found"] = String(unique.length);

    if (unique.length === 0) {
      findings.push(
        finding({
          category: "seo", index: 2, outcome: "fail", status: "confirmed", confidence: 0.75,
          summary: "No individual service pages were linked from the homepage.",
          reasoning: `Scanned ${internal.length} internal links for service keywords (${SERVICE_HINTS.slice(0, 6).join(", ")}…). None matched. A single "Services" page listing everything does not satisfy this criterion.`,
          evidence: [evidence("observed_value", "Internal links scanned", { source: home!.finalUrl, value: String(internal.length), checkedAt: home!.checkedAt })],
        }),
      );
    } else {
      // Sample up to three pages so we judge real content, not just URLs.
      const sample = unique.slice(0, 3);
      const inspected: { url: string; words: number; internalLinks: number; externalLinks: number; ok: boolean }[] = [];
      for (const s of sample) {
        const p = await ctx.page(s.href);
        if (!p.ok) { inspected.push({ url: s.href, words: 0, internalLinks: 0, externalLinks: 0, ok: false }); continue; }
        const $p = parse(p.body);
        const words = visibleText($p).split(/\s+/).length;
        const ls = links($p, p.finalUrl);
        inspected.push({
          url: p.finalUrl,
          words,
          internalLinks: ls.filter((l) => sameHost(l.href, p.finalUrl)).length,
          externalLinks: ls.filter((l) => !sameHost(l.href, p.finalUrl)).length,
          ok: true,
        });
      }
      const readable = inspected.filter((i) => i.ok);
      const substantial = readable.filter((i) => i.words >= 300);
      const linked = readable.filter((i) => i.internalLinks >= 3 || i.externalLinks >= 1);
      const pass = unique.length >= 3 && substantial.length >= Math.ceil(readable.length / 2) && linked.length >= 1;

      findings.push(
        finding({
          category: "seo", index: 2,
          outcome: readable.length === 0 ? "undetermined" : pass ? "pass" : "fail",
          status: readable.length === 0 ? "unable_to_evaluate" : "confirmed",
          confidence: 0.7,
          summary: `${unique.length} service page(s) linked; sampled ${readable.length} — ${substantial.length} had 300+ words of content.`,
          reasoning: readable.length === 0
            ? "Service page links were found but none of the sampled pages could be read."
            : `Sampled: ${readable.map((i) => `${new URL(i.url).pathname} (${i.words} words, ${i.internalLinks} internal / ${i.externalLinks} external links)`).join("; ")}. The criterion asks for individual pages with original content and appropriate links; 300 words is used as the "original content" floor.`,
          evidence: [
            evidence("observed_value", "Service pages linked from homepage", { source: home!.finalUrl, value: unique.slice(0, 8).map((l) => new URL(l.href).pathname).join(", "), checkedAt: home!.checkedAt }),
            ...readable.map((i) => evidence("url", `Sampled service page`, { source: i.url, value: `${i.words} words, ${i.internalLinks} internal links, ${i.externalLinks} external links` })),
          ],
        }),
      );
      if (readable.length > 0 && substantial.length > 0) {
        ctx.review({
          category: "seo", findingId: "seo.2", reason: "Content originality cannot be verified automatically",
          question: `Spot-check one service page (${readable[0].url}) — is the copy original to this shop, or boilerplate the website vendor ships to every client?`,
          instruction: "Paste a distinctive sentence into Google in quotes. If it appears on other shops' sites, the content is not original — withhold the point.",
        });
      }
    }
  }

  /* ------------------------------------------------ 3. on-page SEO structure */
  if (!homeOk) {
    findings.push(
      finding({
        category: "seo", index: 3, outcome: "undetermined", status: "unable_to_evaluate",
        summary: "No readable website, so on-page SEO could not be checked.",
        reasoning: "The homepage could not be fetched.",
      }),
    );
  } else {
    const targets = [home!.finalUrl, ...(captured["Blog URL"] ? [captured["Blog URL"]!] : [])];
    const rows: string[] = [];
    let checks = 0;
    let passes = 0;
    for (const url of targets) {
      const p = await ctx.page(url);
      if (!p.ok) continue;
      const $p = parse(p.body);
      const title = ($p("title").first().text() ?? "").trim();
      const desc = attr($p, 'meta[name="description"]', "content") ?? "";
      const h1s = $p("h1").length;
      const h2s = $p("h2").length;
      const imgs = $p("img").toArray();
      const alt = imgs.filter((el) => ($p(el).attr("alt") ?? "").trim().length > 0).length;
      const altPct = imgs.length ? Math.round((alt / imgs.length) * 100) : 100;

      const local = [
        title.length >= 20 && title.length <= 70,
        desc.length >= 50 && desc.length <= 175,
        h1s === 1,
        h2s >= 2,
        altPct >= 80,
      ];
      checks += local.length;
      passes += local.filter(Boolean).length;
      rows.push(
        `${new URL(url).pathname || "/"} — title ${title.length} chars${title ? ` ("${excerpt(title, 60)}")` : " (MISSING)"}, meta description ${desc.length} chars${desc ? "" : " (MISSING)"}, ${h1s} H1 / ${h2s} H2, alt text on ${altPct}% of ${imgs.length} images`,
      );
    }
    const pct = checks ? Math.round((passes / checks) * 100) : 0;
    const pass = pct >= 70;
    findings.push(
      finding({
        category: "seo", index: 3,
        outcome: checks === 0 ? "undetermined" : pass ? "pass" : "fail",
        status: checks === 0 ? "unable_to_evaluate" : "confirmed",
        confidence: 0.8,
        summary: checks === 0 ? "No pages could be analysed." : `${passes}/${checks} on-page SEO checks passed (${pct}%) across ${rows.length} page(s).`,
        reasoning: `Each page is checked for: title 20-70 chars, meta description 50-175 chars, exactly one H1, at least two H2s, and alt text on 80%+ of images. A consistent structure is scored as 70% or better.\n${rows.join("\n")}`,
        evidence: rows.map((r) => evidence("observed_value", "On-page SEO", { source: home!.finalUrl, value: r, checkedAt: home!.checkedAt })),
      }),
    );
  }

  /* --------------------------------------------- 4. Google Business Profile */
  {
    const gbp = ctx.gbp;
    if (!gbp) {
      findings.push(
        finding({
          category: "seo", index: 4, outcome: "undetermined", status: "not_found", confidence: 0.4,
          summary: "No Google Business Profile could be matched to this shop.",
          reasoning: "The Places search returned no confident match. A missing profile is a major finding, but 'we could not find it' is not the same as 'it does not exist' — a human should search Google Maps before we tell the prospect they have no listing.",
          evidence: [evidence("reasoning", "Places search", { value: ctx.verification?.ambiguities.join(" ") ?? "no match" })],
        }),
      );
      ctx.review({
        category: "seo", findingId: "seo.4", reason: "Google Business Profile not found",
        question: `Search Google Maps for "${ctx.prospect.shopName}". Does a Google Business Profile exist?`,
        instruction: "Paste the Maps link if it exists. If it genuinely does not exist, mark the criterion failed — that is a strong selling point for the salesperson.",
      });
    } else {
      captured["Google Business Profile"] = gbp.mapsUrl;
      const optimisationChecks = [
        { label: "hours published", ok: gbp.hasHours },
        { label: "photos published", ok: gbp.hasPhotos },
        { label: "website linked", ok: Boolean(gbp.website) },
        { label: "phone published", ok: Boolean(gbp.phone) },
        { label: "business description", ok: Boolean(gbp.editorialSummary) },
        { label: "25+ reviews", ok: (gbp.reviewCount ?? 0) >= 25 },
        { label: "rating 4.0+", ok: (gbp.rating ?? 0) >= 4 },
      ];
      const optimised = optimisationChecks.filter((c) => c.ok).length;

      // Weekly update cadence needs Posts, which the Places API does not
      // expose. Review activity is a proxy for "active", never for "posts".
      const recentReview = gbp.latestReviewAt ? Math.round((Date.now() - Date.parse(gbp.latestReviewAt)) / 86_400_000) : null;
      findings.push(
        finding({
          category: "seo", index: 4, outcome: "undetermined", status: "requires_human_review",
          confidence: 0.5,
          summary: `Profile found — ${optimised}/${optimisationChecks.length} optimisation elements present, ${gbp.reviewCount ?? 0} reviews, ${gbp.rating ?? "no"} rating. Weekly-update cadence needs a human check.`,
          reasoning: `Optimisation: ${optimisationChecks.map((c) => `${c.label}: ${c.ok ? "yes" : "no"}`).join(", ")}. ${recentReview !== null ? `Most recent review ${recentReview} days ago.` : "Review recency unavailable."} The criterion also requires updates at least weekly, which means Google Posts — the Places API does not expose Posts, so that half must be checked by eye.`,
          evidence: [
            evidence("api_response", "Google Places profile", { source: gbp.mapsUrl ?? "places", value: `${gbp.name} — ${gbp.formattedAddress ?? "no address"}, ${gbp.reviewCount ?? 0} reviews, rating ${gbp.rating ?? "n/a"}, ${gbp.photoCount} photos` }),
            evidence("observed_value", "Optimisation elements", { value: `${optimised}/${optimisationChecks.length}` }),
          ],
        }),
      );
      ctx.review({
        category: "seo", findingId: "seo.4", reason: "Google Posts cadence is not available via API",
        question: `Open ${gbp.mapsUrl ?? "the Google profile"} → Updates/Posts tab. Has the shop posted in the last 7 days? Profile is otherwise ${optimised}/${optimisationChecks.length} optimised.`,
        instruction: "Award the point if the profile is substantially complete AND there is a Google Post within the last week.",
      });
    }
  }

  /* ----------------------------------------------------- 5. citations */
  {
    const cit = await getCitations({
      shopName: ctx.prospect.shopName,
      phone: ctx.prospect.phone ?? ctx.gbp?.phone ?? null,
      address: ctx.gbp?.formattedAddress ?? null,
      websiteUrl: ctx.siteUrl,
      fixtureKey: ctx.fixtureKey,
    });
    captured["Citation score"] = cit.scorePercent === null ? "Not measured" : `${cit.scorePercent}%${cit.approximation ? " (approximation)" : ""}`;

    const confirmedNumber = cit.status === "confirmed" && cit.scorePercent !== null;
    findings.push(
      finding({
        category: "seo", index: 5,
        outcome: confirmedNumber ? (cit.scorePercent! >= 60 ? "pass" : "fail") : "undetermined",
        status: confirmedNumber ? "confirmed" : cit.status,
        confidence: confirmedNumber ? 0.85 : 0.3,
        summary: cit.scorePercent === null
          ? "Citation consistency could not be measured."
          : `Citation score ${cit.scorePercent}%${cit.approximation ? " (our own approximation, not the aggregator's number)" : ""} against a 60% benchmark.`,
        reasoning: cit.note,
        evidence: [
          ...cit.sources.map((s) =>
            evidence("url", `Citation source: ${s.name}`, { source: s.url, value: `${s.found ? "found" : "not found"} — name ${s.nameMatch}, phone ${s.phoneMatch}, address ${s.addressMatch}. ${s.note}` }),
          ),
          evidence("reasoning", "Method", { value: cit.approximation ? "First-party NAP comparison" : "Aggregator report" }),
        ],
      }),
    );
    if (!confirmedNumber) {
      ctx.review({
        category: "seo", findingId: "seo.5", reason: "Citation score needs the paid aggregator",
        question: `Run a citation audit for "${ctx.prospect.shopName}"${ctx.gbp?.formattedAddress ? ` at ${ctx.gbp.formattedAddress}` : ""} and record the percentage.`,
        instruction: "BrightLocal / Yext / Moz Local. Award the point at 60% or above. Our approximation was " + (cit.scorePercent === null ? "not computable" : `${cit.scorePercent}%`) + ".",
      });
    }
  }

  return summariseCategory("seo", findings, captured);
}
