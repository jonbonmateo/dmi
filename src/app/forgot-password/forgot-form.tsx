"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { Button, Callout, Input } from "@/components/ui";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost<{ message: string; devLink: string | null }>("/api/auth/forgot", { email });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSent(res.data?.message ?? "If that address has an account, a reset link is on its way.");
    setDevLink(res.data?.devLink ?? null);
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-[var(--color-muted)]">
        Enter the email address on your account and we&rsquo;ll send a link to set a new password.
      </p>

      {error && (
        <div className="mt-5">
          <Callout tone="danger" title="Could not send the reset link">
            {error}
          </Callout>
        </div>
      )}

      {sent ? (
        <div className="mt-6">
          <Callout tone="success" title="Check your email">
            {sent}
          </Callout>
          {devLink && (
            <div className="mt-4">
              <Callout tone="warn" title="Dev/demo mode: no email provider is configured">
                This deployment has DMI_DEV_RESET_LINKS enabled, which is only safe on a private
                test instance. Here is the link directly:
                <div className="mt-2 break-all rounded-lg bg-[var(--color-raised)] p-3 text-xs">
                  <Link href={devLink} className="font-medium text-[var(--color-brand)] hover:underline">
                    {devLink}
                  </Link>
                </div>
              </Callout>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
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
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-[var(--color-muted)]">
        <Link href="/login" className="font-semibold text-[var(--color-brand)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
