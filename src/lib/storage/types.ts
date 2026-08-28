import type {
  AdsBudgetCard,
  DmiRun,
  Prospect,
  ReviewItem,
  TrackingRow,
} from "@/lib/types";

export interface Store {
  driver: "supabase" | "local";

  upsertProspect(p: Prospect): Promise<Prospect>;
  getProspect(id: string): Promise<Prospect | null>;
  findProspectByEmail(email: string): Promise<Prospect | null>;

  createRun(run: DmiRun): Promise<DmiRun>;
  saveRun(run: DmiRun): Promise<DmiRun>;
  getRun(id: string): Promise<DmiRun | null>;
  findRunByIdempotencyKey(key: string): Promise<DmiRun | null>;
  listRuns(limit?: number): Promise<DmiRun[]>;
  /** Runs that are queued, or stuck mid-flight past `staleMs`. */
  claimableRuns(staleMs: number): Promise<DmiRun[]>;

  addReviewItems(items: ReviewItem[]): Promise<void>;
  listReviewItems(filter?: { runId?: string; status?: string }): Promise<ReviewItem[]>;
  updateReviewItem(id: string, patch: Partial<ReviewItem>): Promise<ReviewItem | null>;

  upsertTrackingRow(row: TrackingRow): Promise<TrackingRow>;
  getTrackingRowByRun(runId: string): Promise<TrackingRow | null>;
  listTrackingRows(): Promise<TrackingRow[]>;

  upsertBudgetCard(card: AdsBudgetCard): Promise<AdsBudgetCard>;
  getBudgetCardByRun(runId: string): Promise<AdsBudgetCard | null>;
}
