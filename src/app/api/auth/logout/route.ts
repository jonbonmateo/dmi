import { NextResponse } from "next/server";
import { getAuth, clearSessionCookies } from "@/lib/auth/session";
import { getStore } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST() {
  const auth = await getAuth();
  if (auth) await getStore().revokeSession(auth.session.id);
  // Cookies are cleared even without a valid session, so a stale or tampered
  // cookie cannot leave the browser stuck in a signed-out-but-cookied state.
  await clearSessionCookies();
  return NextResponse.json({ ok: true, next: "/login" });
}
