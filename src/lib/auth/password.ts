/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard, which is what makes a stolen hash expensive to attack
 * with GPUs. Parameters are stored in the hash string itself so they can be
 * raised later without invalidating existing passwords.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// N=2^15 costs ~50ms and ~32MB per hash on commodity hardware: slow enough to
// matter to an attacker, fast enough that a login does not feel sluggish.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(keyB64, "base64url");
  let actual: Buffer;
  try {
    actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 96 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  // Length check first: timingSafeEqual throws on a mismatch.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface PasswordProblem {
  ok: boolean;
  problems: string[];
}

/**
 * Length beats character-class rules — a 12-character passphrase is stronger
 * than "P@ssw0rd" and far likelier to be remembered rather than reused.
 */
export function checkPasswordStrength(password: string, email?: string | null): PasswordProblem {
  const problems: string[] = [];
  if (password.length < 12) problems.push("Use at least 12 characters.");
  if (password.length > 200) problems.push("Use fewer than 200 characters.");
  if (/^\s|\s$/.test(password)) problems.push("Remove the leading or trailing space.");
  const lower = password.toLowerCase();
  if (email) {
    const local = email.split("@")[0]?.toLowerCase();
    if (local && local.length > 2 && lower.includes(local)) {
      problems.push("Do not use your email address in your password.");
    }
  }
  const COMMON = [
    "password", "12345678", "qwerty", "letmein", "welcome", "admin",
    "iloveyou", "monkey", "dragon", "shopmarketing", "changeme",
  ];
  if (COMMON.some((c) => lower.includes(c))) {
    problems.push("That contains a very common password. Pick something less guessable.");
  }
  if (/^(.)\1+$/.test(password)) problems.push("Do not use a single repeated character.");
  return { ok: problems.length === 0, problems };
}
