import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api-wrap";
import { getStore } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/guard";

export const runtime = "nodejs";

async function handleGet(req: Request) {
  const guard = await requireAuth(req, { readOnly: true });
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const store = getStore();
  const items = await store.listReviewItems({
    runId: url.searchParams.get("runId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  return NextResponse.json({ items });
}

export async function GET(req: Request) {
  try {
    return await handleGet(req);
  } catch (e) {
    return routeErrorResponse(e);
  }
}
