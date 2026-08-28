/**
 * Session cookies.
 *
 * The cookie carries only an opaque session id plus an HMAC over it. Every
 * other fact about the session — user, mode, expiry, revocation — is read from
 * the store on each request, so signing a user out or revoking a session takes
 * effect immediately rather than whenever a self-contained token happens to
 * expire.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { getStore } from "@/lib/storage";
import type { AuthContext, RunMode, Session, User } from "./types";

export const SESSION_COOKIE = "dmi_session";
export const CSRF_COOKIE = "dmi_csrf";
export const CSRF_HEADER = "x-dmi-csrf";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const GUEST_TTL_MS = 2 * 60 * 60 * 1000; //  2 hours

function secret(): string {
  const s = env.authSecret;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    // Refusing to boot beats silently signing cookies with a known key.
    throw new Error(
      "AUTH_SECRET is required in production. Generate one with: openssl rand -base64 48",
    );
  }
  return "dev-only-insecure-auth-secret-do-not-use-in-production";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function serialiseToken(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

/** Returns the session id only if the signature verifies. */
export function parseToken(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const id = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expected = sign(id);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

export function newSessionRecord(args: {
  userId: string;
  isGuest: boolean;
  mode?: RunMode | null;
  ip: string | null;
  userAgent: string | null;
}): Session {
  const now = Date.now();
  return {
    id: randomBytes(24).toString("base64url"),
    userId: args.userId,
    mode: args.mode ?? null,
    csrfSecret: randomBytes(24).toString("base64url"),
    ip: args.ip,
    userAgent: args.userAgent?.slice(0, 300) ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (args.isGuest ? GUEST_TTL_MS : SESSION_TTL_MS)).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    revokedAt: null,
  };
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    // Lax still sends the cookie on a top-level GET navigation, which is what
    // the Google OAuth redirect back to /api/auth/google/callback needs.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

export async function writeSessionCookies(session: Session): Promise<void> {
  const jar = await cookies();
  const expires = new Date(session.expiresAt);
  jar.set(SESSION_COOKIE, serialiseToken(session.id), cookieOptions(expires));
  // Readable by JS on purpose: this is the double-submit half of CSRF
  // protection. Knowing it is useless without also holding the httpOnly
  // session cookie, which a cross-site attacker cannot read.
  jar.set(CSRF_COOKIE, session.csrfSecret, { ...cookieOptions(expires), httpOnly: false });
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  const past = new Date(0);
  jar.set(SESSION_COOKIE, "", cookieOptions(past));
  jar.set(CSRF_COOKIE, "", { ...cookieOptions(past), httpOnly: false });
}

/** Reads and validates the current session. Null when signed out or expired. */
export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const id = parseToken(jar.get(SESSION_COOKIE)?.value);
  if (!id) return null;

  const store = getStore();
  const session = await store.getSession(id);
  if (!session || session.revokedAt) return null;
  if (Date.parse(session.expiresAt) < Date.now()) return null;

  const user = await store.getUser(session.userId);
  if (!user || user.disabledAt) return null;

  return { user, session, mode: session.mode };
}

/** Verifies the double-submit CSRF token on a state-changing request. */
export function csrfOk(req: Request, session: Session): boolean {
  const header = req.headers.get(CSRF_HEADER);
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(session.csrfSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    provider: u.provider,
    avatarUrl: u.avatarUrl,
    onboardedAt: u.onboardedAt,
  };
}
