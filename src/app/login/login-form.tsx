"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button, Callout, Input } from "@/components/ui";

type Tab = "signin" | "signup";

export function LoginForm({
  googleEnabled,
  guestEnabled,
  signupEnabled,
  isFirstRun,
  initialError,
  nextPath,
}: {
  googleEnabled: boolean;
  guestEnabled: boolean;
  signupEnabled: boolean;
  isFirstRun: boolean;
  initialError: string | null;
  nextPath: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(isFirstRun && signupEnabled ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [problems, setProblems] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setProblems([]);

    const url = tab === "signin" ? "/api/auth/login" : "/api/auth/signup";
    const body = tab === "signin" ? { email, password } : { email, password, name };
    const res = await apiPost<{ next: string }>(url, body);

    if (!res.ok) {
      setError(res.error);
      const p = (res.data as { problems?: string[] } | null)?.problems;
      if (p) setProblems(p);
      setBusy(false);
      return;
    }
    // Mode is chosen next; `next` is preserved through it.
    const dest = res.data?.next ?? "/mode";
    router.push(nextPath ? `${dest}?next=${encodeURIComponent(nextPath)}` : dest);
    router.refresh();
  }

  async function guest() {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ next: string }>("/api/auth/guest", {});
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.push(res.data?.next ?? "/onboarding");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <h2 className="text-2xl font-bold tracking-tight">
        {tab === "signin" ? "Sign in" : isFirstRun ? "Create the first account" : "Create an account"}
      </h2>
      <p className="mt-1.5 text-sm text-[var(--color-muted)]">
        {isFirstRun && tab === "signup"
          ? "No accounts exist yet, so this one becomes the admin."
          : "You will choose live or mock mode on the next screen."}
      </p>

      {error && (
        <div className="mt-5">
          <Callout tone="danger" title="Could not sign in">
            {error}
            {problems.length > 0 && (
              <ul className="mt-1.5 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Callout>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        {tab === "signup" && (
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
              Your name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Ray Miller"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email address
          </label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@shopmarketingpros.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            placeholder={tab === "signup" ? "At least 12 characters" : ""}
          />
          {tab === "signup" && (
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
              Length matters more than symbols. Three or four unrelated words beat
              &ldquo;P@ssw0rd!&rdquo;.
            </p>
          )}
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Working…" : tab === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {(googleEnabled || guestEnabled) && (
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-line)]" />
          <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">or</span>
          <span className="h-px flex-1 bg-[var(--color-line)]" />
        </div>
      )}

      <div className="space-y-3">
        {googleEnabled && (
          // A plain link, not fetch: OAuth needs a full top-level navigation.
          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--color-brand)]"
          >
            <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
            </svg>
            Continue with Google
          </a>
        )}

        {guestEnabled && (
          <Button variant="secondary" onClick={guest} disabled={busy} className="w-full">
            Continue as a guest
          </Button>
        )}
        {guestEnabled && (
          <p className="text-center text-xs text-[var(--color-muted)]">
            Guests explore the sample inspections in mock mode. No live data, no saved changes.
          </p>
        )}
      </div>

      {signupEnabled && (
        <p className="mt-8 text-center text-sm text-[var(--color-muted)]">
          {tab === "signin" ? "No account yet?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setTab(tab === "signin" ? "signup" : "signin");
              setError(null);
              setProblems([]);
            }}
            className="font-semibold text-[var(--color-brand)] hover:underline"
          >
            {tab === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      )}
    </div>
  );
}
