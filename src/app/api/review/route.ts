import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = getStore();
  const items = await store.listReviewItems({
    runId: url.searchParams.get("runId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  return NextResponse.json({ items });
}
