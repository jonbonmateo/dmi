/**
 * POST /api/intake — the entry point Zapier calls when a discovery call is
 * booked in GoHighLevel.
 *
 * Returns immediately with the run id and report URL. The inspection itself
 * runs in the background so the webhook never times out; if the process dies
 * mid-run, /api/cron picks it back up.
 */
import { NextResponse } from "next/server";
import { IntakeSchema, intake } from "@/lib/intake";
import { runPipeline } from "@/lib/pipeline";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorised(req: Request): boolean {
  if (!env.intakeSecret) return true; // unset = open, for local development
  const header = req.headers.get("x-dmi-secret") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return header === env.intakeSecret || bearer === env.intakeSecret;
}

export async function POST(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", detail: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await intake(parsed.data);
    const reportUrl = `${env.appUrl}/dmi/${result.run.id}`;

    if (!result.duplicate) {
      // Fire and forget — the run checkpoints itself, so an interrupted
      // background task is recoverable rather than lost.
      void runPipeline(result.run.id).catch((e) =>
        log.error("background run failed", { run: result.run.id, error: e instanceof Error ? e.message : String(e) }),
      );
    }

    return NextResponse.json(
      {
        runId: result.run.id,
        prospectId: result.prospect.id,
        shopName: result.prospect.shopName,
        duplicate: result.duplicate,
        state: result.run.state,
        missingIntakeFields: result.missing,
        reportUrl,
        message: result.duplicate
          ? "A DMI already exists for this shop and discovery call; returning the existing one instead of starting a duplicate."
          : "DMI queued. The report URL is live immediately and fills in as the inspection progresses.",
      },
      { status: result.duplicate ? 200 : 202 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("intake failed", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
