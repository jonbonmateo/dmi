/**
 * POST /api/auth/forgot — request a password-reset link.
 *
 * Always answers with the same generic success message, whether or not the
 * address has an account, so the endpoint cannot be used to enumerate users.
 * The actual work only happens when the address does resolve to a
 * password-based account.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/storage";
import { env } from "@/lib/env";
import { normaliseEmail } from "@/lib/auth/accounts";
import { createPasswordReset } from "@/lib/auth/reset";
import { sendPasswordResetEmail } from "@/lib/auth/email";
import { checkBurst, clientIp } from "@/lib/auth/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().min(3).max(254) });

const GENERIC =
  "If that email address has an account, a reset link is on its way. It may take a minute to arrive.";

export async function POST(req: Request) {
  const ip = clientIp(req);
  // Same per-IP burst cap as login: this endpoint can send mail, so it must
  // not be hammerable into a spam cannon against arbitrary addresses.
  const burst = checkBurst(`forgot:${ip ?? "unknown"}`, 5, 60_000);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: burst.reason },
      { status: 429, headers: { "retry-after": String(burst.retryAfter) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
  }
  const email = normaliseEmail(parsed.data.email);

  const store = getStore();
  const user = await store.findUserByEmail(email);

  // Nothing to reset for a Google-only or guest account — but say the same
  // generic thing regardless, so the response shape never reveals which case
  // this was.
  if (!user || user.provider !== "password" || user.disabledAt) {
    log.info("password reset requested for non-resettable address", { email, exists: Boolean(user) });
    return NextResponse.json({ ok: true, message: GENERIC });
  }

  const { token } = await createPasswordReset({ userId: user.id, ip });
  const resetUrl = `${env.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  const result = await sendPasswordResetEmail({ to: email, resetUrl });
  log.info("password reset issued", { userId: user.id, sent: result.sent });

  return NextResponse.json({
    ok: true,
    message: GENERIC,
    // Only ever populated when no mail provider is configured, and never in
    // production — a convenience for local development and demos.
    devLink: result.devLink,
  });
}
