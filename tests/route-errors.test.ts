/**
 * Reproduces the exact production failure this was built to fix: a
 * deployment with no database, where the local file store's write throws
 * because the filesystem is read-only (Vercel, most hosting platforms) —
 * and proves it now surfaces a real, actionable message instead of a bare,
 * bodyless 500.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

process.env.DMI_DATA_DIR = ".data/test-route-errors";
process.env.AUTH_SECRET = "test-secret-not-used-anywhere-real";
process.env.DMI_LOG_LEVEL = "error";

import { LocalStore } from "../src/lib/storage/local";
import { ConfigurationError } from "../src/lib/errors";
import { routeErrorResponse } from "../src/lib/api-wrap";
import { newSessionRecord } from "../src/lib/auth/session";

const dataDir = path.resolve(process.cwd(), ".data/test-route-errors");
before(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });
after(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });

test("a read-only filesystem produces a ConfigurationError naming the real cause", async () => {
  const store = new LocalStore();
  // Point the store at a directory that cannot be created: a file sitting
  // where a directory needs to go reproduces EEXIST/ENOTDIR the same way a
  // read-only mount reproduces EROFS on Vercel — any of these must be caught
  // and turned into the same clear message rather than propagating raw.
  const blocker = path.resolve(dataDir, "blocker-file");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(blocker, "not a directory");
  // @ts-expect-error -- reaching into the private field is the whole point of this test
  store.file = path.join(blocker, "dmi.json");

  await assert.rejects(
    () => store.upsertUser({
      id: "usr_test", email: "x@example.test", name: "X", role: "admin", provider: "password",
      passwordHash: "irrelevant", avatarUrl: null, onboardedAt: null, disabledAt: null,
      lastLoginAt: null, createdAt: new Date().toISOString(),
    }),
    (e: unknown) => {
      assert.ok(e instanceof ConfigurationError, `expected a ConfigurationError, got ${e}`);
      assert.match((e as Error).message, /no working database/i);
      assert.match((e as Error).message, /SUPABASE/);
      return true;
    },
  );
});

test("routeErrorResponse shows a ConfigurationError's message verbatim", async () => {
  const res = routeErrorResponse(new ConfigurationError("This deployment has no working database."));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "This deployment has no working database.");
});

test("routeErrorResponse hides the detail of an ordinary error", async () => {
  const res = routeErrorResponse(new Error("column dmi_users.foo does not exist"));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.doesNotMatch(body.error, /dmi_users/, "an internal detail must not reach the client");
  assert.match(body.error, /check the deployment logs/i);
});

test("routeErrorResponse never throws, even on a non-Error value", () => {
  assert.doesNotThrow(() => routeErrorResponse("a bare string, not an Error"));
  assert.doesNotThrow(() => routeErrorResponse(undefined));
});

// Sanity: a session record can still be minted even though the store above
// is broken, confirming this test file has not corrupted unrelated module state.
test("session creation is unaffected by the broken-store test above", () => {
  const s = newSessionRecord({ userId: "u", isGuest: false, ip: null, userAgent: null });
  assert.ok(s.id);
});

/*
 * Regression test for a real production incident: a signup created the user
 * and the session (the two things that make someone signed in) and then an
 * unrelated bookkeeping call threw, which crashed the whole response with a
 * 500 — so the person saw an error for what was actually a successful
 * signup. `safeSideEffect` exists specifically so that can't happen again.
 */
import { safeSideEffect } from "../src/lib/api-wrap";

test("safeSideEffect swallows a failure and logs it, without throwing", async () => {
  let threw = false;
  try {
    await safeSideEffect("simulated bookkeeping failure", async () => {
      throw new Error("insert failed: some_column does not exist");
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "a failed side effect must never propagate to the caller");
});

test("safeSideEffect still runs the side effect and awaits it on success", async () => {
  let ran = false;
  await safeSideEffect("simulated bookkeeping success", async () => {
    ran = true;
  });
  assert.equal(ran, true);
});
