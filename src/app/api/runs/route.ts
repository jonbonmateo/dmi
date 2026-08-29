import { NextResponse } from "next/server";
import { z } from "zod";
import { routeErrorResponse } from "@/lib/api-wrap";
import { getStore } from "@/lib/storage";
import { requireAuth, WRITE_ROLES } from "@/lib/auth/guard";
import { intake } from "@/lib/intake";
import { runPipeline } from "@/lib/pipeline";
import { withMode } from "@/lib/runtime-mode";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handleGet(req: Request) {
  const guard = await requireAuth(req, { readOnly: true });
  if (!guard.ok) return guard.response;

  const store = getStore();
  const runs = await store.listRuns(100);
  const prospects = await Promise.all(runs.map((r) => store.getProspect(r.prospectId)));
  const open = await store.listReviewItems({ status: "open" });
  const openByRun = new Map<string, number>();
  for (const i of open) openByRun.set(i.runId, (openByRun.get(i.runId) ?? 0) + 1);

  return NextResponse.json({
    driver: store.driver,
    sessionMode: guard.auth.mode,
    runs: runs.map((r, i) => ({
      id: r.id,
      shopName: prospects[i]?.shopName ?? "(unknown)",
      websiteUrl: r.verification?.websiteResolvedUrl ?? prospects[i]?.websiteUrl ?? null,
      state: r.state,
      mode: r.mode,
      totalScore: r.totalScore,
      potentialTotalScore: r.potentialTotalScore,
      classification: r.classification,
      inspectionDate: r.inspectionDate,
      discoveryCallAt: prospects[i]?.discoveryCallAt ?? null,
      reportUrl: r.reportUrl,
      openReviews: openByRun.get(r.id) ?? 0,
      errors: r.errors.length,
    })),
  });
}

const StartBody = z.object({
  shopName: z.string().trim().min(1, "Enter a shop name.").max(200),
  website: z.string().trim().max(500).optional(),
});

/**
 * POST /api/runs — start a new inspection from the dashboard's "Inspect"
 * button, as a signed-in human rather than the Zapier webhook.
 *
 * This is a completely separate entry point from /api/intake on purpose:
 * that one is machine-to-machine, authenticated by a shared secret, and
 * public in middleware. This one is a normal authenticated write action
 * (session + CSRF + role), so it belongs next to the other mutating routes,
 * not on the public webhook.
 */
async function handlePost(req: Request) {
  // Same cost profile as resuming a run, so the same tighter cap applies —
  // and guests stay read-only everywhere else in the app, this included.
  const guard = await requireAuth(req, { roles: WRITE_ROLES, burstPerMinute: 10 });
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  if (!auth.mode) {
    return NextResponse.json({ error: "Choose live or mock mode before running an inspection." }, { status: 409 });
  }

  const parsed = StartBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  // The session's chosen mode has to be threaded through explicitly here:
  // intake() stamps whatever currentMode() resolves to at creation time, and
  // outside an explicit withMode() scope that defaults to "live". Without
  // this, a mock-mode session clicking "Inspect" would silently kick off a
  // real, live inspection instead of a fixture-backed one.
  const result = await withMode(auth.mode, () =>
    intake({ shopName: parsed.data.shopName, website: parsed.data.website }),
  );

  if (!result.duplicate) {
    void runPipeline(result.run.id).catch((e) =>
      log.error("dashboard-triggered run failed", {
        run: result.run.id,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  return NextResponse.json(
    {
      runId: result.run.id,
      shopName: result.prospect.shopName,
      duplicate: result.duplicate,
      state: result.run.state,
      mode: result.run.mode,
      missingIntakeFields: result.missing,
      reportUrl: `${env.appUrl}/dmi/${result.run.id}`,
    },
    { status: result.duplicate ? 200 : 202 },
  );
}

export async function GET(req: Request) {
  try {
    return await handleGet(req);
  } catch (e) {
    return routeErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (e) {
    return routeErrorResponse(e);
  }
}
