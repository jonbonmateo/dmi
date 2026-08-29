/**
 * POST /api/auth/guest — a throwaway account for looking around.
 *
 * Guests get a real (short-lived) user record so their actions stay
 * attributable, and choose live or mock mode like any other account (see
 * /api/auth/mode). A guest has the same features as anyone else — they can
 * start inspections and answer review questions same as a member — with one
 * restriction: writes only work in mock mode (see the `write` option on
 * requireAuth, in guard.ts), so an anonymous session can never spend real
 * API quota or write to the real GoHighLevel/tracking sheet.
 */
import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { getStore } from "@/lib/storage";
import { newSessionRecord, writeSessionCookies } from "@/lib/auth/session";
import { checkBurst, clientIp } from "@/lib/auth/rate-limit";
import { createGuestUser, guestsAllowed } from "@/lib/auth/accounts";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

async function handlePost(req: Request) {
  if (!guestsAllowed()) {
    return NextResponse.json({ error: "Guest access is disabled on this deployment." }, { status: 403 });
  }
  const ip = clientIp(req);
  const burst = checkBurst(`guest:${ip ?? "unknown"}`, 5, 60_000);
  if (!burst.allowed) {
    return NextResponse.json({ error: burst.reason }, { status: 429, headers: { "retry-after": String(burst.retryAfter) } });
  }

  const user = await createGuestUser();
  const session = newSessionRecord({
    userId: user.id,
    isGuest: true,
    mode: null,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  await getStore().createSession(session);
  await writeSessionCookies(session);
  log.info("guest sign-in", { userId: user.id });

  return NextResponse.json({
    ok: true,
    next: "/mode",
    mode: null,
    user: { id: user.id, name: user.name, role: user.role },
    notice: "You are signed in as a guest. You can only save changes while in mock mode.",
  });
}

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (e) {
    return routeErrorResponse(e);
  }
}
