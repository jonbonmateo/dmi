/**
 * Turns an uncaught error in a route handler into a JSON response instead of
 * Next.js's bare, bodyless 500 — which is what `apiPost`/`apiPatch` on the
 * client can only report as "Request failed (HTTP 500)".
 *
 * A ConfigurationError's message is written for exactly this screen and is
 * shown verbatim. Anything else is logged in full server-side and reduced to
 * a generic message, so an internal detail never reaches the browser.
 */
import { NextResponse } from "next/server";
import { ConfigurationError } from "@/lib/errors";
import { log } from "@/lib/logger";

export function routeErrorResponse(e: unknown): NextResponse {
  if (e instanceof ConfigurationError) {
    log.error("configuration error", { message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  log.error("unhandled route error", {
    error: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  });
  return NextResponse.json(
    { error: "Something went wrong on the server. Check the deployment logs for details." },
    { status: 500 },
  );
}

/**
 * Runs a non-critical side effect (recording a login attempt, bumping
 * last-login-at) without letting its failure fail the request that already
 * succeeded at the thing that actually matters.
 *
 * This exists because of a real incident: a signup created the user and the
 * session — the two things a signed-in cookie depends on — and then an
 * unrelated bookkeeping insert threw, which crashed the whole response with
 * a 500. The account and session were fine; the person just saw an error and
 * assumed signup had failed. Bookkeeping must never be able to do that again.
 */
export async function safeSideEffect(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    log.error(`non-critical step failed: ${label}`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
