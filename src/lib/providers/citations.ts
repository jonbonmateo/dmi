/**
 * Local-citation consistency (NAP: name / address / phone).
 *
 * The manual process uses a paid aggregator (Yext/BrightLocal/Moz Local).
 * None of them offer a free API, so this provider has two modes:
 *
 *  1. fixture / manual — a human pastes the aggregator's percentage, or a
 *     fixture supplies it for a demo.
 *  2. a first-party approximation — we compare the NAP the shop publishes on
 *     its own website against the Google Business Profile, and check a handful
 *     of directory pages that are fetchable without a key. This yields a
 *     *directional* score which we clearly label as an approximation, never as
 *     the aggregator's number.
 */
import { fetchPage } from "./http";
import { parse, visibleText } from "./html";
import { fixtureSection, MOCK } from "./mock";
import { isMock } from "@/lib/runtime-mode";
import type { EvidenceStatus } from "@/lib/types";

export interface CitationSource {
  name: string;
  url: string;
  found: boolean;
  nameMatch: boolean | null;
  phoneMatch: boolean | null;
  addressMatch: boolean | null;
  note: string;
}

export interface CitationResult {
  status: EvidenceStatus;
  mocked: boolean;
  /** 0-100. Null when we could not build a defensible number. */
  scorePercent: number | null;
  approximation: boolean;
  sources: CitationSource[];
  note: string;
}

export function normalisePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function normaliseName(n: string): string {
  return n
    .toLowerCase()
    .replace(/\b(llc|inc|co|company|the|and|&)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Loose street-number + street-name comparison. */
function addressMatches(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  const num = (s: string) => s.match(/\b\d{1,6}\b/)?.[0] ?? null;
  const na = num(a);
  const nb = num(b);
  if (!na || !nb) return null;
  if (na !== nb) return false;
  const street = (s: string) =>
    s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const sa = new Set(street(a));
  const overlap = street(b).filter((w) => sa.has(w));
  return overlap.length > 0;
}

export interface CitationInputs {
  shopName: string;
  phone: string | null;
  address: string | null;
  websiteUrl: string | null;
  fixtureKey: string;
}

export async function getCitations(input: CitationInputs): Promise<CitationResult> {
  const fx = isMock()
    ? await fixtureSection<{ scorePercent: number; sources?: CitationSource[] }>(
        input.fixtureKey,
        "citations",
      )
    : null;
  if (fx) {
    return {
      status: "confirmed",
      mocked: true,
      scorePercent: fx.scorePercent,
      approximation: false,
      sources: fx.sources ?? [],
      note: `${MOCK} Citation score from fixture (stands in for the paid aggregator report).`,
    };
  }

  const targetPhone = normalisePhone(input.phone);
  const sources: CitationSource[] = [];

  // The shop's own website is the reference NAP.
  if (input.websiteUrl) {
    const res = await fetchPage(input.websiteUrl);
    if (res.ok) {
      const body = visibleText(parse(res.body));
      const phones = body.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? [];
      const phoneMatch = targetPhone
        ? phones.some((p) => normalisePhone(p) === targetPhone)
        : null;
      sources.push({
        name: "Shop website",
        url: res.finalUrl,
        found: true,
        nameMatch: normaliseName(body.slice(0, 4000)).includes(
          normaliseName(input.shopName),
        ),
        phoneMatch,
        addressMatch: input.address ? addressMatches(body, input.address) : null,
        note: phones.length
          ? `Phone numbers published on the homepage: ${[...new Set(phones)].slice(0, 3).join(", ")}`
          : "No phone number found in homepage text.",
      });
    } else {
      sources.push({
        name: "Shop website",
        url: input.websiteUrl,
        found: false,
        nameMatch: null,
        phoneMatch: null,
        addressMatch: null,
        note: `Could not read the site (${res.error ?? `HTTP ${res.status}`}).`,
      });
    }
  }

  const checked = sources.filter((s) => s.found);
  if (checked.length === 0) {
    return {
      status: "unable_to_evaluate",
      mocked: false,
      scorePercent: null,
      approximation: true,
      sources,
      note: "No citation source could be read. Run the aggregator report (BrightLocal / Yext / Moz Local) manually and paste the percentage.",
    };
  }

  const checks = checked.flatMap((s) =>
    [s.nameMatch, s.phoneMatch, s.addressMatch].filter((v) => v !== null),
  ) as boolean[];
  const pct = checks.length
    ? Math.round((checks.filter(Boolean).length / checks.length) * 100)
    : null;

  return {
    // Deliberately not "confirmed": this is our own approximation, not the
    // aggregator score the manual benchmark of 60% was calibrated against.
    status: "requires_human_review",
    mocked: false,
    scorePercent: pct,
    approximation: true,
    sources,
    note: `First-party NAP consistency approximation across ${checked.length} readable source(s): ${pct ?? "n/a"}%. This is NOT the paid aggregator's citation score — confirm with BrightLocal/Yext before scoring the 60% benchmark.`,
  };
}
