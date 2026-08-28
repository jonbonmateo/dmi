/** The live/mock switch: isolation, provider gating and run stamping. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

process.env.DMI_DATA_DIR = ".data/test-mode";
process.env.DMI_LOG_LEVEL = "error";
delete process.env.DMI_FORCE_MOCK;

import { currentMode, isMock, withMode } from "../src/lib/runtime-mode";
import { providerMode } from "../src/lib/env";
import { getReadiness } from "../src/lib/readiness";
import { canUseLiveMode } from "../src/lib/auth/accounts";
import { intake } from "../src/lib/intake";
import { runPipeline } from "../src/lib/pipeline";
import { getStore } from "../src/lib/storage";
import type { User } from "../src/lib/auth/types";

const dataDir = path.resolve(process.cwd(), ".data/test-mode");
before(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });
after(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });

test("mode defaults to live and is overridden inside withMode", async () => {
  assert.equal(currentMode(), "live");
  await withMode("mock", async () => {
    assert.equal(currentMode(), "mock");
    assert.equal(isMock(), true);
  });
  assert.equal(currentMode(), "live", "the mode must not leak out of its scope");
});

test("the mode survives awaits inside the scope", async () => {
  await withMode("mock", async () => {
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(currentMode(), "mock", "an async boundary must not lose the mode");
  });
});

test("two concurrent runs in different modes do not bleed into each other", async () => {
  const seen: string[] = [];
  await Promise.all([
    withMode("mock", async () => {
      await new Promise((r) => setTimeout(r, 10));
      seen.push(`a:${currentMode()}`);
    }),
    withMode("live", async () => {
      await new Promise((r) => setTimeout(r, 5));
      seen.push(`b:${currentMode()}`);
    }),
  ]);
  assert.deepEqual(seen.sort(), ["a:mock", "b:live"]);
});

test("providerMode reports mock without a credential and live with one", () => {
  assert.equal(providerMode("x", "a-key", false).live, true);
  assert.equal(providerMode("x", null, false).live, false);
  const mocked = providerMode("x", "a-key", true);
  assert.equal(mocked.live, false, "mock mode wins even when a credential exists");
  assert.match(mocked.reason, /mock mode/);
});

test("readiness blocks live mode until the required checks pass", () => {
  const r = getReadiness();
  assert.ok(r.checks.length > 0);
  assert.equal(r.liveAvailable, r.requiredMissing.length === 0);
  for (const c of r.checks) {
    assert.ok(c.consequence.length > 20, `${c.id} must explain what breaks`);
    assert.ok(c.howTo.length > 0, `${c.id} must say how to fix it`);
    assert.ok(c.envVars.length > 0, `${c.id} must name its env vars`);
  }
});

test("readiness names Google Places as required for live mode", () => {
  const places = getReadiness().checks.find((c) => c.id === "google_places");
  assert.equal(places?.importance, "required");
});

test("guests cannot use live mode", () => {
  const base: User = {
    id: "u", email: null, name: "Guest", role: "guest", provider: "guest",
    passwordHash: null, avatarUrl: null, onboardedAt: null, disabledAt: null,
    lastLoginAt: null, createdAt: new Date().toISOString(),
  };
  assert.equal(canUseLiveMode(base), false);
  assert.equal(canUseLiveMode({ ...base, role: "member", provider: "password" }), true);
  assert.equal(canUseLiveMode({ ...base, role: "admin", provider: "password" }), true);
});

test("a run is stamped with the mode that produced it, and resumes in it", async () => {
  const { run } = await withMode("mock", () =>
    intake({
      shopName: "Precision Auto Care",
      website: "https://precisionautocare.example",
      email: "dana@precisionautocare.example",
      discoveryCallAt: "2026-09-02T15:00:00Z",
    }),
  );
  assert.equal(run.mode, "mock", "intake stamps the current mode onto the run");

  // Run it from *outside* any withMode scope: the pipeline must re-enter the
  // run's own mode rather than falling back to live and hitting the network.
  const done = await runPipeline(run.id);
  assert.equal(done.mode, "mock");
  assert.equal(done.categories.length, 4, "fixtures were used, so all four categories completed");
  assert.equal(done.classification, "green");

  const stored = await getStore().getRun(run.id);
  assert.equal(stored?.mode, "mock");
});
