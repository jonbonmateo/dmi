import type { Classification, EvidenceStatus, Outcome } from "@/lib/types";

export function StatusPill({ status }: { status: EvidenceStatus }) {
  const map: Record<EvidenceStatus, { label: string; cls: string }> = {
    confirmed: { label: "Confirmed", cls: "bg-[var(--color-green-soft)] text-[var(--color-green)]" },
    not_found: { label: "Not found", cls: "bg-[var(--color-red-soft)] text-[var(--color-red)]" },
    unable_to_evaluate: { label: "Unable to evaluate", cls: "bg-[var(--color-grey-soft)] text-[var(--color-muted)]" },
    requires_human_review: { label: "Requires human review", cls: "bg-[var(--color-yellow-soft)] text-[var(--color-yellow)]" },
    conflicting_information: { label: "Conflicting information", cls: "bg-[var(--color-yellow-soft)] text-[var(--color-yellow)]" },
  };
  const s = map[status];
  return <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${s.cls}`}>{s.label}</span>;
}

export function OutcomeMark({ outcome }: { outcome: Outcome }) {
  const map: Record<Outcome, { ch: string; cls: string; title: string }> = {
    pass: { ch: "✓", cls: "bg-[var(--color-green-soft)] text-[var(--color-green)]", title: "Point awarded" },
    fail: { ch: "✕", cls: "bg-[var(--color-red-soft)] text-[var(--color-red)]", title: "No point — criterion not met" },
    undetermined: { ch: "?", cls: "bg-[var(--color-yellow-soft)] text-[var(--color-yellow)]", title: "No point — could not be determined" },
  };
  const m = map[outcome];
  return (
    <span title={m.title} className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${m.cls}`}>
      {m.ch}
    </span>
  );
}

export function ClassificationBadge({ c, score, potential }: { c: Classification; score: number; potential: number }) {
  const map: Record<Classification, { label: string; cls: string }> = {
    red: { label: "RED", cls: "bg-[var(--color-red-soft)] text-[var(--color-red)] border-[var(--color-red)]" },
    yellow: { label: "YELLOW", cls: "bg-[var(--color-yellow-soft)] text-[var(--color-yellow)] border-[var(--color-yellow)]" },
    green: { label: "GREEN", cls: "bg-[var(--color-green-soft)] text-[var(--color-green)] border-[var(--color-green)]" },
  };
  const m = map[c];
  return (
    <div className={`rounded-lg border-2 px-5 py-4 text-center ${m.cls}`}>
      <div className="text-4xl font-bold leading-none">{score}<span className="text-xl font-normal opacity-70">/20</span></div>
      <div className="mt-1 text-sm font-bold tracking-widest">{m.label}</div>
      {potential > score && (
        <div className="mt-1 text-[11px] font-medium opacity-80">could reach {potential}/20 after review</div>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] ${className}`}>
      {children}
    </section>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{value ?? <span className="text-[var(--color-muted)]">—</span>}</dd>
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[var(--color-brand)] underline underline-offset-2 break-all">
      {children ?? href}
    </a>
  );
}
