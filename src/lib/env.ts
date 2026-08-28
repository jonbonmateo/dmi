/**
 * Every external dependency is optional. If a credential is missing the
 * corresponding provider degrades to a documented mock / manual-review path
 * instead of failing the run or inventing data.
 */

function str(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

export const env = {
  get appUrl() {
    return str("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  },
  get supabaseUrl() {
    return str("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return str("SUPABASE_SERVICE_ROLE_KEY");
  },
  get pageSpeedKey() {
    return str("PAGESPEED_API_KEY");
  },
  get googleMapsKey() {
    return str("GOOGLE_MAPS_API_KEY");
  },
  get metaAdLibraryToken() {
    return str("META_AD_LIBRARY_TOKEN");
  },
  get ghlApiKey() {
    return str("GHL_API_KEY");
  },
  get ghlLocationId() {
    return str("GHL_LOCATION_ID");
  },
  get zapierTrackingWebhook() {
    return str("ZAPIER_TRACKING_WEBHOOK_URL");
  },
  get zapierBudgetCardWebhook() {
    return str("ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL");
  },
  get intakeSecret() {
    return str("DMI_INTAKE_SECRET");
  },
  get cronSecret() {
    return str("CRON_SECRET");
  },
  get authSecret() {
    return str("AUTH_SECRET");
  },
  get googleClientId() {
    return str("GOOGLE_OAUTH_CLIENT_ID");
  },
  get googleClientSecret() {
    return str("GOOGLE_OAUTH_CLIENT_SECRET");
  },
  /** Empty = any domain may sign in with Google. */
  get allowedEmailDomains(): string[] {
    const raw = str("AUTH_ALLOWED_DOMAINS");
    return raw ? raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean) : [];
  },
  /** Guest sign-in is on by default; it is mock-mode only. */
  get allowGuest() {
    return str("AUTH_ALLOW_GUEST") !== "0";
  },
  /** Self-service sign-up. Turn off once the team's accounts exist. */
  get allowSignup() {
    return str("AUTH_ALLOW_SIGNUP") !== "0";
  },
  /** Force every provider into mock mode, for demos and tests. */
  get forceMock() {
    return str("DMI_FORCE_MOCK") === "1";
  },
  /** Where local-driver JSON records live when Supabase is not configured. */
  get dataDir() {
    return str("DMI_DATA_DIR") ?? ".data";
  },
  get storageDriver(): "supabase" | "local" {
    return this.supabaseUrl && this.supabaseServiceKey ? "supabase" : "local";
  },
};

export interface ProviderMode {
  live: boolean;
  reason: string;
}

export function providerMode(
  name: string,
  credential: string | null,
  /** Injected by callers that know the session's mode; defaults to the env flag. */
  mock = env.forceMock,
): ProviderMode {
  if (mock) {
    return { live: false, reason: `${name}: mock mode, using fixtures` };
  }
  if (!credential) {
    return {
      live: false,
      reason: `${name}: no credential configured, using fixtures / manual review`,
    };
  }
  return { live: true, reason: `${name}: live` };
}
