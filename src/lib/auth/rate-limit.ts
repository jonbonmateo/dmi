/**
 * Rate limiting.
 *
 * Two layers, because they defend against different things:
 *
 *  1. `checkLoginRate` — persisted, per-identifier, with escalating lockout.
 *     Survives a restart and is shared across serverless instances because it
 *     lives in the store. This is the one that stops credential stuffing.
 *  2. `checkBurst` — an in-memory token bucket per instance. Cheap, catches
 *     hammering before it ever reaches the database.
 *
 * Both are counted against the *email* and the *IP* separately, so one
 * attacker cannot lock every user out by guessing at their addresses, and one
 * user's own mistakes cannot be hidden behind a rotating proxy.
 */
import { getStore } from "@/lib/storage";
import { newId } from "@/lib/pipeline/context";
import type { AuthAttempt } from "./types";

export interface RateVerdict {
  allowed: boolean;
  /** Seconds the caller must wait. 0 when allowed. */
  retryAfter: number;
  remaining: number;
  reason: string | null;
}

/* ------------------------------------------------- 1. persisted login limit */

const WINDOW_MS = 15 * 60_000;
/** Failures within the window before the identifier is locked. */
const MAX_FAILURES = 5;

/** Lockout grows with repeated failure so guessing gets exponentially slower. */
function lockoutMs(failures: number): number {
  if (failures < MAX_FAILURES) return 0;
  const over = failures - MAX_FAILURES;
  return Math.min(60_000 * 2 ** over, 30 * 60_000); // 1min → 30min ceiling
}

export async function checkLoginRate(key: string): Promise<RateVerdict> {
  const store = getStore();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const attempts = await store.recentAuthAttempts(key.toLowerCase(), since);

  // A success inside the window clears the streak.
  const lastSuccess = attempts.filter((a) => a.success).sort((a, b) => b.at.localeCompare(a.at))[0];
  const failures = attempts.filter(
    (a) => !a.success && (!lastSuccess || a.at > lastSuccess.at),
  );

  const lock = lockoutMs(failures.length);
  if (lock === 0) {
    return { allowed: true, retryAfter: 0, remaining: MAX_FAILURES - failures.length, reason: null };
  }
  const newest = failures.map((f) => Date.parse(f.at)).sort((a, b) => b - a)[0] ?? 0;
  const waitMs = newest + lock - Date.now();
  if (waitMs <= 0) {
    return { allowed: true, retryAfter: 0, remaining: 1, reason: null };
  }
  return {
    allowed: false,
    retryAfter: Math.ceil(waitMs / 1000),
    remaining: 0,
    reason: `Too many failed sign-in attempts. Try again in ${Math.ceil(waitMs / 60_000)} minute(s).`,
  };
}

export async function recordAuthAttempt(args: {
  key: string;
  ip: string | null;
  success: boolean;
  reason?: string | null;
}): Promise<void> {
  const attempt: AuthAttempt = {
    id: newId("att"),
    key: args.key.toLowerCase(),
    ip: args.ip,
    success: args.success,
    reason: args.reason ?? null,
    at: new Date().toISOString(),
  };
  await getStore().addAuthAttempt(attempt);
}

/* ---------------------------------------------------- 2. in-memory burst cap */

interface Bucket {
  tokens: number;
  updatedAt: number;
}
const buckets = new Map<string, Bucket>();

/** Token bucket: `limit` requests per `windowMs`, refilling continuously. */
export function checkBurst(key: string, limit: number, windowMs: number): RateVerdict {
  const now = Date.now();
  const rate = limit / windowMs;
  const b = buckets.get(key) ?? { tokens: limit, updatedAt: now };
  b.tokens = Math.min(limit, b.tokens + (now - b.updatedAt) * rate);
  b.updatedAt = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    const waitMs = (1 - b.tokens) / rate;
    return {
      allowed: false,
      retryAfter: Math.ceil(waitMs / 1000),
      remaining: 0,
      reason: "Too many requests. Slow down.",
    };
  }
  b.tokens -= 1;
  buckets.set(key, b);

  // Opportunistic sweep so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.updatedAt > windowMs * 4) buckets.delete(k);
    }
  }
  return { allowed: true, retryAfter: 0, remaining: Math.floor(b.tokens), reason: null };
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(req: Request): string | null {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? null;
}

/** For test isolation. */
export function resetBuckets(): void {
  buckets.clear();
}
