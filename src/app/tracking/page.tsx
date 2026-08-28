import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getStore } from "@/lib/storage";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui";
import { TrackingTable, type TrackingRowView } from "./tracking-table";

export const dynamic = "force-dynamic";

/** The DMI Tracking Spreadsheet, as the team knows it — sortable and filterable. */
export default async function TrackingPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mode) redirect("/mode");

  const store = getStore();
  const [rowsRaw, open] = await Promise.all([
    store.listTrackingRows(),
    store.listReviewItems({ status: "open" }),
  ]);

  const rows: TrackingRowView[] = rowsRaw.map((t) => ({
    id: t.id,
    runId: t.runId,
    shopName: t.shopName,
    contactName: t.contactName,
    email: t.email,
    phone: t.phone,
    websiteUrl: t.websiteUrl,
    discoveryCallAt: t.discoveryCallAt,
    inspectionDate: t.inspectionDate,
    totalScore: t.totalScore,
    classification: t.classification,
    dmiLink: t.dmiLink,
    weekOf: t.weekOf,
    weeklyStatus: t.weeklyStatus,
  }));

  const completed = rows.filter((r) => r.weeklyStatus === "Completed").length;

  return (
    <AppShell auth={auth} active="tracking" openReviews={open.length}>
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Tracking sheet</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-[var(--color-ink-soft)]">
          The DMI tracking spreadsheet, kept in the database so it has an audit trail. A week flips to
          Completed on its own when the last review question is answered.
          {rows.length > 0 && (
            <>
              {" "}
              <strong>
                {completed} of {rows.length}
              </strong>{" "}
              complete.
            </>
          )}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No tracking rows yet">
          A row is created automatically when an inspection finishes.
        </EmptyState>
      ) : (
        <TrackingTable rows={rows} />
      )}
    </AppShell>
  );
}
