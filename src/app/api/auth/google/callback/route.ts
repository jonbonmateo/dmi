/**
 * GET /api/auth/google/callback — Google redirects the browser back here.
 *
 * The `state` cookie is compared against the `state` query parameter before
 * anything else happens, so a forged callback cannot sign anyone in.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/storage";
import { env } from "@/lib/env";
import { domainAllowed, exchangeGoogleCode, googleConfigured } from "@/lib/auth/google";
import { findOrCreateGoogleUser, touchLogin } from "@/lib/auth/accounts";
import { newSessionRecord, writeSessionCookies } from "@/lib/auth/session";
import { clientIp, recordAuthAttempt } from "@/lib/auth/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

function back(path: string) {
  return NextResponse.redirect(new URL(path, env.appUrl));
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: Request) {
  if (!googleConfigured()) return back("/login?error=google_not_configured");

  const url = new URL(req.url);
  const jar = await cookies();
  const clear = () => {
    jar.delete("dmi_oauth_state");
    jar.delete("dmi_oauth_verifier");
  };

  if (url.searchParams.get("error")) {
    clear();
    return back("/login?error=google_cancelled");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = jar.get("dmi_oauth_state")?.value;
  const verifier = jar.get("dmi_oauth_verifier")?.value;

  if (!code || !state || !expectedState || !verifier || !sameString(state, expectedState)) {
    clear();
    log.warn("google callback rejected", { hasCode: Boolean(code), stateMatched: state === expectedState });
    return back("/login?error=google_state");
  }
  clear();

  const result = await exchangeGoogleCode(code, verifier);
  if (!result.ok) {
    log.warn("google exchange failed", { error: result.error });
    return back("/login?error=google_exchange");
  }
  if (!domainAllowed(result.profile.email)) {
    return back("/login?error=google_domain");
  }

  const user = await findOrCreateGoogleUser(result.profile);
  if (user.disabledAt) return back("/login?error=account_disabled");

  const ip = clientIp(req);
  const session = newSessionRecord({
    userId: user.id,
    isGuest: false,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  await getStore().createSession(session);
  await writeSessionCookies(session);
  await recordAuthAttempt({ key: result.profile.email, ip, success: true, reason: "google" });
  await touchLogin(user);
  log.info("sign-in", { userId: user.id, provider: "google" });

  return back("/mode");
}
