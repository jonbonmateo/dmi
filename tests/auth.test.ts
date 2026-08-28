/** Password hashing, session tokens, CSRF and the rate limiter. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

process.env.DMI_DATA_DIR = ".data/test-auth";
process.env.AUTH_SECRET = "test-secret-not-used-anywhere-real";
process.env.DMI_LOG_LEVEL = "error";

import { checkPasswordStrength, hashPassword, verifyPassword } from "../src/lib/auth/password";
import { newSessionRecord, parseToken, serialiseToken, csrfOk } from "../src/lib/auth/session";
import { checkBurst, checkLoginRate, recordAuthAttempt, resetBuckets } from "../src/lib/auth/rate-limit";
import { normaliseEmail, validEmail } from "../src/lib/auth/accounts";

const dataDir = path.resolve(process.cwd(), ".data/test-auth");
before(async () => { await fs.rm(dataDir, { recursive: true, force: true }); resetBuckets(); });
after(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });

/* ------------------------------------------------------------- passwords */

test("a password verifies against its own hash and nothing else", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.ok(await verifyPassword("correct horse battery staple", hash));
  assert.equal(await verifyPassword("Correct horse battery staple", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("the same password hashes differently every time", async () => {
  const a = await hashPassword("correct horse battery staple");
  const b = await hashPassword("correct horse battery staple");
  assert.notEqual(a, b, "a missing salt would make identical passwords share a hash");
  assert.ok(await verifyPassword("correct horse battery staple", b));
});

test("a hash records its own parameters so they can be raised later", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
});

test("a malformed stored hash is rejected rather than throwing", async () => {
  for (const bad of ["", "not-a-hash", "scrypt$1$2", "bcrypt$a$b$c$d$e"]) {
    assert.equal(await verifyPassword("anything", bad), false, `should reject: ${bad}`);
  }
});

test("password strength requires length and refuses the obvious", () => {
  assert.equal(checkPasswordStrength("short").ok, false);
  assert.equal(checkPasswordStrength("passwordpassword").ok, false, "contains a common password");
  assert.equal(checkPasswordStrength("aaaaaaaaaaaaaaa").ok, false, "single repeated character");
  assert.equal(checkPasswordStrength("raymiller1234", "raymiller@shop.com").ok, false, "contains the email local part");
  assert.equal(checkPasswordStrength("brake fluid ledger nine").ok, true);
});

/* -------------------------------------------------------------- sessions */

test("a session token round-trips and rejects tampering", () => {
  const s = newSessionRecord({ userId: "usr_1", isGuest: false, ip: null, userAgent: null });
  const token = serialiseToken(s.id);
  assert.equal(parseToken(token), s.id);

  assert.equal(parseToken(undefined), null);
  assert.equal(parseToken(s.id), null, "an unsigned id must not be accepted");
  assert.equal(parseToken(`${s.id}.deadbeef`), null, "a wrong signature must not be accepted");
  assert.equal(parseToken(`other.${token.split(".")[1]}`), null, "a signature from another id must not be accepted");
});

test("guest sessions expire sooner than member sessions", () => {
  const guest = newSessionRecord({ userId: "u", isGuest: true, ip: null, userAgent: null });
  const member = newSessionRecord({ userId: "u", isGuest: false, ip: null, userAgent: null });
  assert.ok(Date.parse(guest.expiresAt) < Date.parse(member.expiresAt));
});

test("a guest session can be pinned to mock mode at creation", () => {
  const guest = newSessionRecord({ userId: "u", isGuest: true, mode: "mock", ip: null, userAgent: null });
  assert.equal(guest.mode, "mock");
});

test("CSRF needs the exact token from the session", () => {
  const s = newSessionRecord({ userId: "u", isGuest: false, ip: null, userAgent: null });
  const withHeader = (v: string | null) =>
    new Request("https://x.test/", { method: "POST", headers: v ? { "x-dmi-csrf": v } : {} });
  assert.equal(csrfOk(withHeader(s.csrfSecret), s), true);
  assert.equal(csrfOk(withHeader(null), s), false);
  assert.equal(csrfOk(withHeader("wrong"), s), false);
  assert.equal(csrfOk(withHeader(s.csrfSecret + "x"), s), false);
});

test("each session gets its own CSRF secret", () => {
  const a = newSessionRecord({ userId: "u", isGuest: false, ip: null, userAgent: null });
  const b = newSessionRecord({ userId: "u", isGuest: false, ip: null, userAgent: null });
  assert.notEqual(a.csrfSecret, b.csrfSecret);
  assert.notEqual(a.id, b.id);
});

/* ---------------------------------------------------------- rate limiting */

test("five failures lock the identifier out", async () => {
  const key = "locked@example.test";
  for (let i = 0; i < 4; i++) {
    await recordAuthAttempt({ key, ip: "1.1.1.1", success: false, reason: "bad_password" });
  }
  assert.equal((await checkLoginRate(key)).allowed, true, "four failures is still allowed");

  await recordAuthAttempt({ key, ip: "1.1.1.1", success: false, reason: "bad_password" });
  const locked = await checkLoginRate(key);
  assert.equal(locked.allowed, false);
  assert.ok(locked.retryAfter > 0);
  assert.match(locked.reason ?? "", /Too many failed sign-in attempts/);
});

test("a success clears the failure streak", async () => {
  const key = "recovers@example.test";
  for (let i = 0; i < 5; i++) {
    await recordAuthAttempt({ key, ip: "2.2.2.2", success: false, reason: "bad_password" });
  }
  assert.equal((await checkLoginRate(key)).allowed, false);
  await recordAuthAttempt({ key, ip: "2.2.2.2", success: true, reason: null });
  assert.equal((await checkLoginRate(key)).allowed, true, "a good sign-in must reset the counter");
});

test("lockouts are per-identifier, not global", async () => {
  const key = "innocent@example.test";
  assert.equal((await checkLoginRate(key)).allowed, true);
});

test("the burst limiter refuses once the bucket empties", () => {
  resetBuckets();
  for (let i = 0; i < 5; i++) {
    assert.equal(checkBurst("burst-key", 5, 60_000).allowed, true, `request ${i + 1} should pass`);
  }
  const blocked = checkBurst("burst-key", 5, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter >= 1);
  assert.equal(checkBurst("another-key", 5, 60_000).allowed, true, "buckets are per key");
});

/* ---------------------------------------------------------------- emails */

test("email normalisation and validation", () => {
  assert.equal(normaliseEmail("  Ray@Shop.COM "), "ray@shop.com");
  assert.equal(validEmail("ray@shop.com"), true);
  assert.equal(validEmail("ray+dmi@shop.co.uk"), true);
  assert.equal(validEmail("no-at-sign"), false);
  assert.equal(validEmail("two@@shop.com"), false);
  assert.equal(validEmail(`${"a".repeat(250)}@shop.com`), false);
});

/* ---------------------------------------------------------- password reset */

import { createPasswordReset, consumePasswordReset, hashToken } from "../src/lib/auth/reset";
import { createPasswordUser } from "../src/lib/auth/accounts";

test("a reset token consumes exactly once", async () => {
  const user = await createPasswordUser({ email: "reset-once@example.test", password: "brake fluid ledger nine" });
  const { token } = await createPasswordReset({ userId: user.id, ip: null });

  const first = await consumePasswordReset(token);
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.userId, user.id);

  const second = await consumePasswordReset(token);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "used");
});

