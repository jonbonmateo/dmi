/**
 * POST /api/auth/reset — complete a password reset with a token from the email.
 *
 * On success every existing session for the account is revoked, including
 * whatever session (if any) made this request, and a fresh session is not
 * automatically created — the user signs in again with the new password,
 * which is the same "prove you actually have the new credential" step a
 * normal sign-in already asks for.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/storage";
import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import { consumePasswordReset } from "@/lib/auth/reset";
import { checkBurst, clientIp } from "@/lib/auth/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const Body = z.object({
  token: z.string().min(10).max(500),
  password: z.string().max(200),
});

const REASON_MESSAGE: Record<string, string> = {
  not_found: "That reset link is invalid. Request a new one.",
  used: "That reset link has already been used. Request a new one.",
  expired: "That reset link has expired. Request a new one.",
};

export async function POST(req: Request) {
  const ip = clientIp(req);
  // Tokens are 32 random bytes — guessing is infeasible — but this still
  // caps how fast someone can hammer the endpoint with garbage tokens.
  const burst = checkBurst(`reset:${ip ?? "unknown"}`, 10, 60_000);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: burst.reason },
      { status: 429, headers: { "retry-after": String(burst.retryAfter) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing reset token or password." }, { status: 400 });
  }

  const outcome = await consumePasswordReset(parsed.data.token);
  if (!outcome.ok) {
    return NextResponse.json({ error: REASON_MESSAGE[outcome.reason] }, { status: 400 });
  }

  const store = getStore();
  const user = await store.getUser(outcome.userId);
  if (!user || user.disabledAt) {
    return NextResponse.json({ error: "That account is no longer available." }, { status: 400 });
  }

  const strength = checkPasswordStrength(parsed.data.password, user.email);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.problems.join(" "), problems: strength.problems }, { status: 400 });
  }

  user.passwordHash = await hashPassword(parsed.data.password);
  await store.upsertUser(user);
  // A password reset is exactly the moment to assume every existing session
  // may be compromised, so all of them go — including this browser's, if it
  // happened to be signed in.
  await store.revokeUserSessions(user.id);

  log.info("password reset completed", { userId: user.id });
  return NextResponse.json({ ok: true, next: "/login" });
}
