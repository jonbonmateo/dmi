import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { googleConfigured } from "@/lib/auth/google";
import { guestsAllowed, signupsAllowed } from "@/lib/auth/accounts";
import { getStore } from "@/lib/storage";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured on this deployment.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "That sign-in link expired or did not match. Please try again.",
  google_exchange: "Google would not complete the sign-in. Please try again.",
  google_domain: "That email domain is not allowed to sign in here.",
  account_disabled: "That account has been disabled. Ask an admin to re-enable it.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await getAuth()) redirect("/mode");
  const { error, next } = await searchParams;

  // A brand-new deployment has no accounts; say so, so the first person knows
  // to create one rather than hunting for credentials that do not exist.
  const isFirstRun = (await getStore().countUsers()) === 0;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* ------------------------------------------------------ the pitch */}
      <section className="hidden flex-col justify-between bg-[var(--color-surface)] p-12 lg:flex border-r border-[var(--color-line)]">
        <div className="flex items-center gap-2.5 font-bold">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-brand)] text-sm font-bold text-white"
          >
            D
          </span>
          DMI
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-bold tracking-tight">
            Digital Marketing Inspections, done before the call.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
            A booked discovery call becomes a finished, evidence-backed inspection of the shop&rsquo;s
            website, SEO, advertising and social media — scored out of 20 and recorded in the tracking
            sheet, GoHighLevel and an Ads Budget Card.
          </p>
          <dl className="mt-8 space-y-4 text-sm">
            <div>
              <dt className="font-semibold">Twenty criteria, every one evidenced</dt>
              <dd className="text-[var(--color-muted)]">
                A point is only awarded on confirmed evidence — never on a guess.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">What it cannot prove, it asks</dt>
              <dd className="text-[var(--color-muted)]">
                Anything uncertain becomes a one-line question in the review queue.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Budget recommendations that show their working</dt>
              <dd className="text-[var(--color-muted)]">
                Every input to the Google Ads and LSA figures is printed on the report.
              </dd>
            </div>
          </dl>
        </div>

        <p className="text-xs text-[var(--color-muted)]">
          For automotive repair shops · Shop Marketing Pros
        </p>
      </section>

      {/* ------------------------------------------------------- the form */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <LoginForm
          googleEnabled={googleConfigured()}
          guestEnabled={guestsAllowed()}
          signupEnabled={signupsAllowed()}
          isFirstRun={isFirstRun}
          initialError={error ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null}
          nextPath={next ?? null}
        />
      </section>
    </main>
  );
}
