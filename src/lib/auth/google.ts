/**
 * Google Sign-In via OAuth 2.0 authorization code + PKCE.
 *
 * Implemented directly against Google's endpoints rather than through a
 * library, so it works whether or not Supabase is configured and there is no
 * hidden redirect behaviour to audit.
 */
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/providers/http";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}

export function redirectUri(): string {
  return `${env.appUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

export interface GoogleFlowStart {
  url: string;
  /** Opaque value echoed back by Google; guards against CSRF on the callback. */
  state: string;
  /** PKCE verifier, stored server-side in a short-lived cookie. */
  verifier: string;
}

export function startGoogleFlow(): GoogleFlowStart {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const params = new URLSearchParams({
    client_id: env.googleClientId!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // Ask for an account each time rather than silently reusing whichever
    // Google session the browser happens to hold.
    prompt: "select_account",
  });
  return { url: `${AUTH_URL}?${params}`, state, verifier };
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

 
export async function exchangeGoogleCode(
  code: string,
  verifier: string,
): Promise<{ ok: true; profile: GoogleProfile } | { ok: false; error: string }> {
  let tokenBody: any;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId!,
        client_secret: env.googleClientSecret!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    tokenBody = await res.json();
    if (!res.ok) {
      return { ok: false, error: `Google token exchange failed: ${tokenBody?.error_description ?? res.status}` };
    }
  } catch (e) {
    return { ok: false, error: `Google token exchange failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  const info = await fetchJson<any>(USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!info.ok || !info.data?.email) {
    return { ok: false, error: `Could not read the Google profile: ${info.error ?? "no email returned"}` };
  }

  // An unverified Google address proves nothing about who controls the inbox.
  if (info.data.email_verified === false) {
    return { ok: false, error: "That Google account's email address is not verified." };
  }

  return {
    ok: true,
    profile: {
      sub: info.data.sub,
      email: String(info.data.email).toLowerCase(),
      emailVerified: info.data.email_verified !== false,
      name: info.data.name ?? null,
      picture: info.data.picture ?? null,
    },
  };
}

/**
 * Optional allow-list. With `AUTH_ALLOWED_DOMAINS=shopmarketingpros.com` only
 * addresses at those domains can sign in with Google — the difference between
 * "our team" and "anyone on the internet with a Gmail account".
 */
export function domainAllowed(email: string): boolean {
  const allowed = env.allowedEmailDomains;
  if (allowed.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return allowed.includes(domain);
}
