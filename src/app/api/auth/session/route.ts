import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { getAuth, publicUser } from "@/lib/auth/session";
import { getReadiness } from "@/lib/readiness";

export const runtime = "nodejs";

/** Who am I, and what mode am I in? Used by the client shell. */
async function handleGet() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ signedIn: false }, { status: 200 });
  const readiness = getReadiness();
  return NextResponse.json({
    signedIn: true,
    user: publicUser(auth.user),
    mode: auth.mode,
    liveAvailable: readiness.liveAvailable,
    liveCoveragePercent: readiness.liveCoveragePercent,
  });
}

export async function GET() {
  try {
    return await handleGet();
  } catch (e) {
    return routeErrorResponse(e);
  }
}
