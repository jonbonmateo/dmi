"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button, Callout, Input } from "@/components/ui";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <Callout tone="danger" title="Missing reset link">
          This page needs the link from your password-reset email.
        </Callout>
        <p className="mt-6 text-center text-sm">
          <Link href="/forgot-password" className="font-semibold text-[var(--color-brand)] hover:underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setProblems([]);
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await apiPost<{ next: string }>("/api/auth/reset", { token, password });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      const p = (res.data as { problems?: string[] } | null)?.problems;
      if (p) setProblems(p);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (done) {
    return (
      <div className="w-full max-w-sm">
        <Callout tone="success" title="Password updated">
          Every existing session on this account was signed out for safety. Redirecting you to sign
          in…
        </Callout>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
      <p className="mt-1.5 text-sm text-[var(--color-muted)]">
        This link is single-use and expires an hour after it was sent.
      </p>

      {error && (
        <div className="mt-5">
          <Callout tone="danger" title="Could not reset the password">
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
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            New password
          </label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 12 characters"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">
            Confirm new password
          </label>
          <Input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Saving…" : "Set new password"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-[var(--color-muted)]">
        <Link href="/login" className="font-semibold text-[var(--color-brand)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
