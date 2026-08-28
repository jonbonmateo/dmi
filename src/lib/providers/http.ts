/**
 * Polite HTTP fetching with explicit "we were blocked" reporting.
 *
 * We never pretend a blocked page was a passing page. Every failure mode maps
 * to an EvidenceStatus the report can show ("unable_to_evaluate" etc.).
 */
import type { EvidenceStatus } from "@/lib/types";

const UA =
  "Mozilla/5.0 (compatible; ShopMarketingPros-DMI/1.0; +https://shopmarketingpros.com/dmi-bot)";

export interface FetchResult {
  ok: boolean;
  url: string;
  finalUrl: string;
  status: number | null;
  headers: Record<string, string>;
  body: string;
  /** Milliseconds to first byte + body. */
  elapsedMs: number;
  blocked: boolean;
  error: string | null;
  evidenceStatus: EvidenceStatus;
  checkedAt: string;
}

const BLOCK_MARKERS = [
  "cf-chl-",
  "just a moment",
  "attention required! | cloudflare",
  "access denied",
  "request unsuccessful. incapsula",
  "pardon our interruption",
  "enable javascript and cookies to continue",
];

export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; method?: "GET" | "HEAD" } = {},
): Promise<FetchResult> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  const base: Omit<FetchResult, "ok" | "evidenceStatus"> = {
    url,
    finalUrl: url,
    status: null,
    headers: {},
    body: "",
    elapsedMs: 0,
    blocked: false,
    error: null,
    checkedAt,
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const body = opts.method === "HEAD" ? "" : await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    const lower = body.slice(0, 4000).toLowerCase();
    const blocked =
      res.status === 403 ||
      res.status === 429 ||
      BLOCK_MARKERS.some((m) => lower.includes(m));

    return {
      ...base,
      finalUrl: res.url || url,
      status: res.status,
      headers,
      body,
      elapsedMs: Date.now() - started,
      blocked,
      ok: res.ok && !blocked,
      evidenceStatus: blocked
        ? "unable_to_evaluate"
        : res.ok
          ? "confirmed"
          : "not_found",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ...base,
      elapsedMs: Date.now() - started,
      error: message,
      ok: false,
      evidenceStatus:
        message.includes("abort") || message.includes("timeout")
          ? "unable_to_evaluate"
          : "not_found",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; data: T | null; error: string | null; status: number | null }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { accept: "application/json", "user-agent": UA, ...opts.headers },
    });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = JSON.parse(text) as T;
    } catch {
      /* non-JSON body is reported below */
    }
    return {
      ok: res.ok && data !== null,
      data,
      status: res.status,
      error: res.ok ? (data ? null : "non-JSON response") : `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      ok: false,
      data: null,
      status: null,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Normalises user-typed website values ("shop.com", "www.shop.com/"). */
export function normaliseUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes(".")) return null;
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
