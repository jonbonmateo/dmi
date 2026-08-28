"use client";

import { useState } from "react";
import type { ReadinessCheck } from "@/lib/readiness";

export function SetupChecklist({ checks }: { checks: ReadinessCheck[] }) {
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const shown = filter === "all" ? checks : checks.filter((c) => !c.ok);

  return (
    <div>
      <div className="flex gap-2 border-b border-[var(--color-line)] px-5 py-3">
        {(["all", "missing"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filter === f
                ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-grey-soft)]"
            }`}
          >
            {f === "all" ? `All (${checks.length})` : `Not connected (${checks.filter((c) => !c.ok).length})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[var(--color-muted)]">
          Everything is connected.
        </p>
      ) : (
        <ul>
          {shown.map((c) => (
            <Row key={c.id} check={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ check }: { check: ReadinessCheck }) {
  const [open, setOpen] = useState(false);
  const tone = check.ok
    ? { fg: "var(--color-green)", bg: "var(--color-green-soft)", mark: "✓" }
    : check.importance === "required"
      ? { fg: "var(--color-red)", bg: "var(--color-red-soft)", mark: "!" }
      : { fg: "var(--color-yellow)", bg: "var(--color-yellow-soft)", mark: "–" };

  return (
    <li className="border-t border-[var(--color-line)] px-5 py-4 first:border-t-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
          style={{ color: tone.fg, background: tone.bg }}
        >
          {tone.mark}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{check.label}</p>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: tone.fg, background: tone.bg }}
            >
              {check.ok ? "connected" : check.importance}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {check.ok ? "Connected and in use." : check.consequence}
          </p>
          <p className="tabular mt-1 text-xs text-[var(--color-muted)]">{check.envVars.join(", ")}</p>

          {!check.ok && (
            <>
              <button
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="mt-2 text-sm font-semibold text-[var(--color-brand)] hover:underline"
              >
                {open ? "Hide steps" : "Show setup steps"}
              </button>
              {open && (
                <div className="mt-2 rounded-lg bg-[var(--color-raised)] p-4">
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--color-ink-soft)]">
                    {check.howTo.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-[var(--color-muted)]">
                    Environment changes need a redeploy, then a fresh sign-in, before this turns green.
                  </p>
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
