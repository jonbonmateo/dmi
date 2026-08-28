/**
 * GET /api/cron — Vercel Cron entry point.
 *
 * Picks up runs that are queued, or that have been sitting in `running` or
 * `failed` long enough to be considered abandoned (a killed serverless
 * invocation, a deploy mid-run, a transient provider outage). Each run
 * resumes from its last completed step.
 */
import { NextResponse } from "next/server";
import { drainQueue } from "@/lib/pipeline";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (env.cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    }
  }
  const result = await drainQueue();
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}
