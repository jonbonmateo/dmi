"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/client/api";
import { Card, Spinner } from "@/components/ui";
import type { DmiRun, RunState, StepRecord } from "@/lib/types";
import { STEP_ORDER } from "@/lib/types";

const STEP_LABEL: Record<string, string> = {
  verify_business: "Verifying business",
  website: "Checking website",
  seo: "Checking SEO",
  advertising: "Checking advertising",
  social: "Checking social presence",
  score: "Scoring",
  budget: "Recommending budgets",
  publish: "Recording results",
};

const DONE_STATES: RunState[] = ["needs_review", "completed", "failed"];

/**
 * Polls the run this report page is for while it's still `queued`/`running`
 * (started from the dashboard's "Inspect" button, or resumed after a
 * failure) and shows step-by-step progress instead of a stale/empty report.
 * Once the run reaches a terminal state, refreshes the server component so
 * the full report renders with real data — no manual reload needed.
 */
export function RunProgress({ runId, initialState, initialSteps }: {
  runId: string;
  initialState: RunState;
  initialSteps: StepRecord[];
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [steps, setSteps] = useState(initialSteps);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (DONE_STATES.includes(state)) return;
    let cancelled = false;

    async function poll() {
      const res = await apiGet<{ run: DmiRun }>(`/api/runs/${runId}`);
      if (cancelled) return;
      if (res.ok && res.data) {
        setState(res.data.run.state);
        setSteps(res.data.run.steps);
        if (DONE_STATES.includes(res.data.run.state)) {
          router.refresh();
          return;
        }
      }
      timer.current = setTimeout(poll, 2000);
    }
    timer.current = setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, runId, router]);

  if (DONE_STATES.includes(state)) return null;

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-center gap-3">
        <Spinner size={20} className="text-[var(--color-brand)]" />
        <div>
          <p className="font-semibold">Inspection in progress…</p>
          <p className="text-sm text-[var(--color-muted)]">This report will fill in automatically. No need to reload.</p>
        </div>
      </div>
      <ol className="mt-4 flex flex-wrap gap-2 text-xs">
        {STEP_ORDER.map((step) => {
          const s = steps.find((x) => x.step === step);
          const status = s?.status ?? "pending";
          const tone =
            status === "done" ? "var(--color-green)" :
            status === "failed" ? "var(--color-red)" :
            status === "running" ? "var(--color-brand)" :
            "var(--color-muted)";
          return (
            <li
              key={step}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium"
              style={{ color: tone, borderColor: tone, background: "var(--color-surface)" }}
            >
              {status === "running" && <Spinner size={11} />}
              {STEP_LABEL[step] ?? step}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
