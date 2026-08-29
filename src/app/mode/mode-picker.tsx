"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button, Callout, Card } from "@/components/ui";
import type { Readiness, ReadinessCheck } from "@/lib/readiness";

function CheckRow({ check }: { check: ReadinessCheck }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-[var(--color-line)] px-4 py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          style={{
            color: check.ok ? "var(--color-green)" : check.importance === "required" ? "var(--color-red)" : "var(--color-yellow)",
            background: check.ok ? "var(--color-green-soft)" : check.importance === "required" ? "var(--color-red-soft)" : "var(--color-yellow-soft)",
          }}
        >
          {check.ok ? "✓" : check.importance === "required" ? "!" : "–"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {check.label}{" "}
            <span className="text-xs font-normal uppercase tracking-wider text-[var(--color-muted)]">
              {check.importance}
            </span>
          </p>
          {!check.ok && (
            <>
              <p className="mt-0.5 text-sm text-[var(--color-muted)]">{check.consequence}</p>
              <button
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="mt-1.5 text-sm font-semibold text-[var(--color-brand)] hover:underline"
              >
                {open ? "Hide steps" : "How do I fix this?"}
              </button>
              {open && (
                <div className="mt-2 rounded-lg bg-[var(--color-raised)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Environment variables
                  </p>
                  <p className="tabular mt-0.5 text-sm">{check.envVars.join(", ")}</p>
                  <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-sm text-[var(--color-ink-soft)]">
                    {check.howTo.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  {check.docsUrl && (
                    <a
                      href={check.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-block text-sm font-medium text-[var(--color-brand)] hover:underline"
                    >
                      Documentation ↗
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function ModePicker({
  readiness,
  canUseLive,
  userName,
  role,
  nextPath,
}: {
  readiness: Readiness;
  canUseLive: boolean;
  userName: string;
  role: string;
  nextPath: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"live" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChecks, setShowChecks] = useState(!readiness.liveAvailable);

  const liveBlocked = !readiness.liveAvailable || !canUseLive;

  async function choose(mode: "live" | "mock") {
    setBusy(mode);
    setError(null);
    const res = await apiPost<{ next: string }>("/api/auth/mode", { mode });
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      setShowChecks(true);
      return;
    }
    const dest = res.data?.next ?? "/";
    router.push(nextPath && dest === "/" ? nextPath : dest);
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        Signed in as {userName}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">How should this session run?</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
        Pick once, now. The choice is fixed for the whole session — to change it you sign out and back
        in. That is deliberate: whether a DMI came from real observations or from fixtures has to be a
        fact about the run, not a switch someone might have flipped halfway through.
      </p>

      {error && (
        <div className="mt-6">
          <Callout tone="danger" title="Could not start that mode">
            {error}
          </Callout>
        </div>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {/* ------------------------------------------------------- live */}
        <Card className="flex flex-col p-6">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--color-live)" }}
            />
            <h2 className="text-lg font-bold">Live mode</h2>
          </div>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Crawls the shop&rsquo;s real website, calls Google, Meta and PageSpeed, and writes results to
            GoHighLevel and the tracking sheet. This is the real thing, and it spends real API quota.
          </p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-muted)]">Live coverage</dt>
              <dd className="font-semibold">{readiness.liveCoveragePercent}%</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-muted)]">Required checks</dt>
              <dd className="font-semibold" style={{ color: readiness.liveAvailable ? "var(--color-green)" : "var(--color-red)" }}>
                {readiness.liveAvailable ? "All passing" : `${readiness.requiredMissing.length} missing`}
              </dd>
            </div>
          </dl>

          {!canUseLive ? (
            <p className="mt-4 rounded-lg bg-[var(--color-grey-soft)] px-3 py-2 text-sm text-[var(--color-muted)]">
              Guest sessions cannot run live. Sign in with an account to use real data.
            </p>
          ) : !readiness.liveAvailable ? (
            <p className="mt-4 rounded-lg bg-[var(--color-red-soft)] px-3 py-2 text-sm text-[var(--color-red)]">
              {readiness.requiredMissing.length} required{" "}
              {readiness.requiredMissing.length === 1 ? "setting is" : "settings are"} missing. Follow
              the steps below, redeploy, then sign in again.
            </p>
          ) : null}

          <Button
            onClick={() => choose("live")}
            disabled={liveBlocked || busy !== null}
            className="mt-4 w-full"
          >
            {busy === "live" ? "Starting…" : "Start in live mode"}
          </Button>
        </Card>

        {/* ------------------------------------------------------- mock */}
        <Card className="flex flex-col p-6">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--color-mock)" }}
            />
            <h2 className="text-lg font-bold">Mock mode</h2>
          </div>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Every provider — including the web crawler — reads from bundled fixtures. Nothing leaves
            this machine, no quota is spent, and the results are reproducible. Good for demos,
            training and development.
          </p>
          <div className="mt-4 rounded-lg bg-[var(--color-mock-soft)] px-3 py-2.5">
            <p className="text-sm" style={{ color: "var(--color-mock)" }}>
              Findings will be labelled <strong>[MOCK]</strong> and the banner stays purple, so nobody
              mistakes a demo for a real inspection.
            </p>
          </div>
          <Button
            // When live is blocked, mock is the only button that actually
            // does anything — it gets the prominent styling so that's
            // visually obvious, rather than leaving the working option
            // looking like the secondary, less-clickable choice.
            variant={liveBlocked ? "primary" : "secondary"}
            onClick={() => choose("mock")}
            disabled={busy !== null}
            className="mt-4 w-full"
          >
            {busy === "mock" ? "Starting…" : "Start in mock mode"}
          </Button>
        </Card>
      </div>

      {/* ------------------------------------------------- readiness list */}
      <div className="mt-10">
        <button
          onClick={() => setShowChecks((s) => !s)}
          aria-expanded={showChecks}
          className="text-sm font-semibold text-[var(--color-brand)] hover:underline"
        >
          {showChecks ? "Hide" : "Show"} connection checks (
          {readiness.checks.filter((c) => c.ok).length}/{readiness.checks.length} passing)
        </button>

        {showChecks && (
          <Card className="mt-3 overflow-hidden">
            <ul>
              {readiness.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </ul>
          </Card>
        )}
      </div>

      <p className="mt-8 text-xs text-[var(--color-muted)]">
        Signed in as {role}. Changing environment variables requires a redeploy before the checks above
        will change.
      </p>
    </main>
  );
}
