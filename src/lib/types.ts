/**
 * Core domain types for the Digital Marketing Inspection (DMI).
 *
 * The single most important rule encoded here: a criterion is only worth a
 * point when we have *confirmed* evidence that it passes. Anything we could
 * not determine is surfaced explicitly rather than guessed at.
 */

export type CategoryKey = "website" | "seo" | "advertising" | "social";

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  website: "Website",
  seo: "Search Engine Optimization",
  advertising: "Digital Advertising",
  social: "Social Media",
};

/** How reliable the evidence behind a finding is. */
export type EvidenceStatus =
  | "confirmed" // we saw it, first-hand, and recorded the evidence
  | "not_found" // we looked in the expected places and it is not there
  | "unable_to_evaluate" // blocked, no API, rate limited, JS-only page, etc.
  | "requires_human_review" // a person must look (e.g. a phone call, judgement call)
  | "conflicting_information"; // sources disagree with each other or with intake

/** Whether the criterion is met. `undetermined` never earns a point. */
export type Outcome = "pass" | "fail" | "undetermined";

export type EvidenceKind =
  | "url"
  | "observed_value"
  | "api_response"
  | "screenshot"
  | "html_excerpt"
  | "reasoning"
  | "manual_note";

export interface Evidence {
  kind: EvidenceKind;
  label: string;
  /** Where the observation came from (page URL, API endpoint, etc.). */
  source?: string;
  /** The observed value, quote, or extracted field. */
  value?: string;
  /** ISO timestamp of when this was observed. */
  checkedAt: string;
  /** Path/URL to a stored screenshot, if any. */
  screenshotUrl?: string;
}

export interface Finding {
  /** Stable id, e.g. "website.1" — used for idempotency and human overrides. */
  id: string;
  category: CategoryKey;
  /** 1-5 within the category. */
  index: number;
  /** Plain-English criterion as it appears on the DMI form. */
  criterion: string;
  outcome: Outcome;
  status: EvidenceStatus;
  /** 0..1, how sure the automation is. Informational; does not affect scoring. */
  confidence: number;
  /** One or two sentences a salesperson can read out loud. */
  summary: string;
  /** Why the point was awarded or withheld. */
  reasoning: string;
  evidence: Evidence[];
  /** Set when a human has overridden the automated outcome. */
  humanOverride?: {
    outcome: Outcome;
    note: string;
    by: string;
    at: string;
  };
}

export interface CategoryResult {
  category: CategoryKey;
  findings: Finding[];
  /** Points confidently earned (0-5). */
  score: number;
  /** Points that could still be earned if the undetermined items pass (0-5). */
  potentialScore: number;
  /** Category-level captured fields shown on the report. */
  captured: Record<string, string | null>;
  notes: string[];
}

export type Classification = "red" | "yellow" | "green";

export interface BudgetRecommendation {
  channel: "google_ads" | "local_services_ads";
  /** Monthly USD. Null when we could not build a defensible estimate. */
  monthlyUsd: number | null;
  low: number | null;
  high: number | null;
  status: EvidenceStatus;
  /** Human-readable derivation, including every input used. */
  rationale: string;
  inputs: Record<string, string | number | null>;
}

export interface BusinessVerification {
  /** Did we convince ourselves the data we gathered is about THIS shop? */
  status: EvidenceStatus;
  confidence: number;
  matchedName: string | null;
  matchedAddress: string | null;
  matchedPhone: string | null;
  websiteResolvedUrl: string | null;
  signals: string[];
  conflicts: string[];
  /** Other businesses with confusingly similar names/locations. */
  ambiguities: string[];
  /** More than one location detected for this brand. */
  multipleLocations: boolean;
  locations: string[];
}

export interface Prospect {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  shopName: string;
  websiteUrl: string | null;
  meetingType: string | null;
  discoveryCallAt: string | null;
  heardAboutUs: string | null;
  marketingPainPoint: string | null;
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  /** Anything else the discovery-call form collected. */
  extra: Record<string, unknown>;
  createdAt: string;
}

export type RunState =
  | "queued"
  | "running"
  | "needs_review"
  | "completed"
  | "failed";

export type StepName =
  | "verify_business"
  | "website"
  | "seo"
  | "advertising"
  | "social"
  | "score"
  | "budget"
  | "publish";

export const STEP_ORDER: StepName[] = [
  "verify_business",
  "website",
  "seo",
  "advertising",
  "social",
  "score",
  "budget",
  "publish",
];

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StepRecord {
  step: StepName;
  status: StepStatus;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  /** Cached output so a resumed run does not redo completed work. */
  output: unknown;
}

export interface ReviewItem {
  id: string;
  runId: string;
  findingId: string | null;
  category: CategoryKey | "run";
  reason: string;
  question: string;
  /** What the reviewer should do, in plain English. */
  instruction: string;
  status: "open" | "resolved" | "dismissed";
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface RunError {
  at: string;
  step: StepName | "intake" | "publish";
  message: string;
  detail?: string;
  fatal: boolean;
}

export interface DmiRun {
  id: string;
  prospectId: string;
  state: RunState;
  /** Hash of (shopName + website + call date) used to avoid duplicate DMIs. */
  idempotencyKey: string;
  inspectionDate: string;
  /** Which mode produced this run. Fixed at intake; never edited. */
  mode: "live" | "mock";
  verification: BusinessVerification | null;
  categories: CategoryResult[];
  budgets: BudgetRecommendation[];
  totalScore: number;
  potentialTotalScore: number;
  classification: Classification | null;
  steps: StepRecord[];
  errors: RunError[];
  reportUrl: string | null;
  publish: PublishResult | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PublishResult {
  trackingRow: { status: EvidenceStatus; id: string | null; note: string };
  ghlContact: { status: EvidenceStatus; id: string | null; note: string };
  ghlNote: { status: EvidenceStatus; id: string | null; note: string };
  adsBudgetCard: { status: EvidenceStatus; id: string | null; note: string };
  weeklyStatus: { status: EvidenceStatus; value: string; note: string };
}

export interface TrackingRow {
  id: string;
  runId: string;
  prospectId: string;
  shopName: string;
  websiteUrl: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  discoveryCallAt: string | null;
  inspectionDate: string;
  totalScore: number | null;
  classification: Classification | null;
  dmiLink: string | null;
  weekOf: string;
  weeklyStatus: "Not Started" | "In Progress" | "Completed" | "Needs Review";
  updatedAt: string;
}

export interface AdsBudgetCard {
  id: string;
  runId: string;
  shopName: string;
  googleAdsMonthlyUsd: number | null;
  localServicesMonthlyUsd: number | null;
  totalMonthlyUsd: number | null;
  rationale: string;
  createdAt: string;
}
