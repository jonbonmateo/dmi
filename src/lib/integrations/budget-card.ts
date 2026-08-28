/**
 * The Ads Budget Card.
 *
 * In the manual process this is a card in the team's board carrying the two
 * recommended budgets and the reasoning. Here it is a row in
 * `dmi_budget_cards` plus an optional Zapier push to whatever board the team
 * actually uses (Trello, GoHighLevel opportunity, Notion — the hook decides).
 */
import { env } from "@/lib/env";
import { getStore } from "@/lib/storage";
import { newId } from "@/lib/pipeline/context";
import type { Ctx } from "@/lib/pipeline/context";
import type { AdsBudgetCard, EvidenceStatus } from "@/lib/types";

export async function createBudgetCard(
  ctx: Ctx,
): Promise<{ status: EvidenceStatus; id: string | null; note: string }> {
  const store = getStore();
  const { run, prospect } = ctx;
  const google = run.budgets.find((b) => b.channel === "google_ads");
  const lsa = run.budgets.find((b) => b.channel === "local_services_ads");

  const existing = await store.getBudgetCardByRun(run.id);
  const total =
    google?.monthlyUsd !== null && google?.monthlyUsd !== undefined && lsa?.monthlyUsd !== null && lsa?.monthlyUsd !== undefined
      ? google.monthlyUsd + lsa.monthlyUsd
      : null;

  const card: AdsBudgetCard = {
    id: existing?.id ?? newId("card"),
    runId: run.id,
    shopName: prospect.shopName,
    googleAdsMonthlyUsd: google?.monthlyUsd ?? null,
    localServicesMonthlyUsd: lsa?.monthlyUsd ?? null,
    totalMonthlyUsd: total,
    rationale: [google?.rationale, lsa?.rationale].filter(Boolean).join("\n\n"),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await store.upsertBudgetCard(card);

  if (total === null) {
    return {
      status: "requires_human_review",
      id: card.id,
      note: `Budget card ${card.id} created without numbers — the model could not produce a defensible recommendation. See the advertising review queue.`,
    };
  }

  if (!env.zapierBudgetCardWebhook) {
    return {
      status: "confirmed",
      id: card.id,
      note: `Ads Budget Card ${card.id} saved to the ${store.driver} store: $${card.googleAdsMonthlyUsd}/mo Google Ads + $${card.localServicesMonthlyUsd}/mo LSA = $${total}/mo. ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL is not set, so no external card was created.`,
    };
  }

  try {
    const res = await fetch(env.zapierBudgetCardWebhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        card_id: card.id,
        run_id: run.id,
        shop_name: card.shopName,
        contact_email: prospect.email,
        google_ads_monthly_usd: card.googleAdsMonthlyUsd,
        local_services_monthly_usd: card.localServicesMonthlyUsd,
        total_monthly_usd: card.totalMonthlyUsd,
        dmi_link: run.reportUrl,
        dmi_score: run.totalScore,
        classification: run.classification,
        rationale: card.rationale,
      }),
    });
    if (!res.ok) {
      return { status: "unable_to_evaluate", id: card.id, note: `Card saved locally, but the Zapier budget-card hook returned HTTP ${res.status}.` };
    }
    return {
      status: "confirmed",
      id: card.id,
      note: `Ads Budget Card ${card.id} created: $${card.googleAdsMonthlyUsd}/mo Google Ads + $${card.localServicesMonthlyUsd}/mo LSA = $${total}/mo.`,
    };
  } catch (e) {
    return {
      status: "unable_to_evaluate",
      id: card.id,
      note: `Card saved locally, but the Zapier budget-card hook failed: ${e instanceof Error ? e.message : String(e)}.`,
    };
  }
}
