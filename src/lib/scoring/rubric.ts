import type {
  CategoryKey,
  CategoryResult,
  Classification,
  Evidence,
  Finding,
  Outcome,
  EvidenceStatus,
} from "@/lib/types";

/** The twenty criteria, worded as they appear on the manual DMI form. */
export const CRITERIA: Record<CategoryKey, string[]> = {
  website: [
    "Logo, shop name, location and contact information are easy to find, and the site has a professional, custom design that reflects the shop's brand.",
    "The site is clean, readable and easy to navigate, and offers an ADA accessibility option or comparable accessibility support.",
    "A clear call to action is visible immediately on the homepage and used consistently throughout the site.",
    "The site uses authentic photos or video of the shop, team or work rather than relying primarily on stock imagery.",
    "The site works on mobile, tablet and desktop and performs acceptably (benchmark: mobile and desktop performance score of at least 80).",
  ],
  seo: [
    "The site has a properly formatted blog updated at least monthly.",
    "The site has individual service pages with original content and appropriate internal or external links.",
    "Pages have a consistent on-page SEO structure: relevant titles, meta descriptions, headings and image alt text.",
    "The Google Business Profile is substantially optimised and updated at least weekly.",
    "Local citation information is reasonably accurate and consistent (benchmark: citation score of at least 60%).",
  ],
  advertising: [
    "Google advertising activity can be confirmed.",
    "Facebook or Instagram advertising activity can be confirmed.",
    "At least three distinct Google advertisements or campaigns can be identified.",
    "A Meta Pixel or comparable retargeting implementation is present on the website or landing page.",
    "A real person answers the shop's phone, or there is comparable evidence the shop is ready to respond to leads.",
  ],
  social: [
    "The Facebook and Instagram profiles have substantially complete About sections and appropriate profile and cover images.",
    "The business posts at least three times per week.",
    "The business uses authentic shop photography or video more often than generic stock content.",
    "Posts receive engagement and the business responds through comments, reactions or other community management.",
    "The content does not appear to be duplicated across unrelated shops' social profiles.",
  ],
};

export function criterionText(category: CategoryKey, index: number): string {
  return CRITERIA[category][index - 1] ?? `${category} criterion ${index}`;
}

export function evidence(
  kind: Evidence["kind"],
  label: string,
  opts: Partial<Omit<Evidence, "kind" | "label">> = {},
): Evidence {
  return {
    kind,
    label,
    checkedAt: new Date().toISOString(),
    ...opts,
  };
}

/**
 * Build a finding. The invariant that keeps this honest: an `undetermined`
 * outcome must carry a non-`confirmed` status, and a `confirmed` status must
 * carry a decided outcome. `finding()` enforces it rather than trusting
 * callers.
 */
export function finding(args: {
  category: CategoryKey;
  index: number;
  outcome: Outcome;
  status: EvidenceStatus;
  confidence?: number;
  summary: string;
  reasoning: string;
  evidence?: Evidence[];
}): Finding {
  let { outcome, status } = args;
  if (outcome === "undetermined" && status === "confirmed") {
    status = "requires_human_review";
  }
  if (status !== "confirmed" && outcome === "pass") {
    // We refuse to award a point on evidence we did not confirm.
    outcome = "undetermined";
  }
  return {
    id: `${args.category}.${args.index}`,
    category: args.category,
    index: args.index,
    criterion: criterionText(args.category, args.index),
    outcome,
    status,
    confidence: args.confidence ?? (status === "confirmed" ? 0.9 : 0.3),
    summary: args.summary,
    reasoning: args.reasoning,
    evidence: args.evidence ?? [],
  };
}

/** Human overrides win over automation. */
export function effectiveOutcome(f: Finding): Outcome {
  return f.humanOverride?.outcome ?? f.outcome;
}

export function summariseCategory(
  category: CategoryKey,
  findings: Finding[],
  captured: Record<string, string | null>,
  notes: string[] = [],
): CategoryResult {
  const outcomes = findings.map(effectiveOutcome);
  const score = outcomes.filter((o) => o === "pass").length;
  const undetermined = outcomes.filter((o) => o === "undetermined").length;
  return {
    category,
    findings,
    score,
    potentialScore: score + undetermined,
    captured,
    notes,
  };
}

/** The existing, unchanged classification bands. */
export function classify(total: number): Classification {
  if (total <= 10) return "red";
  if (total <= 15) return "yellow";
  return "green";
}

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  red: "Red — significant opportunities for improvement",
  yellow: "Yellow — average performance with growth opportunities",
  green: "Green — strong digital marketing presence",
};

export function totals(categories: CategoryResult[]): {
  total: number;
  potential: number;
  classification: Classification;
} {
  const total = categories.reduce((s, c) => s + c.score, 0);
  const potential = categories.reduce((s, c) => s + c.potentialScore, 0);
  return { total, potential, classification: classify(total) };
}
