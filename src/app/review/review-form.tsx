"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewForm({ itemId, scorable }: { itemId: string; scorable: boolean }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(outcome: "pass" | "fail" | "undetermined") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          resolution: resolution || null,
          outcome: scorable ? outcome : undefined,
          by: by || "team",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--color-line)] pt-4">
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="What did you find? This is stored as the evidence for this criterion."
        rows={2}
        className="w-full rounded border border-[var(--color-line)] p-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={by}
          onChange={(e) => setBy(e.target.value)}
          placeholder="Your name"
          className="rounded border border-[var(--color-line)] px-2 py-1.5 text-sm"
        />
        {scorable ? (
          <>
            <button
              disabled={busy}
              onClick={() => submit("pass")}
              className="rounded bg-[var(--color-green)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Criterion met — award the point
            </button>
            <button
              disabled={busy}
              onClick={() => submit("fail")}
              className="rounded bg-[var(--color-red)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Not met
            </button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={() => submit("undetermined")}
            className="rounded bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Mark handled
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-[var(--color-red)]">{error}</p>}
    </div>
  );
}
