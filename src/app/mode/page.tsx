import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getReadiness } from "@/lib/readiness";
import { ModePicker } from "./mode-picker";

export const dynamic = "force-dynamic";

/**
 * The one and only place the live/mock switch is offered.
 *
 * Once a mode is on the session it is fixed until sign-out, so this page
 * redirects away rather than letting anyone reopen the question mid-session.
 */
export default async function ModePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getAuth();
  if (!auth) redirect("/login");

  const { next } = await searchParams;
  if (auth.mode) redirect(auth.user.onboardedAt ? (next ?? "/") : "/onboarding");

  const readiness = getReadiness();
  return (
    <ModePicker
      readiness={readiness}
      userName={auth.user.name ?? "there"}
      role={auth.user.role}
      nextPath={next ?? null}
    />
  );
}
