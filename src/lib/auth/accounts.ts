/**
 * Account lookup and creation, shared by every sign-in path.
 */
import { randomBytes } from "node:crypto";
import { getStore } from "@/lib/storage";
import { newId } from "@/lib/pipeline/context";
import { env } from "@/lib/env";
import { hashPassword } from "./password";
import type { AuthProvider, User, UserRole } from "./types";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validEmail(email: string): boolean {
  // Deliberately permissive: the only real proof is delivery, and over-strict
  // patterns reject valid addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/**
 * The first account to be created becomes the admin, so a fresh deployment is
 * usable without a seeding step. Everyone after that is a member.
 */
async function roleForNewUser(): Promise<UserRole> {
  const count = await getStore().countUsers();
  return count === 0 ? "admin" : "member";
}

export async function createPasswordUser(args: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<User> {
  const email = normaliseEmail(args.email);
  const user: User = {
    id: newId("usr"),
    email,
    name: args.name?.trim() || email.split("@")[0],
    role: await roleForNewUser(),
    provider: "password",
    passwordHash: await hashPassword(args.password),
    avatarUrl: null,
    onboardedAt: null,
    disabledAt: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
  return getStore().upsertUser(user);
}

export async function findOrCreateGoogleUser(profile: {
  email: string;
  name: string | null;
  picture: string | null;
}): Promise<User> {
  const store = getStore();
  const email = normaliseEmail(profile.email);
  const existing = await store.findUserByEmail(email);
  if (existing) {
    // An account created with a password keeps its password; signing in with
    // Google at the same verified address is treated as the same person.
    existing.name = existing.name ?? profile.name;
    existing.avatarUrl = profile.picture ?? existing.avatarUrl;
    return store.upsertUser(existing);
  }
  const user: User = {
    id: newId("usr"),
    email,
    name: profile.name ?? email.split("@")[0],
    role: await roleForNewUser(),
    provider: "google",
    passwordHash: null,
    avatarUrl: profile.picture,
    onboardedAt: null,
    disabledAt: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
  return store.upsertUser(user);
}

/**
 * A guest is a real, throwaway account rather than a shared "anonymous" user,
 * so its actions are still attributable in the audit trail. Guests can read
 * and can run inspections in mock mode; they cannot reach live mode, because
 * live mode spends the agency's API quota and touches the real CRM.
 */
export async function createGuestUser(): Promise<User> {
  const suffix = randomBytes(4).toString("hex");
  const user: User = {
    id: newId("usr"),
    email: null,
    name: `Guest ${suffix}`,
    role: "guest",
    provider: "guest",
    passwordHash: null,
    avatarUrl: null,
    onboardedAt: null,
    disabledAt: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
  return getStore().upsertUser(user);
}

export function guestsAllowed(): boolean {
  return env.allowGuest;
}

export function signupsAllowed(): boolean {
  return env.allowSignup;
}

/** Roles permitted to run the app against real APIs and the real CRM. */
export function canUseLiveMode(user: User): boolean {
  return user.role !== "guest";
}

export async function touchLogin(user: User): Promise<void> {
  user.lastLoginAt = new Date().toISOString();
  await getStore().upsertUser(user);
}
