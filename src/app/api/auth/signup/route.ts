import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/storage";
import { checkPasswordStrength } from "@/lib/auth/password";
import { newSessionRecord, writeSessionCookies } from "@/lib/auth/session";
import { checkBurst, clientIp, recordAuthAttempt } from "@/lib/auth/rate-limit";
import { createPasswordUser, normaliseEmail, signupsAllowed, touchLogin, validEmail } from "@/lib/auth/accounts";
import { domainAllowed } from "@/lib/auth/google";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().max(254),
  password: z.string().max(200),
  name: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  if (!signupsAllowed()) {
    return NextResponse.json(
      { error: "Sign-up is closed on this deployment. Ask an admin to create your account." },
      { status: 403 },
    );
  }
  const ip = clientIp(req);
  const burst = checkBurst(`signup:${ip ?? "unknown"}`, 5, 60_000);
  if (!burst.allowed) {
    return NextResponse.json({ error: burst.reason }, { status: 429, headers: { "retry-after": String(burst.retryAfter) } });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an email address and a password." }, { status: 400 });
  }
  const email = normaliseEmail(parsed.data.email);
  if (!validEmail(email)) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }
  if (!domainAllowed(email)) {
    return NextResponse.json(
      { error: "That email domain is not allowed to sign up on this deployment." },
      { status: 403 },
    );
  }
  const strength = checkPasswordStrength(parsed.data.password, email);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.problems.join(" "), problems: strength.problems }, { status: 400 });
  }

  const store = getStore();
  if (await store.findUserByEmail(email)) {
    // Existence is unavoidable here — you cannot register a taken address —
    // but the message stays neutral about *why* the account exists.
    return NextResponse.json(
      { error: "An account already exists for that address. Try signing in instead." },
      { status: 409 },
    );
  }

  const user = await createPasswordUser({ email, password: parsed.data.password, name: parsed.data.name });
  const session = newSessionRecord({
    userId: user.id,
    isGuest: false,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  await store.createSession(session);
  await writeSessionCookies(session);
  await recordAuthAttempt({ key: email, ip, success: true, reason: "signup" });
  await touchLogin(user);
  log.info("signup", { userId: user.id, role: user.role });

  return NextResponse.json({
    ok: true,
    next: "/mode",
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
