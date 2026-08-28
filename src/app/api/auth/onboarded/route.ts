import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/guard";

export const runtime = "nodejs";

/** Marks the tour as seen so it stops appearing after sign-in. */
export async function POST(req: Request) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;
  const user = guard.auth.user;
  user.onboardedAt = new Date().toISOString();
  await getStore().upsertUser(user);
  return NextResponse.json({ ok: true });
}
