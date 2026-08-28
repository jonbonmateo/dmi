import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { getAuth, clearSessionCookies } from "@/lib/auth/session";
import { getStore } from "@/lib/storage";

export const runtime = "nodejs";

async function handlePost() {
  const auth = await getAuth();
  if (auth) await getStore().revokeSession(auth.session.id);
  // Cookies are cleared even without a valid session, so a stale or tampered
  // cookie cannot leave the browser stuck in a signed-out-but-cookied state.
  await clearSessionCookies();
  return NextResponse.json({ ok: true, next: "/login" });
}

export async function POST() {
  try {
    return await handlePost();
  } catch (e) {
    return routeErrorResponse(e);
  }
}
