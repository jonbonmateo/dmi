/**
 * Route guards. Every mutating API handler runs through `requireAuth` so the
 * session, CSRF and role checks cannot be forgotten one endpoint at a time.
 */
import { NextResponse } from "next/server";
import { getAuth, csrfOk } from "./session";
import { checkBurst, clientIp } from "./rate-limit";
import type { AuthContext, UserRole } from "./types";

export interface GuardOptions {
  /** Roles allowed through. Default: any signed-in user. */
  roles?: UserRole[];
  /**
   * A mutating action, open to every role including guests — but only in
   * mock mode. Feature parity between live and mock/guest use is the point
   * (the only difference should be real data vs. fixtures), except that an
   * anonymous guest session must never be able to spend real API quota or
   * write to the real GoHighLevel/tracking sheet just by finding the sign-in
   * page. A guest who chooses live mode can still look around live data —
   * they just can't write while in it, same as they can't in mock.
   */
  write?: boolean;
  /** Skip CSRF (only for GETs, which never change state). */
  readOnly?: boolean;
  /** Requests per minute per session. */
  burstPerMinute?: number;
}

export type GuardResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; response: NextResponse };

export async function requireAuth(req: Request, opts: GuardOptions = {}): Promise<GuardResult> {
  const auth = await getAuth();
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const burst = checkBurst(`api:${auth.session.id}`, opts.burstPerMinute ?? 120, 60_000);
  if (!burst.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: burst.reason },
        { status: 429, headers: { "retry-after": String(burst.retryAfter) } },
      ),
    };
  }

  if (!opts.readOnly && !csrfOk(req, auth.session)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing or invalid CSRF token. Reload the page and try again." },
        { status: 403 },
      ),
    };
  }

  if (opts.roles && !opts.roles.includes(auth.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `This action needs one of: ${opts.roles.join(", ")}. You are signed in as ${auth.user.role}.` },
        { status: 403 },
      ),
    };
  }

  if (opts.write && auth.user.role === "guest" && auth.mode !== "mock") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Guests can only make changes in mock mode. Choose mock mode, or sign in with an account to write live data." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, auth };
}

export { clientIp };
