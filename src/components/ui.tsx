import type { Classification, EvidenceStatus, Outcome } from "@/lib/types";
import type { RunMode } from "@/lib/auth/types";

/* --------------------------------------------------------------- surfaces */

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={`rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  right,
  description,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-raised)] px-5 py-4 rounded-t-[var(--radius-card)]">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      {right}
    </header>
  );
}

/* ----------------------------------------------------------------- status */

const STATUS: Record<EvidenceStatus, { label: string; fg: string; bg: string; bd: string }> = {
  confirmed: { label: "Confirmed", fg: "var(--color-green)", bg: "var(--color-green-soft)", bd: "var(--color-green-line)" },
  not_found: { label: "Not found", fg: "var(--color-red)", bg: "var(--color-red-soft)", bd: "var(--color-red-line)" },
  unable_to_evaluate: { label: "Unable to evaluate", fg: "var(--color-muted)", bg: "var(--color-grey-soft)", bd: "var(--color-line-strong)" },
  requires_human_review: { label: "Needs a human", fg: "var(--color-yellow)", bg: "var(--color-yellow-soft)", bd: "var(--color-yellow-line)" },
  conflicting_information: { label: "Conflicting info", fg: "var(--color-yellow)", bg: "var(--color-yellow-soft)", bd: "var(--color-yellow-line)" },
};

export function StatusPill({ status }: { status: EvidenceStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
    >
      {s.label}
    </span>
  );
}

const OUTCOME: Record<Outcome, { ch: string; fg: string; bg: string; bd: string; title: string }> = {
  pass: { ch: "✓", fg: "var(--color-green)", bg: "var(--color-green-soft)", bd: "var(--color-green-line)", title: "Point awarded — confirmed evidence" },
  fail: { ch: "✕", fg: "var(--color-red)", bg: "var(--color-red-soft)", bd: "var(--color-red-line)", title: "No point — criterion not met" },
  undetermined: { ch: "?", fg: "var(--color-yellow)", bg: "var(--color-yellow-soft)", bd: "var(--color-yellow-line)", title: "No point — could not be determined" },
};

export function OutcomeMark({ outcome }: { outcome: Outcome }) {
  const m = OUTCOME[outcome];
  return (
    <span
      title={m.title}
      aria-label={m.title}
      role="img"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold"
      style={{ color: m.fg, background: m.bg, borderColor: m.bd }}
    >
      {m.ch}
    </span>
  );
}

const CLASS: Record<Classification, { label: string; fg: string; bg: string; bd: string }> = {
  red: { label: "Red", fg: "var(--color-red)", bg: "var(--color-red-soft)", bd: "var(--color-red-line)" },
  yellow: { label: "Yellow", fg: "var(--color-yellow)", bg: "var(--color-yellow-soft)", bd: "var(--color-yellow-line)" },
  green: { label: "Green", fg: "var(--color-green)", bg: "var(--color-green-soft)", bd: "var(--color-green-line)" },
};

export function ScoreBadge({
  c,
  score,
  potential,
}: {
  c: Classification;
  score: number;
  potential: number;
}) {
  const m = CLASS[c];
  return (
    <div
      className="min-w-[168px] rounded-[var(--radius-card)] border-2 px-5 py-4 text-center"
      style={{ color: m.fg, background: m.bg, borderColor: m.bd }}
    >
      <div className="tabular text-5xl font-bold leading-none">
        {score}
        <span className="text-2xl font-normal opacity-60">/20</span>
      </div>
      <div className="mt-1.5 text-sm font-bold uppercase tracking-[0.18em]">{m.label}</div>
      {potential > score && (
        <div className="mt-1 text-xs font-medium opacity-85">could reach {potential}/20 after review</div>
      )}
    </div>
  );
}

export function ClassificationDot({ c }: { c: Classification }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: `var(--color-${c})` }}
    />
  );
}

/* ------------------------------------------------------------- mode badge */

export function ModeBadge({ mode, size = "sm" }: { mode: RunMode; size?: "sm" | "lg" }) {
  const live = mode === "live";
  const pad = size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider ${pad}`}
      style={{
        color: live ? "var(--color-live)" : "var(--color-mock)",
        background: live ? "var(--color-live-soft)" : "var(--color-mock-soft)",
        borderColor: live ? "var(--color-live-line)" : "var(--color-mock-line)",
      }}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: live ? "var(--color-live)" : "var(--color-mock)" }}
      />
      {live ? "Live data" : "Mock data"}
    </span>
  );
}

/* ------------------------------------------------------------------ bits */

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 text-sm break-words text-[var(--color-ink-soft)]">
        {value ?? <span className="text-[var(--color-muted)]">—</span>}
      </dd>
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[var(--color-brand)] underline decoration-[var(--color-brand)]/35 underline-offset-2 hover:decoration-[var(--color-brand)] break-words"
    >
      {children ?? href}
    </a>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "success" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55";
  const styles: Record<string, string> = {
    primary: "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]",
    secondary:
      "border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]",
    ghost: "text-[var(--color-ink-soft)] hover:bg-[var(--color-grey-soft)]",
    // Fixed dark-navy text rather than the theme's --color-ink: the accent
    // green button is a fixed-colour island (same bright #80bc00 in both
    // themes), so its text must stay dark regardless of light/dark mode.
    success: "bg-[var(--color-brand-accent)] text-[#012971] hover:opacity-90",
    danger: "bg-[var(--color-red)] text-white hover:opacity-90",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-focus)] ${props.className ?? ""}`}
    />
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    info: { bg: "var(--color-brand-soft)", bd: "var(--color-brand)", fg: "var(--color-brand)" },
    warn: { bg: "var(--color-yellow-soft)", bd: "var(--color-yellow-line)", fg: "var(--color-yellow)" },
    danger: { bg: "var(--color-red-soft)", bd: "var(--color-red-line)", fg: "var(--color-red)" },
    success: { bg: "var(--color-green-soft)", bd: "var(--color-green-line)", fg: "var(--color-green)" },
  }[tone];
  return (
    <div className="rounded-lg border-l-4 px-4 py-3" style={{ background: tones.bg, borderColor: tones.bd }}>
      {title && (
        <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color: tones.fg }}>
          {title}
        </p>
      )}
      <div className="mt-1 text-sm text-[var(--color-ink-soft)]">{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="px-8 py-14 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">{children}</div>}
    </Card>
  );
}
