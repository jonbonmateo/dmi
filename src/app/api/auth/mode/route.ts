/**
 * POST /api/auth/mode — choose live or mock, once, right after signing in.
 *
 * The mode is written onto the session and can never be changed afterwards:
 * to switch, you sign out and back in. That is the whole point — a DMI's mode
 * has to be a fact about the run, not a toggle someone may have flipped
 * halfway through.
 *
 * Every role can pick either mode, guests included — a guest's only
 * restriction is that writes need mock mode (see the `write` option on
 * requireAuth, in guard.ts), not which mode they look around in. So the
 * only thing that can block "live" here is live mode itself not being
 * configured, never who's asking.
 */
import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { z } from "zod";
import { getStore } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/guard";
import { getReadiness } from "@/lib/readiness";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const Body = z.object({ mode: z.enum(["live", "mock"]) });

async function handlePost(req: Request) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;
  const { user, session } = guard.auth;

  if (session.mode) {
    return NextResponse.json(
      {
        error: `This session is already running in ${session.mode} mode. Sign out and back in to change it.`,
        mode: session.mode,
      },
      { status: 409 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose either live or mock mode." }, { status: 400 });
  }
  const mode = parsed.data.mode;

  if (mode === "live") {
    const readiness = getReadiness();
    if (!readiness.liveAvailable) {
      return NextResponse.json(
        {
          error: "Live mode is not configured yet.",
          requiredMissing: readiness.requiredMissing,
        },
        { status: 412 },
      );
    }
  }

  await getStore().updateSession(session.id, { mode });
  log.info("mode chosen", { userId: user.id, mode });

  return NextResponse.json({
    ok: true,
    mode,
    next: user.onboardedAt ? "/" : "/onboarding",
  });
}

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (e) {
    return routeErrorResponse(e);
  }
}
