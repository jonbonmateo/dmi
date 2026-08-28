import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/guard";

export const runtime = "nodejs";

export async function GET(req: Request) {
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
