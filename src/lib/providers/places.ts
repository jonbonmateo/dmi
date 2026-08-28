/**
 * Google Business Profile lookup via the Places API (New).
 *
 * This provider does double duty: it is how we (a) confirm the prospect's
 * business identity and (b) evaluate the Google Business Profile criterion.
 * When several candidates come back we report ambiguity rather than picking
 * the first one.
 */
import { env, providerMode } from "@/lib/env";
import { fixtureSection, MOCK } from "./mock";
import type { EvidenceStatus } from "@/lib/types";

export interface PlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string | null;
  businessStatus: string | null;
  /** Present when the profile publishes photos/hours/etc. */
  hasHours: boolean;
  hasPhotos: boolean;
  photoCount: number;
  primaryType: string | null;
  latestReviewAt: string | null;
  editorialSummary: string | null;
}

export interface PlacesResult {
  status: EvidenceStatus;
  mocked: boolean;
  source: string;
  candidates: PlaceCandidate[];
  note: string;
}

const SEARCH = "https://places.googleapis.com/v1/places:searchText";

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.photos",
  "places.primaryType",
  "places.reviews",
  "places.editorialSummary",
].join(",");

 
function toCandidate(p: any): PlaceCandidate {
  const reviews: any[] = p.reviews ?? [];
  const latest = reviews
    .map((r) => r.publishTime as string | undefined)
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    placeId: p.id,
    name: p.displayName?.text ?? "(unnamed)",
    formattedAddress: p.formattedAddress ?? null,
    phone: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    mapsUrl: p.googleMapsUri ?? null,
    businessStatus: p.businessStatus ?? null,
    hasHours: Boolean(p.regularOpeningHours),
    hasPhotos: Array.isArray(p.photos) && p.photos.length > 0,
    photoCount: Array.isArray(p.photos) ? p.photos.length : 0,
    primaryType: p.primaryType ?? null,
    latestReviewAt: latest ?? null,
    editorialSummary: p.editorialSummary?.text ?? null,
  };
}

export async function searchBusiness(
  query: string,
  fixtureKey?: string,
): Promise<PlacesResult> {
  const mode = providerMode("google-places", env.googleMapsKey);
  if (mode.live) {
    try {
      const r = await fetch(SEARCH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": env.googleMapsKey!,
          "X-Goog-FieldMask": FIELDS,
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      });
      const data: any = await r.json();
      if (!r.ok) {
        return {
          status: "unable_to_evaluate",
          mocked: false,
          source: SEARCH,
          candidates: [],
          note: `Places API error ${r.status}: ${data?.error?.message ?? "unknown"}`,
        };
      }
      const candidates = (data.places ?? []).map(toCandidate);
      return {
        status: candidates.length > 0 ? "confirmed" : "not_found",
        mocked: false,
        source: `${SEARCH} (textQuery="${query}")`,
        candidates,
        note:
          candidates.length === 0
            ? "No Google Business Profile matched this search."
            : `${candidates.length} candidate profile(s) returned.`,
      };
    } catch (e) {
      return {
        status: "unable_to_evaluate",
        mocked: false,
        source: SEARCH,
        candidates: [],
        note: `Places API request failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const fx = await fixtureSection<PlaceCandidate[]>(
    fixtureKey ?? query,
    "places",
  );
  if (!fx) {
    return {
      status: "unable_to_evaluate",
      mocked: true,
      source: "fixture",
      candidates: [],
      note: `${mode.reason}; no fixture for "${query}". Search Google Maps manually.`,
    };
  }
  return {
    status: fx.length > 0 ? "confirmed" : "not_found",
    mocked: true,
    source: `fixture:${fixtureKey ?? query}`,
    candidates: fx,
    note: `${MOCK} Google Business Profile data from fixture (${mode.reason}).`,
  };
}
