import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getStore } from "@/lib/storage";
import { getReadiness } from "@/lib/readiness";
import { Tour } from "./tour";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mode) redirect("/mode");

  const store = getStore();
  const [runs, open] = await Promise.all([
    store.listRuns(5),
    store.listReviewItems({ status: "open" }),
  ]);
  const sample = runs[0] ?? null;

  return (
    <Tour
      mode={auth.mode}
      userName={auth.user.name ?? "there"}
      role={auth.user.role}
      hasRuns={runs.length > 0}
      sampleRunId={sample?.id ?? null}
      openReviewCount={open.length}
      liveCoverage={getReadiness().liveCoveragePercent}
      alreadyOnboarded={Boolean(auth.user.onboardedAt)}
    />
  );
}
