/**
 * Step 5 — Social Media review (5 criteria).
 *
 * Meta gates logged-out profile access, so several criteria here resolve to
 * requires_human_review unless a fixture (or a resolved review answer)
 * supplies the observations. That is the honest ceiling of what is available
 * without a Page access token for a Page the agency manages.
 */
import { discoverSocialLinks, getSocialProfile, postingFrequency, type SocialProfile } from "@/lib/providers/social";
import { evidence, finding, summariseCategory } from "@/lib/scoring/rubric";
import type { CategoryResult, Finding } from "@/lib/types";
import type { Ctx } from "../context";

function describe(p: SocialProfile): string {
  return p.url ? `${p.platform}: ${p.url}` : `${p.platform}: not found`;
}

export async function reviewSocial(ctx: Ctx): Promise<CategoryResult> {
  const findings: Finding[] = [];

  /* -------------------------------------------------- discover profiles */
  const home = ctx.siteUrl ? await ctx.page(ctx.siteUrl) : null;
  const fromSite = home?.ok ? discoverSocialLinks(home.body) : { facebook: null, instagram: null };

  const fb = await getSocialProfile("facebook", fromSite.facebook, ctx.fixtureKey, fromSite.facebook ? ctx.siteUrl : null);
  const ig = await getSocialProfile("instagram", fromSite.instagram, ctx.fixtureKey, fromSite.instagram ? ctx.siteUrl : null);

  const allPosts = [...fb.posts, ...ig.posts];
  const freqFb = fb.postsPerWeek !== null ? { perWeek: fb.postsPerWeek, windowDays: fb.observedWindowDays } : postingFrequency(fb.posts);
  const freqIg = ig.postsPerWeek !== null ? { perWeek: ig.postsPerWeek, windowDays: ig.observedWindowDays } : postingFrequency(ig.posts);
  const bestFreq = [freqFb.perWeek, freqIg.perWeek].filter((n): n is number => n !== null).sort((a, b) => b - a)[0] ?? null;

  const captured: Record<string, string | null> = {
    "Facebook page": fb.url,
    "Instagram page": ig.url,
    "Posting frequency": bestFreq === null ? "Not observed" : `${bestFreq} posts/week`,
    "Followers (Facebook)": fb.followers === null ? "Not observed" : String(fb.followers),
    "Followers (Instagram)": ig.followers === null ? "Not observed" : String(ig.followers),
  };

  const linkEvidence = [
    evidence("url", "Facebook profile", { source: fb.url ?? undefined, value: fb.url ? `discovered from ${fb.discoveredFrom ?? "search"}` : "not found" }),
    evidence("url", "Instagram profile", { source: ig.url ?? undefined, value: ig.url ? `discovered from ${ig.discoveredFrom ?? "search"}` : "not found" }),
  ];

  if (!fb.url && !ig.url) {
    ctx.review({
      category: "social",
      reason: "No social profiles discovered",
      question: `Search Facebook and Instagram for "${ctx.prospect.shopName}". Do profiles exist?`,
      instruction: "Paste the profile URLs here, or confirm the shop has none — 'no social presence at all' is a strong finding, but only once a human has looked.",
    });
  }

  /* --------------------------------- 1. complete About + profile/cover art */
  {
    const profiles = [fb, ig].filter((p) => p.url);
    if (profiles.length === 0) {
      findings.push(
        finding({
          category: "social", index: 1, outcome: "fail", status: "not_found", confidence: 0.5,
          summary: "No Facebook or Instagram profile was found for this shop.",
          reasoning: `Neither a Facebook nor an Instagram link was present on ${ctx.siteUrl ?? "the shop's website"}, and no profile was supplied on the discovery-call form. Flagged for a manual search before this is presented as fact.`,
          evidence: linkEvidence,
        }),
      );
    } else {
      const known = profiles.filter((p) => p.aboutText !== null || p.hasProfileImage !== null);
      const complete = profiles.filter(
        (p) => (p.aboutText ?? "").length >= 60 && p.hasProfileImage === true && p.hasCoverImage !== false,
      );
      const decided = known.length === profiles.length && profiles.every((p) => p.hasCoverImage !== null);
      findings.push(
        finding({
          category: "social", index: 1,
          outcome: decided ? (complete.length === profiles.length ? "pass" : "fail") : "undetermined",
          status: decided ? "confirmed" : "requires_human_review",
          confidence: decided ? 0.8 : 0.35,
          summary: decided
            ? `${complete.length}/${profiles.length} profile(s) have a substantially complete About section and both images.`
            : `Profiles found (${profiles.map(describe).join(", ")}) but Meta does not serve About/cover details to logged-out clients.`,
          reasoning: profiles
            .map((p) => `${p.platform}: About ${(p.aboutText ?? "").length} chars, profile image ${p.hasProfileImage ?? "unknown"}, cover image ${p.hasCoverImage ?? "unknown"}. ${p.note}`)
            .join("\n"),
          evidence: [
            ...linkEvidence,
            ...profiles.map((p) => evidence("observed_value", `${p.platform} About text`, { source: p.url ?? undefined, value: p.aboutText ? p.aboutText.slice(0, 200) : "not readable" })),
          ],
        }),
      );
      if (!decided) {
        ctx.review({
          category: "social", findingId: "social.1", reason: "Meta gates logged-out profile data",
          question: `Open ${profiles.map((p) => p.url).join(" and ")}. Are the About sections filled in, with a proper profile picture and cover image?`,
          instruction: "Award the point only if every profile the shop has is substantially complete.",
        });
      }
    }
  }

  /* ------------------------------------------ 2. posts 3+ times per week */
  {
    const decided = bestFreq !== null;
    findings.push(
      finding({
        category: "social", index: 2,
        outcome: decided ? (bestFreq! >= 3 ? "pass" : "fail") : "undetermined",
        status: decided ? "confirmed" : "requires_human_review",
        confidence: decided ? 0.8 : 0.2,
        summary: decided
          ? `${bestFreq} posts per week observed (benchmark: 3).`
          : "Posting frequency could not be observed automatically.",
        reasoning: decided
          ? `Facebook: ${freqFb.perWeek ?? "not observed"}/week over ${freqFb.windowDays ?? "?"} days (${fb.posts.length} posts). Instagram: ${freqIg.perWeek ?? "not observed"}/week over ${freqIg.windowDays ?? "?"} days (${ig.posts.length} posts). The higher of the two is used.`
          : "Post history is not available to logged-out requests, and no Page access token is configured. Counting posts by hand takes about a minute per profile.",
        evidence: [
          ...linkEvidence,
          evidence("observed_value", "Posts observed", { value: `${fb.posts.length} Facebook, ${ig.posts.length} Instagram` }),
        ],
      }),
    );
    if (!decided && (fb.url || ig.url)) {
      ctx.review({
        category: "social", findingId: "social.2", reason: "Post history not machine-readable",
        question: `Count the posts in the last 30 days on ${[fb.url, ig.url].filter(Boolean).join(" and ")}. How many per week?`,
        instruction: "Award the point at 3 or more posts per week.",
      });
    }
  }

  /* ------------------------------------------- 3. authentic vs stock content */
  {
    const classified = allPosts.filter((p) => p.media !== "unknown");
    const decided = classified.length >= 5;
    const original = classified.filter((p) => p.media === "original").length;
    findings.push(
      finding({
        category: "social", index: 3,
        outcome: decided ? (original / classified.length > 0.5 ? "pass" : "fail") : "undetermined",
        status: decided ? "confirmed" : "requires_human_review",
        confidence: decided ? 0.7 : 0.2,
        summary: decided
          ? `${original}/${classified.length} recent posts use the shop's own photos or video.`
          : "Content authenticity could not be assessed automatically.",
        reasoning: decided
          ? "The criterion asks whether authentic shop content outweighs generic stock content, so the threshold is more than half."
          : "Post media is not retrievable from logged-out profile requests. A person can judge a month of posts at a glance.",
        evidence: [
          ...linkEvidence,
          ...allPosts.slice(0, 4).map((p) => evidence("observed_value", `Post ${p.date}`, { source: p.url ?? undefined, value: `${p.media} media — ${(p.caption ?? "").slice(0, 120)}` })),
        ],
      }),
    );
    if (!decided && (fb.url || ig.url)) {
      ctx.review({
        category: "social", findingId: "social.3", reason: "Post media not machine-readable",
        question: `Scroll the last ~10 posts on ${[fb.url, ig.url].filter(Boolean).join(" / ")}. Are most of them real photos/video of this shop, its team or its work?`,
        instruction: "Award the point when authentic content outnumbers generic stock/meme content.",
      });
    }
  }

  /* ------------------------------- 4. engagement + community management */
  {
    const withEngagement = allPosts.filter((p) => p.likes !== null || p.comments !== null);
    const decided = withEngagement.length >= 5;
    const engaged = withEngagement.filter((p) => (p.likes ?? 0) + (p.comments ?? 0) >= 3).length;
    const replied = allPosts.filter((p) => p.businessReplied === true).length;
    const anyRepliesKnown = allPosts.some((p) => p.businessReplied !== null);
    findings.push(
      finding({
        category: "social", index: 4,
        outcome: decided && anyRepliesKnown ? (engaged / withEngagement.length >= 0.5 && replied > 0 ? "pass" : "fail") : "undetermined",
        status: decided && anyRepliesKnown ? "confirmed" : "requires_human_review",
        confidence: decided ? 0.7 : 0.2,
        summary: decided
          ? `${engaged}/${withEngagement.length} posts drew meaningful engagement; the business replied on ${replied} post(s).`
          : "Engagement and community management could not be observed automatically.",
        reasoning: decided
          ? "The criterion needs both halves: posts get engagement AND the business responds. Both are required for the point."
          : "Reactions, comments and business replies are not exposed to logged-out clients.",
        evidence: [
          ...linkEvidence,
          evidence("observed_value", "Posts with engagement data", { value: String(withEngagement.length) }),
          evidence("observed_value", "Posts with a business reply", { value: anyRepliesKnown ? String(replied) : "unknown" }),
        ],
      }),
    );
    if (!(decided && anyRepliesKnown) && (fb.url || ig.url)) {
      ctx.review({
        category: "social", findingId: "social.4", reason: "Engagement data not machine-readable",
        question: `On ${[fb.url, ig.url].filter(Boolean).join(" / ")}: are people liking and commenting, and does the shop reply to comments and reviews?`,
        instruction: "Award the point only when posts get engagement AND the shop is replying.",
      });
    }
  }

  /* ------------------------------- 5. content duplicated across shops? */
  {
    /*
     * Duplicate-content detection means searching a caption verbatim and
     * seeing it on unrelated shops' pages — this is the tell for a franchised
     * "social media package" vendor. Meta has no search API for that, so we
     * can only do it when we actually have captions (fixture or human input).
     */
    const captions = allPosts.map((p) => p.caption).filter((c): c is string => Boolean(c && c.length > 40));
    if (captions.length === 0) {
      findings.push(
        finding({
          category: "social", index: 5, outcome: "undetermined", status: "requires_human_review", confidence: 0.2,
          summary: "Could not check whether the content is duplicated across other shops' pages.",
          reasoning: "No post captions were retrievable. This check requires searching a distinctive caption verbatim to see whether other, unrelated repair shops posted the same thing — the signature of a bulk social-media vendor.",
          evidence: linkEvidence,
        }),
      );
      if (fb.url || ig.url) {
        ctx.review({
          category: "social", findingId: "social.5", reason: "Duplicate-content check needs post captions",
          question: `Copy a distinctive sentence from a recent post on ${[fb.url, ig.url].filter(Boolean).join(" / ")} and search it in quotes on Google and Facebook. Does it appear on other repair shops' pages?`,
          instruction: "Award the point if the content appears to be unique to this shop.",
        });
      }
    } else {
      // With captions available we can at least report exact internal repeats.
      const seen = new Map<string, number>();
      for (const c of captions) {
        const k = c.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      const repeats = [...seen.values()].filter((n) => n > 1).length;
      findings.push(
        finding({
          category: "social", index: 5, outcome: "undetermined", status: "requires_human_review", confidence: 0.35,
          summary: `${captions.length} caption(s) captured, ${repeats} repeated within this shop's own feed. Cross-shop duplication still needs a search.`,
          reasoning: "Repetition inside one feed is measurable; duplication across unrelated shops is not, because no platform exposes a content-search API. A verbatim search of one caption settles it in seconds.",
          evidence: [
            ...linkEvidence,
            evidence("observed_value", "Sample caption to search verbatim", { value: captions[0].slice(0, 160) }),
          ],
        }),
      );
      ctx.review({
        category: "social", findingId: "social.5", reason: "Cross-shop duplication needs a verbatim search",
        question: `Search this caption in quotes: "${captions[0].slice(0, 120)}" — does it appear on other repair shops' pages?`,
        instruction: "Award the point if the content is unique to this shop.",
      });
    }
  }

  const notes: string[] = [];
  if (fb.mocked || ig.mocked) notes.push("Social observations came from a fixture, not a live profile read.");
  notes.push("Meta does not serve post history, engagement or cover art to logged-out clients; those criteria are routed to the review queue by design rather than guessed at.");
  return summariseCategory("social", findings, captured, notes);
}
