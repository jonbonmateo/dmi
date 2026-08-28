/**
 * Accounts, sessions and the run mode chosen at sign-in.
 */

export type UserRole = "admin" | "member" | "guest";

/** How the account authenticates. */
export type AuthProvider = "password" | "google" | "guest";

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  provider: AuthProvider;
  /** scrypt hash, `password` accounts only. Never leaves the server. */
  passwordHash: string | null;
  avatarUrl: string | null;
  /** Cleared once the tour is completed or skipped. */
  onboardedAt: string | null;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * Mock vs live is a property of the *session*, chosen once at sign-in and
 * immutable until the user signs out again. That is deliberate: a mode that
 * can be flipped mid-session makes it impossible to say, later, whether a
 * given DMI was built from real observations or fixtures.
 */
export type RunMode = "live" | "mock";

export interface Session {
  id: string;
  userId: string;
  mode: RunMode | null;
  /** CSRF token bound to this session; sent to the client and echoed back. */
  csrfSecret: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

/** One record per credential attempt, for rate limiting and audit. */
export interface AuthAttempt {
  id: string;
  /** Lowercased email, or `ip:<addr>` for un-attributed attempts. */
  key: string;
  ip: string | null;
  success: boolean;
  reason: string | null;
  at: string;
}

/** What a request handler sees after the session cookie is verified. */
export interface AuthContext {
  user: User;
  session: Session;
  mode: RunMode | null;
}
