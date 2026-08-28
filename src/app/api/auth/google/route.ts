/** GET /api/auth/google — kick off the Google sign-in redirect. */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { googleConfigured, startGoogleFlow } from "@/lib/auth/google";
import { checkBurst, clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=google_not_configured", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  }
  const burst = checkBurst(`oauth:${clientIp(req) ?? "unknown"}`, 10, 60_000);
  if (!burst.allowed) {
    return NextResponse.json({ error: burst.reason }, { status: 429 });
  }

  const flow = startGoogleFlow();
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // the round trip to Google should take seconds, not hours
  };
  jar.set("dmi_oauth_state", flow.state, opts);
  jar.set("dmi_oauth_verifier", flow.verifier, opts);

  return NextResponse.redirect(flow.url);
}
