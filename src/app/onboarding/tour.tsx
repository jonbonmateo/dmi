"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { Button, Card, ModeBadge, OutcomeMark, StatusPill } from "@/components/ui";
import type { RunMode } from "@/lib/auth/types";

interface StepProps {
  mode: RunMode;
  sampleRunId: string | null;
  hasRuns: boolean;
  openReviewCount: number;
  liveCoverage: number;
  role: string;
}

interface Step {
  id: string;
  title: string;
  body: (p: StepProps) => React.ReactNode;
}

const STEPS: Step[] = [
  {
    id: "what",
    title: "What a DMI is",
    body: () => (
      <>
        <p>
          A Digital Marketing Inspection scores an automotive repair shop&rsquo;s digital presence
          across four areas, five criteria each — twenty points in total.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Website", "Branding, accessibility, calls to action, authentic imagery, performance."],
            ["Search Engine Optimization", "Blog, service pages, on-page structure, Google Business Profile, citations."],
            ["Digital Advertising", "Google ads, Meta ads, campaign count, retargeting pixel, lead response."],
            ["Social Media", "Profile completeness, posting cadence, authentic content, engagement, originality."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3.5">
              <p className="text-sm font-semibold">{t}</p>
              <p className="mt-0.5 text-sm text-[var(--color-muted)]">{d}</p>
              <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">5 points</p>
            </div>
          ))}
        </div>
        <p className="mt-4">
          The total lands the shop in a band the salesperson can lead with:{" "}
          <strong style={{ color: "var(--color-red)" }}>1–10 Red</strong>,{" "}
          <strong style={{ color: "var(--color-yellow)" }}>11–15 Yellow</strong>,{" "}
          <strong style={{ color: "var(--color-green)" }}>16–20 Green</strong>.
        </p>
      </>
    ),
  },
  {
    id: "evidence",
    title: "A point needs evidence — always",
    body: () => (
      <>
        <p>
          This is the rule everything else follows from:{" "}
          <strong>a criterion earns a point only when confirmed evidence shows it is met.</strong>{" "}
          Every finding carries one of three marks.
        </p>
        <ul className="mt-4 space-y-3">
          {(
            [
              ["pass", "We checked, and it passes. One point.", "confirmed"],
              ["fail", "We checked, and it does not pass. No point — and a genuine selling point for the call.", "confirmed"],
              ["undetermined", "We could not establish it. No point either way, and it goes to the review queue as a question.", "requires_human_review"],
            ] as const
          ).map(([outcome, text, status]) => (
            <li key={outcome} className="flex items-start gap-3">
              <OutcomeMark outcome={outcome} />
              <div className="flex-1">
                <StatusPill status={status} />
                <p className="mt-1 text-sm">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg bg-[var(--color-brand-soft)] px-3.5 py-2.5 text-sm">
          Because unconfirmed criteria never score, the report shows a second number too — the score it
          <em> could</em> reach once the open questions are answered. The colour band always comes from
          the confirmed score, so a DMI never gets worse in front of the prospect.
        </p>
      </>
    ),
  },
  {
    id: "mode",
    title: "The mode you are in",
    body: (p) => (
      <>
        <div className="flex items-center gap-3">
          <ModeBadge mode={p.mode} size="lg" />
          <span className="text-sm text-[var(--color-muted)]">for this whole session</span>
        </div>
        {p.mode === "mock" ? (
          <>
            <p className="mt-4">
              You are in <strong>mock mode</strong>. Every provider — including the web crawler — reads
              from bundled fixtures. Nothing leaves this machine and no API quota is spent. Findings
              produced this way are tagged <strong>[MOCK]</strong> in their evidence, and the purple
              banner stays at the top of every page.
            </p>
            <p className="mt-3">
              It is the right mode for demos, training and development — and the wrong one for a real
              prospect, because none of it is a real observation.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4">
              You are in <strong>live mode</strong>. Inspections crawl the shop&rsquo;s real website,
              call Google and Meta, and write back to GoHighLevel and the tracking sheet. Live
              coverage on this deployment is <strong>{p.liveCoverage}%</strong> — anything not
              connected degrades to a review question rather than a guess.
            </p>
            <p className="mt-3">
              Real quota is being spent and the real CRM is being written to. Treat every run as
              something a prospect may eventually see.
            </p>
          </>
        )}
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Mode is chosen at sign-in and fixed for the session. To switch, sign out and back in.
        </p>
      </>
    ),
  },
  {
    id: "flow",
    title: "How an inspection gets here",
    body: () => (
      <>
        <ol className="space-y-3">
          {[
            ["A prospect books a discovery call", "GoHighLevel fires, and Zapier posts the appointment to this app."],
            ["The business is verified first", "Website, phone and Google listing are matched before anything is trusted. Conflicts and lookalike businesses are flagged, not guessed past."],
            ["Four reviews run", "Website, SEO, advertising and social. Each captures evidence as it goes."],
            ["Scores and budgets are calculated", "Twenty criteria, plus Google Ads and Local Services Ads recommendations that show every input."],
            ["Everything is recorded", "Tracking row, GoHighLevel note and custom fields, and an Ads Budget Card — with the report link."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-brand-soft)] text-sm font-bold text-[var(--color-brand)]">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{t}</p>
                <p className="text-sm text-[var(--color-muted)]">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          If a step fails or times out, the run resumes from its last completed step rather than
          starting over. Nothing is lost, and nothing is re-crawled.
        </p>
      </>
    ),
  },
  {
    id: "review",
    title: "Your part: the review queue",
    body: (p) => (
      <>
        <p>
          Some things genuinely cannot be settled from public data. Rather than guess, the automation
          asks — one specific question, with the link to check it.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm">
          {[
            ["Does a real person answer the phone?", "Never auto-dialled: that would be a robocall under the TCPA, and it is a judgement call. You are calling the shop anyway."],
            ["Is this Google ad activity live?", "Google has no public ads API and its Transparency Center forbids scraping — but the link takes ten seconds to check."],
            ["What is the citation score?", "The 60% benchmark comes from a paid aggregator. Our own estimate is shown, clearly labelled as an estimate."],
            ["Is the social content original?", "Meta does not serve post history to logged-out clients."],
          ].map(([q, why]) => (
            <li key={q} className="rounded-lg border border-[var(--color-line)] p-3">
              <p className="font-semibold">{q}</p>
              <p className="text-[var(--color-muted)]">{why}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4">
          Answering a question updates the score, the colour band and the weekly tracking status
          immediately.
          {p.openReviewCount > 0 && (
            <>
              {" "}
              There {p.openReviewCount === 1 ? "is" : "are"} <strong>{p.openReviewCount}</strong> waiting
              right now.
            </>
          )}
        </p>
      </>
    ),
  },
  {
    id: "go",
    title: "You are set",
    body: (p) => (
      <>
        <p>Three places to know:</p>
        <div className="mt-4 space-y-3">
          {[
            ["/", "Inspections", "Every DMI, sortable and filterable by score, band, state and week."],
            ["/review", "Review queue", "The open questions, grouped by shop."],
            ["/tracking", "Tracking sheet", "The spreadsheet view: scores, links and weekly status."],
          ].map(([href, title, desc]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-lg border border-[var(--color-line)] p-3.5 hover:border-[var(--color-brand)]"
            >
              <p className="font-semibold text-[var(--color-brand)]">{title}</p>
              <p className="text-sm text-[var(--color-muted)]">{desc}</p>
            </Link>
          ))}
        </div>
        {p.sampleRunId && (
          <p className="mt-4 text-sm">
            Want to see a finished one?{" "}
            <Link href={`/dmi/${p.sampleRunId}`} className="font-semibold text-[var(--color-brand)] hover:underline">
              Open a sample inspection →
            </Link>
          </p>
        )}
        {!p.hasRuns && (
          <p className="mt-4 rounded-lg bg-[var(--color-yellow-soft)] px-3.5 py-2.5 text-sm" style={{ color: "var(--color-yellow)" }}>
            There are no inspections yet. Run <code>npm run seed</code> for three samples, or point the
            intake webhook at this deployment.
          </p>
        )}
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          You can reopen this tour any time from the account menu.
        </p>
      </>
    ),
  },
];

export function Tour(props: {
  mode: RunMode;
  userName: string;
  role: string;
  hasRuns: boolean;
  sampleRunId: string | null;
  openReviewCount: number;
  liveCoverage: number;
  alreadyOnboarded: boolean;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  async function finish() {
    setBusy(true);
    await apiPost("/api/auth/onboarded", {});
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {props.alreadyOnboarded ? "Tour" : `Welcome, ${props.userName}`}
        </p>
        <button onClick={finish} disabled={busy} className="text-sm text-[var(--color-muted)] hover:underline">
          Skip
        </button>
      </div>

      {/* progress */}
      <ol className="mb-6 flex gap-1.5" aria-label="Progress">
        {STEPS.map((s, idx) => (
          <li key={s.id} className="flex-1">
            <button
              onClick={() => setI(idx)}
              aria-label={`Step ${idx + 1}: ${s.title}`}
              aria-current={idx === i ? "step" : undefined}
              className="block h-1.5 w-full rounded-full transition-colors"
              style={{ background: idx <= i ? "var(--color-brand)" : "var(--color-line)" }}
            />
          </li>
        ))}
      </ol>

      <Card className="p-7">
        <p className="text-sm font-semibold text-[var(--color-brand)]">
          Step {i + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{step.title}</h1>
        <div className="mt-4 space-y-1 text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
          {step.body(props)}
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>
          ← Back
        </Button>
        {last ? (
          <Button onClick={finish} disabled={busy}>
            {busy ? "Finishing…" : "Get started"}
          </Button>
        ) : (
          <Button onClick={() => setI((n) => n + 1)}>Next →</Button>
        )}
      </div>
    </main>
  );
}
