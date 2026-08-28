/**
 * Password-reset tokens.
 *
 * The token itself is a random value handed to the user (in the email link);
 * only its SHA-256 hash is ever persisted, mirroring how passwords are never
 * stored in the clear. A token is single-use, short-lived, and requesting a
 * new one invalidates every reset already outstanding for that account.
 */
import { randomBytes, createHash } from "node:crypto";
import { getStore } from "@/lib/storage";
import { newId } from "@/lib/pipeline/context";
import type { PasswordReset } from "./types";

const TTL_MS = 60 * 60_000; // one hour

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordReset(args: {
  userId: string;
  ip: string | null;
}): Promise<{ token: string; record: PasswordReset }> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const record: PasswordReset = {
    id: newId("prst"),
    userId: args.userId,
    tokenHash: hashToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    usedAt: null,
    ip: args.ip,
  };
  const store = getStore();
  // Only one live reset link per account: requesting a new one silently
  // retires any earlier link rather than leaving multiple valid at once.
  await store.invalidatePasswordResets(args.userId);
  await store.createPasswordReset(record);
  return { token, record };
}

export type ResetOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "used" };

export async function consumePasswordReset(token: string): Promise<ResetOutcome> {
  const store = getStore();
  const hash = hashToken(token);
  const record = await store.getPasswordResetByHash(hash);
  if (!record) return { ok: false, reason: "not_found" };

  if (record.usedAt) return { ok: false, reason: "used" };
  if (Date.parse(record.expiresAt) < Date.now()) return { ok: false, reason: "expired" };

  await store.markPasswordResetUsed(record.id);
  return { ok: true, userId: record.userId };
}
