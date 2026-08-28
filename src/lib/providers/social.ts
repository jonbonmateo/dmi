/**
 * Facebook / Instagram discovery and profile assessment.
 *
 * Reality check: Meta serves logged-out profile requests behind a consent
 * wall and its Graph API only exposes Pages you own. So the honest automated
 * capability is:
 *
 *   - discover the profile URLs (from the shop's website + Google profile)
 *   - fetch the public og: metadata that Meta still serves to crawlers
 *   - report everything else as requires_human_review with a deep link
 *
 * A fixture (or a human's answers via the review queue) fills the rest. We
 * never estimate posting frequency or engagement we did not observe.
 */
import { fetchPage } from "./http";
import { parse, attr } from "./html";
import { fixtureSection, MOCK } from "./mock";
import { isMock } from "@/lib/runtime-mode";
import type { EvidenceStatus } from "@/lib/types";

export interface SocialPost {
  date: string;
  caption: string | null;
  /** Best guess at whether the media is the shop's own. */
  media: "original" | "stock" | "unknown";
  likes: number | null;
  comments: number | null;
  businessReplied: boolean | null;
  url: string | null;
}

export interface SocialProfile {
  platform: "facebook" | "instagram";
  url: string | null;
  status: EvidenceStatus;
  discoveredFrom: string | null;
  handle: string | null;
  title: string | null;
  aboutText: string | null;
  hasProfileImage: boolean | null;
  hasCoverImage: boolean | null;
  followers: number | null;
  posts: SocialPost[];
  /** Posts per week over the observed window; null when unobserved. */
  postsPerWeek: number | null;
  observedWindowDays: number | null;
  mocked: boolean;
  note: string;
}

const FB_RE = /(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/(?!(?:sharer|share|plugins|tr\b|dialog))([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?)/i;
const IG_RE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?!(?:p|reel|explore|accounts)\/)([A-Za-z0-9._]+)/i;

/** Pull social links out of any HTML we already have. */
export function discoverSocialLinks(html: string): {
  facebook: string | null;
  instagram: string | null;
} {
  const fb = html.match(FB_RE);
  const ig = html.match(IG_RE);
  return {
    facebook: fb ? `https://www.facebook.com/${fb[1].replace(/\/$/, "")}` : null,
    instagram: ig ? `https://www.instagram.com/${ig[1].replace(/\/$/, "")}` : null,
  };
}

function emptyProfile(
  platform: "facebook" | "instagram",
  url: string | null,
  status: EvidenceStatus,
  note: string,
  discoveredFrom: string | null = null,
): SocialProfile {
  return {
    platform,
    url,
    status,
    discoveredFrom,
    handle: url ? url.split("/").filter(Boolean).at(-1) ?? null : null,
    title: null,
    aboutText: null,
    hasProfileImage: null,
    hasCoverImage: null,
    followers: null,
    posts: [],
    postsPerWeek: null,
    observedWindowDays: null,
    mocked: false,
    note,
  };
}

export async function getSocialProfile(
  platform: "facebook" | "instagram",
  url: string | null,
  fixtureKey: string,
  discoveredFrom: string | null,
): Promise<SocialProfile> {
  const fx = isMock()
    ? await fixtureSection<Partial<SocialProfile>>(
        fixtureKey,
        platform === "facebook" ? "facebookProfile" : "instagramProfile",
      )
    : null;
  if (fx) {
    const posts = fx.posts ?? [];
    return {
      ...emptyProfile(platform, fx.url ?? url, "confirmed", "", discoveredFrom),
      ...fx,
      platform,
      posts,
      mocked: true,
      status: (fx.status as EvidenceStatus) ?? "confirmed",
      note: `${MOCK} ${platform} profile data from fixture.`,
    };
  }

  if (!url) {
    return emptyProfile(
      platform,
      null,
      "not_found",
      `No ${platform} link was found on the shop's website or Google profile. Search ${platform} manually before concluding the shop has no page.`,
      discoveredFrom,
    );
  }

  const res = await fetchPage(url, { timeoutMs: 15_000 });
  if (!res.ok) {
    return emptyProfile(
      platform,
      url,
      "unable_to_evaluate",
      `${platform} returned ${res.status ?? res.error} for a logged-out request (Meta gates public profiles). Open the profile link and fill in the review questions.`,
      discoveredFrom,
    );
  }

  const $ = parse(res.body);
  const title = attr($, 'meta[property="og:title"]', "content");
  const description = attr($, 'meta[property="og:description"]', "content");
  const image = attr($, 'meta[property="og:image"]', "content");

  return {
    ...emptyProfile(platform, res.finalUrl, "requires_human_review", "", discoveredFrom),
    title,
    aboutText: description,
    hasProfileImage: image ? true : null,
    note: `Public og: metadata was readable, but Meta does not serve post history, cover art or engagement to logged-out clients. Posting frequency, engagement and content authenticity need a human look (or a Meta Graph API token for a Page the agency manages).`,
  };
}

/** Posts-per-week over the observed window, or null if nothing was observed. */
export function postingFrequency(posts: SocialPost[]): {
  perWeek: number | null;
  windowDays: number | null;
} {
  const dated = posts
    .map((p) => Date.parse(p.date))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (dated.length < 2) return { perWeek: null, windowDays: null };
  const windowDays = Math.max(
    7,
    Math.round((dated.at(-1)! - dated[0]) / 86_400_000),
  );
  return {
    perWeek: Number(((dated.length / windowDays) * 7).toFixed(1)),
    windowDays,
  };
}
