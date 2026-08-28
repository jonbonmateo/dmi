/**
 * Google PageSpeed Insights (Lighthouse) — mobile + desktop performance.
 *
 * Live whenever PAGESPEED_API_KEY is set. The API is free; the key only
 * raises the rate limit. Without a key we fall back to a fixture, and if
 * there is no fixture the criterion becomes `unable_to_evaluate`.
 */
import { env, providerMode } from "@/lib/env";
import { fetchJson } from "./http";
import { fixtureSection, MOCK } from "./mock";
import type { EvidenceStatus } from "@/lib/types";

export interface StrategyScore {
  strategy: "mobile" | "desktop";
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  lcpSeconds: number | null;
  cls: number | null;
  error: string | null;
}

export interface PageSpeedResult {
  status: EvidenceStatus;
  source: string;
  mocked: boolean;
  mobile: StrategyScore | null;
  desktop: StrategyScore | null;
  note: string;
}

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

 
function extract(strategy: "mobile" | "desktop", data: any): StrategyScore {
  const cats = data?.lighthouseResult?.categories ?? {};
  const audits = data?.lighthouseResult?.audits ?? {};
  const pct = (v: unknown) =>
    typeof v === "number" ? Math.round(v * 100) : null;
  return {
    strategy,
    performance: pct(cats.performance?.score),
    accessibility: pct(cats.accessibility?.score),
    seo: pct(cats.seo?.score),
    bestPractices: pct(cats["best-practices"]?.score),
    lcpSeconds:
      typeof audits["largest-contentful-paint"]?.numericValue === "number"
        ? Math.round(audits["largest-contentful-paint"].numericValue) / 1000
        : null,
    cls:
      typeof audits["cumulative-layout-shift"]?.numericValue === "number"
        ? Number(audits["cumulative-layout-shift"].numericValue.toFixed(3))
        : null,
    error: null,
  };
}

async function runStrategy(
  url: string,
  strategy: "mobile" | "desktop",
): Promise<StrategyScore> {
  const qs = new URLSearchParams({ url, strategy });
  for (const c of ["performance", "accessibility", "seo", "best-practices"]) {
    qs.append("category", c);
  }
  if (env.pageSpeedKey) qs.set("key", env.pageSpeedKey);
  const res = await fetchJson<any>(`${API}?${qs}`, { timeoutMs: 90_000 });
  if (!res.ok) {
    return {
      strategy,
      performance: null,
      accessibility: null,
      seo: null,
      bestPractices: null,
      lcpSeconds: null,
      cls: null,
      error: res.error ?? "unknown PageSpeed error",
    };
  }
  return extract(strategy, res.data);
}

export async function getPageSpeed(url: string): Promise<PageSpeedResult> {
  const mode = providerMode("pagespeed", env.pageSpeedKey ?? "unkeyed-ok");
  if (mode.live) {
    // Sequential on purpose: PSI rate-limits parallel requests per key.
    const mobile = await runStrategy(url, "mobile");
    const desktop = await runStrategy(url, "desktop");
    const failed = [mobile, desktop].filter((s) => s.error);
    return {
      status: failed.length === 2 ? "unable_to_evaluate" : "confirmed",
      source: `${API}?url=${encodeURIComponent(url)}`,
      mocked: false,
      mobile,
      desktop,
      note:
        failed.length === 0
          ? "Lighthouse run via PageSpeed Insights API."
          : `PageSpeed partially failed: ${failed.map((f) => `${f.strategy}: ${f.error}`).join("; ")}`,
    };
  }

  const fx = await fixtureSection<{ mobile: number; desktop: number }>(
    url,
    "pagespeed",
  );
  if (!fx) {
    return {
      status: "unable_to_evaluate",
      source: API,
      mocked: true,
      mobile: null,
      desktop: null,
      note: `${mode.reason}, and no fixture exists for this domain. Run PageSpeed Insights manually.`,
    };
  }
  const stub = (s: "mobile" | "desktop", p: number): StrategyScore => ({
    strategy: s,
    performance: p,
    accessibility: null,
    seo: null,
    bestPractices: null,
    lcpSeconds: null,
    cls: null,
    error: null,
  });
  return {
    status: "confirmed",
    source: `fixture:${url}`,
    mocked: true,
    mobile: stub("mobile", fx.mobile),
    desktop: stub("desktop", fx.desktop),
    note: `${MOCK} PageSpeed scores loaded from fixture (${mode.reason}).`,
  };
}
