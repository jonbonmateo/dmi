"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button, Card, Input, Spinner } from "@/components/ui";

interface StartRunResponse {
  runId: string;
  shopName: string;
  duplicate: boolean;
  reportUrl: string;
}

/**
 * The dashboard's "Inspect" action. Kicks off a run through POST /api/runs
 * (session-authenticated — see that route for why it's a separate endpoint
 * from the Zapier-facing /api/intake) and jumps straight to the new report,
 * which shows its own live progress while the pipeline runs.
 *
 * Always runs live, regardless of the session's own mode — typing a real URL
 * in here and hitting Inspect is expected to crawl that real site, every
 * time, even in a mock or guest session.
 */
export function InspectForm() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !shopName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await apiPost<StartRunResponse>("/api/runs", {
      shopName: shopName.trim(),
      website: website.trim() || undefined,
    });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not start the inspection.");
      setBusy(false);
      return;
    }
    router.push(`/dmi/${res.data.runId}`);
  }

  return (
    <Card className="mb-6 px-5 py-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="inspect-shop" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Shop name
          </label>
          <div className="mt-1">
            <Input
              id="inspect-shop"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Precision Auto Care"
              required
              disabled={busy}
            />
          </div>
        </div>
        <div className="min-w-[240px] flex-[1.5]">
          <label htmlFor="inspect-website" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Website URL
          </label>
          <div className="mt-1">
            <Input
              id="inspect-website"
              type="text"
              inputMode="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              disabled={busy}
            />
          </div>
        </div>
        <Button type="submit" disabled={busy || !shopName.trim()} className="shrink-0">
          {busy && <Spinner size={16} />}
          {busy ? "Starting…" : "Inspect"}
        </Button>
      </form>
      <p className="mt-2.5 text-xs text-[var(--color-muted)]">
        Always runs live — a real crawl of this website and real API calls — no matter which mode this
        session is in.
      </p>
      {error && <p className="mt-2.5 text-sm font-medium text-[var(--color-red)]">{error}</p>}
    </Card>
  );
}
