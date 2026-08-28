import type { AuthAttempt, PasswordReset, Session, User } from "@/lib/auth/types";
import type {
  AdsBudgetCard,
  DmiRun,
  Prospect,
  ReviewItem,
  TrackingRow,
} from "@/lib/types";

export interface Store {
  driver: "supabase" | "local";

  /* ------------------------------------------------------------ accounts */
  upsertUser(u: User): Promise<User>;
  getUser(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  countUsers(): Promise<number>;
  listUsers(): Promise<User[]>;

  /* ------------------------------------------------------------ sessions */
  createSession(s: Session): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  updateSession(id: string, patch: Partial<Session>): Promise<Session | null>;
  revokeSession(id: string): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;

  /* -------------------------------------------------------- rate limiting */
  addAuthAttempt(a: AuthAttempt): Promise<void>;
  recentAuthAttempts(key: string, sinceIso: string): Promise<AuthAttempt[]>;

  /* --------------------------------------------------------- password reset */
  createPasswordReset(r: PasswordReset): Promise<PasswordReset>;
  getPasswordResetByHash(tokenHash: string): Promise<PasswordReset | null>;
  markPasswordResetUsed(id: string): Promise<void>;
  /** Retires every outstanding reset for a user without deleting the audit trail. */
  invalidatePasswordResets(userId: string): Promise<void>;

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
