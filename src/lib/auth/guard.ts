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

  return { ok: true, auth };
}

/** Guests may read everything but may not write. */
export const WRITE_ROLES: UserRole[] = ["admin", "member"];

export { clientIp };
