import { randomUUID } from "node:crypto";
import type {
  BusinessVerification,
  CategoryKey,
  DmiRun,
  Prospect,
  ReviewItem,
  RunError,
  StepName,
} from "@/lib/types";
import type { FetchResult } from "@/lib/providers/http";
import { fetchPage } from "@/lib/providers/http";
import { fixtureSection } from "@/lib/providers/mock";
import { env } from "@/lib/env";
import type { PlaceCandidate } from "@/lib/providers/places";
import { log } from "@/lib/logger";

/**
 * Everything the steps share. Page fetches are memoised so the four category
 * steps can each ask for the homepage without hammering the shop's server.
 */
export class Ctx {
  readonly run: DmiRun;
  readonly prospect: Prospect;
  readonly reviewItems: ReviewItem[] = [];

  /** Resolved, reachable site URL. Null when the shop has no usable website. */
  siteUrl: string | null = null;
  verification: BusinessVerification | null = null;
  gbp: PlaceCandidate | null = null;
  competitors: PlaceCandidate[] = [];
  /** Fixture key: the site domain, or a slug of the shop name when no site. */
  fixtureKey: string;

  private pageCache = new Map<string, Promise<FetchResult>>();

  constructor(run: DmiRun, prospect: Prospect) {
    this.run = run;
    this.prospect = prospect;
    this.fixtureKey = slug(prospect.shopName);
  }

  page(url: string): Promise<FetchResult> {
    const key = url.replace(/\/$/, "");
    if (!this.pageCache.has(key)) {
      log.debug("fetch", { url: key, run: this.run.id });
      this.pageCache.set(key, env.forceMock ? fixturePage(key) : fetchPage(key));
    }
    return this.pageCache.get(key)!;
  }

  /** Number of distinct pages fetched — shown on the report for traceability. */
  get pagesFetched(): number {
    return this.pageCache.size;
  }

  addError(step: StepName | "intake" | "publish", message: string, opts: { detail?: string; fatal?: boolean } = {}) {
    const err: RunError = {
      at: new Date().toISOString(),
      step,
      message,
      detail: opts.detail,
      fatal: opts.fatal ?? false,
    };
    this.run.errors.push(err);
    log.warn("run error", { run: this.run.id, ...err });
  }

  review(args: {
    category: CategoryKey | "run";
    findingId?: string | null;
    reason: string;
    question: string;
    instruction: string;
  }) {
    // Deterministic id keyed on run+finding so re-runs never duplicate tasks.
    const id = `${this.run.id}:${args.findingId ?? args.category}:${hash(args.question)}`;
    if (this.reviewItems.some((r) => r.id === id)) return;
    this.reviewItems.push({
      id,
      runId: this.run.id,
      findingId: args.findingId ?? null,
      category: args.category,
      reason: args.reason,
      question: args.question,
      instruction: args.instruction,
      status: "open",
      resolution: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    });
  }
}

/**
 * In DMI_FORCE_MOCK mode the crawler is served from a fixture's `pages` map
 * instead of the network, so the whole pipeline can be demonstrated and
 * regression-tested with no internet connection and no live shop involved.
 */
async function fixturePage(url: string): Promise<FetchResult> {
  const pages = await fixtureSection<Record<string, string>>(url, "pages");
  const path = (() => {
    try {
      return new URL(url).pathname.replace(/\/$/, "") || "/";
    } catch {
      return "/";
    }
  })();
  const html = pages?.[path] ?? pages?.[`${path}/`] ?? null;
  const checkedAt = new Date().toISOString();
  if (html === null) {
    return {
      ok: false, url, finalUrl: url, status: 404, headers: {}, body: "",
      elapsedMs: 1, blocked: false, error: "no fixture page", checkedAt,
      evidenceStatus: "not_found",
    };
  }
  return {
    ok: true, url, finalUrl: url, status: 200,
    headers: { "content-type": "text/html", server: "fixture" },
    body: html, elapsedMs: 1, blocked: false, error: null, checkedAt,
    evidenceStatus: "confirmed",
  };
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
