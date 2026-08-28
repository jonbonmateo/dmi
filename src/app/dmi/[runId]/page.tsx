import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStore } from "@/lib/storage";
import { getAuth } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { CLASSIFICATION_LABEL } from "@/lib/scoring/rubric";
import { CATEGORY_LABELS } from "@/lib/types";
import type { CategoryResult, Evidence, Finding } from "@/lib/types";
import {
  Callout,
  Card,
  CardHeader,
  ExternalLink,
  Field,
  ModeBadge,
  OutcomeMark,
  ScoreBadge,
  StatusPill,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function isUrl(s?: string | null): boolean {
  return Boolean(s && /^https?:\/\//i.test(s));
}

function EvidenceList({ items }: { items: Evidence[] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-3 print-break">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Evidence ({items.length})
      </summary>
      <ul className="mt-2 space-y-2 border-l-2 border-[var(--color-line)] pl-3">
        {items.map((e, i) => (
          <li key={i} className="text-xs">
            <div className="font-semibold">{e.label}</div>
            {e.value && <div className="mt-0.5 whitespace-pre-wrap text-[var(--color-muted)]">{e.value}</div>}
            {e.source && (
              <div className="mt-0.5">
                {isUrl(e.source) ? <ExternalLink href={e.source} /> : <span className="text-[var(--color-muted)]">{e.source}</span>}
              </div>
            )}
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
              {e.kind.replace(/_/g, " ")} · checked {new Date(e.checkedAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const outcome = f.humanOverride?.outcome ?? f.outcome;
  return (
    <li className="flex gap-3 border-t border-[var(--color-line)] px-5 py-4 print-break">
      <OutcomeMark outcome={outcome} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-muted)]">{f.index}.</span>
          <StatusPill status={f.status} />
          {f.humanOverride && (
            <span className="rounded bg-[var(--color-grey-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Set by {f.humanOverride.by}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm font-medium">{f.criterion}</p>
        <p className="mt-1.5 text-sm">{f.summary}</p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)]">{f.reasoning}</p>
        {f.humanOverride?.note && (
          <p className="mt-1.5 rounded bg-[var(--color-grey-soft)] p-2 text-xs">
            <strong>Reviewer:</strong> {f.humanOverride.note}
          </p>
        )}
        <EvidenceList items={f.evidence} />
      </div>
    </li>
  );
}

function CategoryBlock({ c }: { c: CategoryResult }) {
  const captured = Object.entries(c.captured).filter(([, v]) => v !== null && v !== undefined);
  return (
    <Card className="mb-6 overflow-hidden print-break">
      <CardHeader
        title={CATEGORY_LABELS[c.category]}
        right={
          <div className="text-right">
            <span className="tabular text-2xl font-bold">{c.score}</span>
            <span className="text-[var(--color-muted)]">/5</span>
            {c.potentialScore > c.score && (
              <p className="text-xs text-[var(--color-muted)]">
                could reach {c.potentialScore}/5 after review
              </p>
            )}
          </div>
        }
      />

      {captured.length > 0 && (
        <dl className="grid gap-4 border-b border-[var(--color-line)] px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {captured.map(([k, v]) => (
            <Field key={k} label={k} value={isUrl(v) ? <ExternalLink href={v!} /> : v} />
          ))}
        </dl>
      )}

      <ul>
        {c.findings.map((f) => (
          <FindingRow key={f.id} f={f} />
        ))}
      </ul>

      {c.notes.length > 0 && (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-raised)] px-5 py-3 text-xs text-[var(--color-muted)]">
          {c.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function DmiReport({ params }: { params: Promise<{ runId: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mode) redirect("/mode");

  const { runId } = await params;
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run) notFound();
  const [prospect, reviews, tracking, card] = await Promise.all([
    store.getProspect(run.prospectId),
    store.listReviewItems({ runId }),
    store.getTrackingRowByRun(runId),
    store.getBudgetCardByRun(runId),
  ]);
  const open = reviews.filter((r) => r.status === "open");
  const allOpen = await store.listReviewItems({ status: "open" });
  const v = run.verification;

  return (
    <AppShell auth={auth} active={null} openReviews={allOpen.length}>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/" className="font-medium text-[var(--color-brand)] hover:underline">
          ← All inspections
        </Link>
        <Link
          href={`/review?runId=${run.id}`}
          className="font-medium text-[var(--color-brand)] hover:underline"
        >
          Review queue ({open.length} open)
        </Link>
      </div>

      {run.mode === "mock" && (
        <div className="mb-6">
          <Callout tone="warn" title="This inspection used mock data">
            Every finding below came from bundled fixtures, not from a real observation of this shop.
            It is a demonstration of the report, not an assessment of the business.
          </Callout>
        </div>
      )}

      {/* ------------------------------------------------------- header */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
              Digital Marketing Inspection
            </p>
            <h1 className="mt-1 text-3xl font-bold">{prospect?.shopName ?? "Unknown shop"}</h1>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Website" value={v?.websiteResolvedUrl ? <ExternalLink href={v.websiteResolvedUrl} /> : prospect?.websiteUrl ?? "No website supplied"} />
              <Field label="Inspection date" value={run.inspectionDate} />
              <Field label="Contact" value={[prospect?.firstName, prospect?.lastName].filter(Boolean).join(" ") || "—"} />
              <Field label="Discovery call" value={prospect?.discoveryCallAt ? new Date(prospect.discoveryCallAt).toLocaleString() : "Not supplied"} />
              <Field label="Phone" value={prospect?.phone} />
              <Field label="Email" value={prospect?.email} />
              <Field label="Meeting type" value={prospect?.meetingType} />
              <Field label="Heard about us" value={prospect?.heardAboutUs} />
            </dl>
            {prospect?.marketingPainPoint && (
              <div className="mt-4 rounded bg-[var(--color-raised)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  What they want to improve
                </p>
                <p className="mt-1 text-sm">{prospect.marketingPainPoint}</p>
              </div>
            )}
          </div>
          {run.classification && (
            <div className="flex flex-col items-end gap-2">
              <ScoreBadge c={run.classification} score={run.totalScore} potential={run.potentialTotalScore} />
              <ModeBadge mode={run.mode} />
            </div>
          )}
        </div>
        {run.classification && (
          <p className="mt-5 border-t border-[var(--color-line)] pt-4 text-sm">
            <strong>{CLASSIFICATION_LABEL[run.classification]}</strong>
            {run.potentialTotalScore > run.totalScore && (
              <span className="text-[var(--color-muted)]">
                {" "}— {run.potentialTotalScore - run.totalScore} criteria could not be confirmed automatically. A point is only
                awarded on confirmed evidence, so the score can only go up once those are reviewed.
              </span>
            )}
          </p>
        )}
      </Card>

      {/* -------------------------------------------------- verification */}
      {v && (
        <Card className="mb-6 p-5 print-break">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Is this the right business?</h2>
            <StatusPill status={v.status} />
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Matched name" value={v.matchedName} />
            <Field label="Matched address" value={v.matchedAddress} />
            <Field label="Matched phone" value={v.matchedPhone} />
          </dl>
          {v.signals.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Matching evidence</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{v.signals.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {v.conflicts.length > 0 && (
            <div className="mt-4 rounded border border-[var(--color-yellow)] bg-[var(--color-yellow-soft)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-yellow)]">Conflicting information</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{v.conflicts.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {v.ambiguities.length > 0 && (
            <div className="mt-4 rounded border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Needs confirming</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{v.ambiguities.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {v.multipleLocations && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Other locations under this brand</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{v.locations.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      {/* ------------------------------------------------- open questions */}
      {open.length > 0 && (
        <Card className="mb-6 border-[var(--color-yellow)] p-5 print-break">
          <h2 className="font-semibold">{open.length} thing{open.length === 1 ? "" : "s"} a person still needs to check</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            These are not errors. They are the parts of the inspection that cannot be confirmed from public data without a human
            looking — so no point was awarded either way.
          </p>
          <ol className="mt-4 space-y-3">
            {open.map((r) => (
              <li key={r.id} className="rounded border border-[var(--color-line)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{r.reason}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{r.question}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{r.instruction}</p>
              </li>
            ))}
          </ol>
          <Link href={`/review?runId=${run.id}`} className="no-print mt-4 inline-block rounded bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white">
            Answer these
          </Link>
        </Card>
      )}

      {/* ----------------------------------------------------- categories */}
      {run.categories.map((c) => (
        <CategoryBlock key={c.category} c={c} />
      ))}

      {/* -------------------------------------------------------- budgets */}
      {run.budgets.length > 0 && (
        <Card className="mb-6 overflow-hidden print-break">
          <CardHeader title="Suggested monthly advertising budgets" />
          <div className="divide-y divide-[var(--color-line)]">
            {run.budgets.map((b) => (
              <div key={b.channel} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-medium">
                    {b.channel === "google_ads" ? "Google Ads" : "Local Services Ads"}
                  </h3>
                  <div className="text-right">
                    {b.monthlyUsd === null ? (
                      <StatusPill status={b.status} />
                    ) : (
                      <>
                        <div className="text-2xl font-bold">${b.monthlyUsd.toLocaleString()}<span className="text-sm font-normal text-[var(--color-muted)]">/mo</span></div>
                        <div className="text-xs text-[var(--color-muted)]">range ${b.low?.toLocaleString()}–${b.high?.toLocaleString()}</div>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{b.rationale}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Model inputs
                  </summary>
                  <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                    {Object.entries(b.inputs).map(([k, val]) => (
                      <div key={k}>
                        <dt className="text-[var(--color-muted)]">{k}</dt>
                        <dd className="font-medium">{String(val)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            ))}
          </div>
          {card?.totalMonthlyUsd != null && (
            <div className="border-t border-[var(--color-line)] bg-[var(--color-raised)] px-5 py-3 text-sm">
              <strong>Ads Budget Card {card.id}</strong> — total ${card.totalMonthlyUsd.toLocaleString()}/month
            </div>
          )}
        </Card>
      )}

      {/* ------------------------------------------------- record keeping */}
      <Card className="mb-6 p-5 print-break">
        <h2 className="font-semibold">Where this DMI was recorded</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="DMI link (for the tracking spreadsheet)" value={run.reportUrl ? <ExternalLink href={run.reportUrl} /> : "—"} />
          <Field label="Tracking row" value={tracking ? `${tracking.id} — week of ${tracking.weekOf}, status "${tracking.weeklyStatus}"` : "Not created"} />
          {run.publish && (
            <>
              <Field label="Tracking spreadsheet" value={<><StatusPill status={run.publish.trackingRow.status} /> <span className="mt-1 block text-xs text-[var(--color-muted)]">{run.publish.trackingRow.note}</span></>} />
              <Field label="GoHighLevel contact" value={<><StatusPill status={run.publish.ghlContact.status} /> <span className="mt-1 block text-xs text-[var(--color-muted)]">{run.publish.ghlContact.note}</span></>} />
              <Field label="GoHighLevel note" value={<><StatusPill status={run.publish.ghlNote.status} /> <span className="mt-1 block text-xs text-[var(--color-muted)]">{run.publish.ghlNote.note}</span></>} />
              <Field label="Ads Budget Card" value={<><StatusPill status={run.publish.adsBudgetCard.status} /> <span className="mt-1 block text-xs text-[var(--color-muted)]">{run.publish.adsBudgetCard.note}</span></>} />
              <Field label="Weekly status" value={<><strong>{run.publish.weeklyStatus.value}</strong> <span className="mt-1 block text-xs text-[var(--color-muted)]">{run.publish.weeklyStatus.note}</span></>} />
            </>
          )}
        </dl>
      </Card>

      {/* ------------------------------------------------------- run log */}
      <details className="no-print mb-10">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-muted)]">
          Run log — {run.steps.filter((s) => s.status === "done").length}/{run.steps.length} steps completed, {run.errors.length} error(s)
        </summary>
        <Card className="mt-3 p-5 text-xs">
          <table className="w-full">
            <thead className="text-left text-[var(--color-muted)]">
              <tr><th className="py-1">Step</th><th>Status</th><th>Attempts</th><th>Finished</th><th>Error</th></tr>
            </thead>
            <tbody>
              {run.steps.map((s) => (
                <tr key={s.step} className="border-t border-[var(--color-line)]">
                  <td className="py-1 font-medium">{s.step}</td>
                  <td>{s.status}</td>
                  <td>{s.attempts}</td>
                  <td>{s.finishedAt ? new Date(s.finishedAt).toLocaleTimeString() : "—"}</td>
                  <td className="text-[var(--color-red)]">{s.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {run.errors.length > 0 && (
            <ul className="mt-4 space-y-1">
              {run.errors.map((e, i) => (
                <li key={i}>
                  <span className="text-[var(--color-muted)]">{new Date(e.at).toLocaleString()} · {e.step}</span> — {e.message}
                  {e.fatal && <strong className="text-[var(--color-red)]"> (fatal)</strong>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </details>

      <footer className="mt-10 border-t border-[var(--color-line)] pt-4 text-xs text-[var(--color-muted)]">
        Run {run.id} · state {run.state} · {run.mode} data · generated{" "}
        {new Date(run.updatedAt).toLocaleString()}. A criterion earns a point only when confirmed
        evidence shows it is met; anything unconfirmed is listed above rather than guessed at.
      </footer>
    </AppShell>
  );
}