test("an unknown token is rejected", async () => {
  const outcome = await consumePasswordReset("this-token-was-never-issued");
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, "not_found");
});

test("requesting a new reset link retires the previous one", async () => {
  const user = await createPasswordUser({ email: "reset-retire@example.test", password: "brake fluid ledger nine" });
  const first = await createPasswordReset({ userId: user.id, ip: null });
  const second = await createPasswordReset({ userId: user.id, ip: null });

  const stale = await consumePasswordReset(first.token);
  assert.equal(stale.ok, false, "the earlier link must no longer work once a new one is issued");

  const fresh = await consumePasswordReset(second.token);
  assert.equal(fresh.ok, true);
});

test("only the token hash is ever stored, never the raw token", async () => {
  const user = await createPasswordUser({ email: "reset-hash@example.test", password: "brake fluid ledger nine" });
  const { token, record } = await createPasswordReset({ userId: user.id, ip: null });
  assert.equal(record.tokenHash, hashToken(token));
  assert.notEqual(record.tokenHash, token);
});

test("a reset token expires after its TTL", async () => {
  const user = await createPasswordUser({ email: "reset-expiry@example.test", password: "brake fluid ledger nine" });
  const { record } = await createPasswordReset({ userId: user.id, ip: null });
  const ttlMs = Date.parse(record.expiresAt) - Date.parse(record.createdAt);
  assert.ok(ttlMs > 0 && ttlMs <= 60 * 60_000 + 1000, `expected a ~1 hour TTL, got ${ttlMs}ms`);
});
