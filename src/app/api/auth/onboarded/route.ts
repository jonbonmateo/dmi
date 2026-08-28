import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { getStore } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/guard";

export const runtime = "nodejs";

/** Marks the tour as seen so it stops appearing after sign-in. */
async function handlePost(req: Request) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;
  const user = guard.auth.user;
  user.onboardedAt = new Date().toISOString();
  await getStore().upsertUser(user);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (e) {
    return routeErrorResponse(e);
  }
}
