import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";

/**
 * No `getAuth` redirect here, deliberately: a reset link can arrive while the
 * browser still holds an old, soon-to-be-revoked session, or none at all, and
 * both cases should reach the same form.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6 sm:p-12">
      <ResetPasswordForm token={token ?? null} />
    </main>
  );
}
