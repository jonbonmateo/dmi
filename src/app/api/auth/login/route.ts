/**
 * POST /api/auth/login — email + password.
 *
 * Rate limited on the email and the IP independently, with a constant-ish
 * response time and an identical error message whether the address is unknown
 * or the password is wrong, so the endpoint cannot be used to enumerate who
 * has an account.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/storage";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { newSessionRecord, writeSessionCookies } from "@/lib/auth/session";
import { checkBurst, checkLoginRate, clientIp, recordAuthAttempt } from "@/lib/auth/rate-limit";
import { normaliseEmail, touchLogin } from "@/lib/auth/accounts";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
});

const GENERIC = "That email address and password do not match an account.";

/** Cost-equivalent work for a missing account, so timing does not leak. */
const DECOY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email address and password." }, { status: 400 });
  }
  const email = normaliseEmail(parsed.data.email);

  // Layer 1: cheap per-instance burst cap on the IP.
  const burst = checkBurst(`login:${ip ?? "unknown"}`, 10, 60_000);
  if (!burst.allowed) {
    return NextResponse.json({ error: burst.reason }, { status: 429, headers: { "retry-after": String(burst.retryAfter) } });
  }

  // Layer 2: persisted lockout on the email AND on the IP.
  for (const key of [email, `ip:${ip ?? "unknown"}`]) {
    const verdict = await checkLoginRate(key);
    if (!verdict.allowed) {
      await recordAuthAttempt({ key, ip, success: false, reason: "rate_limited" });
      return NextResponse.json(
        { error: verdict.reason },
        { status: 429, headers: { "retry-after": String(verdict.retryAfter) } },
      );
    }
  }

  const store = getStore();
  const user = await store.findUserByEmail(email);

  const fail = async (reason: string) => {
    await recordAuthAttempt({ key: email, ip, success: false, reason });
    await recordAuthAttempt({ key: `ip:${ip ?? "unknown"}`, ip, success: false, reason });
    log.warn("failed sign-in", { email, ip, reason });
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  };

  if (!user || !user.passwordHash) {
    // Burn the same CPU we would have burned on a real verification.
    await verifyPassword(parsed.data.password, DECOY_HASH);
    return fail(user ? "no_password_credential" : "unknown_email");
  }
  if (user.disabledAt) {
    await verifyPassword(parsed.data.password, DECOY_HASH);
    return fail("account_disabled");
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return fail("bad_password");
  }

  const session = newSessionRecord({
    userId: user.id,
    isGuest: false,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  await store.createSession(session);
  await writeSessionCookies(session);
  await recordAuthAttempt({ key: email, ip, success: true, reason: null });
  await touchLogin(user);
  log.info("sign-in", { userId: user.id, provider: "password" });

  return NextResponse.json({
    ok: true,
    // The mode is not chosen yet — the client is sent to /mode next.
    next: "/mode",
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

/** Exported for the signup route so both paths hash identically. */
export { hashPassword };
