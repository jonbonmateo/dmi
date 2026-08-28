/**
 * Supabase (Postgres) store. Uses the service-role key, so this module must
 * only ever be imported from server code.
 *
 * Column names are snake_case in Postgres and camelCase in the app; the two
 * `toRow`/`fromRow` helpers per table are the only place that mapping lives.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { AuthAttempt, PasswordReset, Session, User } from "@/lib/auth/types";
import type {
  AdsBudgetCard,
  DmiRun,
  Prospect,
  ReviewItem,
  TrackingRow,
} from "@/lib/types";
import type { Store } from "./types";

function client(): SupabaseClient {
  return createClient(env.supabaseUrl!, env.supabaseServiceKey!, {
    auth: { persistSession: false },
  });
}

 

const userToRow = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  provider: u.provider,
  password_hash: u.passwordHash,
  avatar_url: u.avatarUrl,
  onboarded_at: u.onboardedAt,
  disabled_at: u.disabledAt,
  last_login_at: u.lastLoginAt,
  created_at: u.createdAt,
});

const userFromRow = (r: any): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  provider: r.provider,
  passwordHash: r.password_hash,
  avatarUrl: r.avatar_url,
  onboardedAt: r.onboarded_at,
  disabledAt: r.disabled_at,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
});

const sessionToRow = (s: Session) => ({
  id: s.id,
  user_id: s.userId,
  mode: s.mode,
  csrf_secret: s.csrfSecret,
  ip: s.ip,
  user_agent: s.userAgent,
  created_at: s.createdAt,
  expires_at: s.expiresAt,
  last_seen_at: s.lastSeenAt,
  revoked_at: s.revokedAt,
});

const sessionFromRow = (r: any): Session => ({
  id: r.id,
  userId: r.user_id,
  mode: r.mode,
  csrfSecret: r.csrf_secret,
  ip: r.ip,
  userAgent: r.user_agent,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  lastSeenAt: r.last_seen_at,
  revokedAt: r.revoked_at,
});

const attemptToRow = (a: AuthAttempt) => ({
  id: a.id,
  key: a.key,
  ip: a.ip,
  success: a.success,
  reason: a.reason,
  at: a.at,
});

const attemptFromRow = (r: any): AuthAttempt => ({
  id: r.id,
  key: r.key,
  ip: r.ip,
  success: r.success,
  reason: r.reason,
  at: r.at,
});

const resetToRow = (r: PasswordReset) => ({
  id: r.id,
  user_id: r.userId,
  token_hash: r.tokenHash,
  created_at: r.createdAt,
  expires_at: r.expiresAt,
  used_at: r.usedAt,
  ip: r.ip,
});

const resetFromRow = (r: any): PasswordReset => ({
  id: r.id,
  userId: r.user_id,
  tokenHash: r.token_hash,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  usedAt: r.used_at,
  ip: r.ip,
});

const prospectToRow = (p: Prospect) => ({
  id: p.id,
  first_name: p.firstName,
  last_name: p.lastName,
  email: p.email,
  phone: p.phone,
  shop_name: p.shopName,
  website_url: p.websiteUrl,
  meeting_type: p.meetingType,
  discovery_call_at: p.discoveryCallAt,
  heard_about_us: p.heardAboutUs,
  marketing_pain_point: p.marketingPainPoint,
  ghl_contact_id: p.ghlContactId,
  ghl_opportunity_id: p.ghlOpportunityId,
  extra: p.extra,
  created_at: p.createdAt,
});

const prospectFromRow = (r: any): Prospect => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  phone: r.phone,
  shopName: r.shop_name,
  websiteUrl: r.website_url,
  meetingType: r.meeting_type,
  discoveryCallAt: r.discovery_call_at,
  heardAboutUs: r.heard_about_us,
  marketingPainPoint: r.marketing_pain_point,
  ghlContactId: r.ghl_contact_id,
  ghlOpportunityId: r.ghl_opportunity_id,
  extra: r.extra ?? {},
  createdAt: r.created_at,
});

const runToRow = (r: DmiRun) => ({
  id: r.id,
  prospect_id: r.prospectId,
  state: r.state,
  idempotency_key: r.idempotencyKey,
  inspection_date: r.inspectionDate,
  mode: r.mode,
  verification: r.verification,
  categories: r.categories,
  budgets: r.budgets,
  total_score: r.totalScore,
  potential_total_score: r.potentialTotalScore,
  classification: r.classification,
  steps: r.steps,
  errors: r.errors,
  report_url: r.reportUrl,
  publish: r.publish,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
  completed_at: r.completedAt,
});

const runFromRow = (r: any): DmiRun => ({
  id: r.id,
  prospectId: r.prospect_id,
  state: r.state,
  idempotencyKey: r.idempotency_key,
  inspectionDate: r.inspection_date,
  mode: r.mode,
  verification: r.verification,
  categories: r.categories ?? [],
  budgets: r.budgets ?? [],
  totalScore: r.total_score ?? 0,
  potentialTotalScore: r.potential_total_score ?? 0,
  classification: r.classification,
  steps: r.steps ?? [],
  errors: r.errors ?? [],
  reportUrl: r.report_url,
  publish: r.publish,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
});

const reviewToRow = (i: ReviewItem) => ({
  id: i.id,
  run_id: i.runId,
  finding_id: i.findingId,
  category: i.category,
  reason: i.reason,
  question: i.question,
  instruction: i.instruction,
  status: i.status,
  resolution: i.resolution,
  resolved_by: i.resolvedBy,
  resolved_at: i.resolvedAt,
  created_at: i.createdAt,
});

const reviewFromRow = (r: any): ReviewItem => ({
  id: r.id,
  runId: r.run_id,
  findingId: r.finding_id,
  category: r.category,
  reason: r.reason,
  question: r.question,
  instruction: r.instruction,
  status: r.status,
  resolution: r.resolution,
  resolvedBy: r.resolved_by,
  resolvedAt: r.resolved_at,
  createdAt: r.created_at,
});

const trackingToRow = (t: TrackingRow) => ({
  id: t.id,
  run_id: t.runId,
  prospect_id: t.prospectId,
  shop_name: t.shopName,
  website_url: t.websiteUrl,
  contact_name: t.contactName,
  email: t.email,
  phone: t.phone,
  discovery_call_at: t.discoveryCallAt,
  inspection_date: t.inspectionDate,
  total_score: t.totalScore,
  classification: t.classification,
  dmi_link: t.dmiLink,
  week_of: t.weekOf,
  weekly_status: t.weeklyStatus,
  updated_at: t.updatedAt,
});

const trackingFromRow = (r: any): TrackingRow => ({
  id: r.id,
  runId: r.run_id,
  prospectId: r.prospect_id,
  shopName: r.shop_name,
  websiteUrl: r.website_url,
  contactName: r.contact_name,
  email: r.email,
  phone: r.phone,
  discoveryCallAt: r.discovery_call_at,
  inspectionDate: r.inspection_date,
  totalScore: r.total_score,
  classification: r.classification,
  dmiLink: r.dmi_link,
  weekOf: r.week_of,
  weeklyStatus: r.weekly_status,
  updatedAt: r.updated_at,
});

const cardToRow = (c: AdsBudgetCard) => ({
  id: c.id,
  run_id: c.runId,
  shop_name: c.shopName,
  google_ads_monthly_usd: c.googleAdsMonthlyUsd,
  local_services_monthly_usd: c.localServicesMonthlyUsd,
  total_monthly_usd: c.totalMonthlyUsd,
  rationale: c.rationale,
  created_at: c.createdAt,
});

const cardFromRow = (r: any): AdsBudgetCard => ({
  id: r.id,
  runId: r.run_id,
  shopName: r.shop_name,
  googleAdsMonthlyUsd: r.google_ads_monthly_usd,
  localServicesMonthlyUsd: r.local_services_monthly_usd,
  totalMonthlyUsd: r.total_monthly_usd,
  rationale: r.rationale,
  createdAt: r.created_at,
});

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`supabase: ${res.error.message}`);
  return res.data as T;
}

export class SupabaseStore implements Store {
  driver = "supabase" as const;
  private db = client();

  /* ------------------------------------------------------------ accounts */
  async upsertUser(u: User) {
    const data = unwrap(
      await this.db.from("dmi_users").upsert(userToRow(u)).select().single(),
    );
    return userFromRow(data);
  }
  async getUser(id: string) {
    const { data } = await this.db.from("dmi_users").select().eq("id", id).maybeSingle();
    return data ? userFromRow(data) : null;
  }
  async findUserByEmail(email: string) {
    const { data } = await this.db
      .from("dmi_users")
      .select()
      .ilike("email", email)
      .maybeSingle();
    return data ? userFromRow(data) : null;
  }
  async countUsers() {
    // Guests are excluded so the first real signup still becomes admin.
    const { count } = await this.db
      .from("dmi_users")
      .select("id", { count: "exact", head: true })
      .neq("role", "guest");
    return count ?? 0;
  }
  async listUsers() {
    const { data } = await this.db.from("dmi_users").select().order("created_at");
    return (data ?? []).map(userFromRow);
  }

  /* ------------------------------------------------------------ sessions */
  async createSession(s: Session) {
    const data = unwrap(
      await this.db.from("dmi_sessions").insert(sessionToRow(s)).select().single(),
    );
    return sessionFromRow(data);
  }
  async getSession(id: string) {
    const { data } = await this.db.from("dmi_sessions").select().eq("id", id).maybeSingle();
    return data ? sessionFromRow(data) : null;
  }
  async updateSession(id: string, patch: Partial<Session>) {
    const row: Record<string, unknown> = {};
    if (patch.mode !== undefined) row.mode = patch.mode;
    if (patch.lastSeenAt !== undefined) row.last_seen_at = patch.lastSeenAt;
    if (patch.revokedAt !== undefined) row.revoked_at = patch.revokedAt;
    if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
    const { data } = await this.db
      .from("dmi_sessions")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();
    return data ? sessionFromRow(data) : null;
  }
  async revokeSession(id: string) {
    await this.db.from("dmi_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  }
  async revokeUserSessions(userId: string) {
    await this.db
      .from("dmi_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);
  }

  /* -------------------------------------------------------- rate limiting */
  async addAuthAttempt(a: AuthAttempt) {
    unwrap(await this.db.from("dmi_auth_attempts").insert(attemptToRow(a)).select());
  }
  async recentAuthAttempts(key: string, sinceIso: string) {
    const { data } = await this.db
      .from("dmi_auth_attempts")
      .select()
      .eq("key", key.toLowerCase())
      .gte("at", sinceIso)
      .order("at", { ascending: false })
      .limit(50);
    return (data ?? []).map(attemptFromRow);
  }

  /* --------------------------------------------------------- password reset */
  async createPasswordReset(r: PasswordReset) {
    const data = unwrap(
      await this.db.from("dmi_password_resets").insert(resetToRow(r)).select().single(),
    );
    return resetFromRow(data);
  }
  async getPasswordResetByHash(tokenHash: string) {
    const { data } = await this.db
      .from("dmi_password_resets")
      .select()
      .eq("token_hash", tokenHash)
      .maybeSingle();
    return data ? resetFromRow(data) : null;
  }
  async markPasswordResetUsed(id: string) {
    await this.db
      .from("dmi_password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("id", id);
  }
  async invalidatePasswordResets(userId: string) {
    await this.db
      .from("dmi_password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("used_at", null);
  }

  async upsertProspect(p: Prospect) {
    const data = unwrap(
      await this.db
        .from("dmi_prospects")
        .upsert(prospectToRow(p))
        .select()
        .single(),
    );
    return prospectFromRow(data);
  }
  async getProspect(id: string) {
    const { data } = await this.db
      .from("dmi_prospects")
      .select()
      .eq("id", id)
      .maybeSingle();
    return data ? prospectFromRow(data) : null;
  }
  async findProspectByEmail(email: string) {
    const { data } = await this.db
      .from("dmi_prospects")
      .select()
      .ilike("email", email)
      .maybeSingle();
    return data ? prospectFromRow(data) : null;
  }

  async createRun(run: DmiRun) {
    const data = unwrap(
      await this.db.from("dmi_runs").insert(runToRow(run)).select().single(),
    );
    return runFromRow(data);
  }
  async saveRun(run: DmiRun) {
    run.updatedAt = new Date().toISOString();
    const data = unwrap(
      await this.db.from("dmi_runs").upsert(runToRow(run)).select().single(),
    );
    return runFromRow(data);
  }
  async getRun(id: string) {
    const { data } = await this.db
      .from("dmi_runs")
      .select()
      .eq("id", id)
      .maybeSingle();
    return data ? runFromRow(data) : null;
  }
  async findRunByIdempotencyKey(key: string) {
    const { data } = await this.db
      .from("dmi_runs")
      .select()
      .eq("idempotency_key", key)
      .maybeSingle();
    return data ? runFromRow(data) : null;
  }
  async listRuns(limit = 100) {
    const { data } = await this.db
      .from("dmi_runs")
      .select()
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map(runFromRow);
  }
  async claimableRuns(staleMs: number) {
    const cutoff = new Date(Date.now() - staleMs).toISOString();
    const { data } = await this.db
      .from("dmi_runs")
      .select()
      .or(
        `state.eq.queued,and(state.in.(running,failed),updated_at.lt.${cutoff})`,
      )
      .limit(25);
    return (data ?? [])
      .map(runFromRow)
      .filter((r) => r.errors.filter((e) => e.fatal).length < 3);
  }

  async addReviewItems(items: ReviewItem[]) {
    if (items.length === 0) return;
    // ignoreDuplicates keeps human resolutions intact on a re-run.
    unwrap(
      await this.db
        .from("dmi_review_items")
        .upsert(items.map(reviewToRow), { ignoreDuplicates: true })
        .select(),
    );
  }
  async listReviewItems(filter?: { runId?: string; status?: string }) {
    let q = this.db.from("dmi_review_items").select();
    if (filter?.runId) q = q.eq("run_id", filter.runId);
    if (filter?.status) q = q.eq("status", filter.status);
    const { data } = await q.order("created_at", { ascending: false });
    return (data ?? []).map(reviewFromRow);
  }
  async updateReviewItem(id: string, patch: Partial<ReviewItem>) {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.resolution !== undefined) row.resolution = patch.resolution;
    if (patch.resolvedBy !== undefined) row.resolved_by = patch.resolvedBy;
    if (patch.resolvedAt !== undefined) row.resolved_at = patch.resolvedAt;
    const { data } = await this.db
      .from("dmi_review_items")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();
    return data ? reviewFromRow(data) : null;
  }

  async upsertTrackingRow(row: TrackingRow) {
    const data = unwrap(
      await this.db
        .from("dmi_tracking_rows")
        .upsert(trackingToRow(row), { onConflict: "run_id" })
        .select()
        .single(),
    );
    return trackingFromRow(data);
  }
  async getTrackingRowByRun(runId: string) {
    const { data } = await this.db
      .from("dmi_tracking_rows")
      .select()
      .eq("run_id", runId)
      .maybeSingle();
    return data ? trackingFromRow(data) : null;
  }
  async listTrackingRows() {
    const { data } = await this.db
      .from("dmi_tracking_rows")
      .select()
      .order("updated_at", { ascending: false });
    return (data ?? []).map(trackingFromRow);
  }

  async upsertBudgetCard(card: AdsBudgetCard) {
    const data = unwrap(
      await this.db
        .from("dmi_budget_cards")
        .upsert(cardToRow(card), { onConflict: "run_id" })
        .select()
        .single(),
    );
    return cardFromRow(data);
  }
  async getBudgetCardByRun(runId: string) {
    const { data } = await this.db
      .from("dmi_budget_cards")
      .select()
      .eq("run_id", runId)
      .maybeSingle();
    return data ? cardFromRow(data) : null;
  }
}
