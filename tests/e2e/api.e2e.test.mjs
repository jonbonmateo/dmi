/**
 * End-to-end over HTTP against a real `next start`: middleware, cookies,
 * CSRF, rate limiting, role enforcement and the mode lifecycle.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { makeClient, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp({ seed: true }); }, { timeout: 180_000 });
after(async () => { await app?.stop(); });

const PASSWORD = "brake fluid ledger nine";

describe("unauthenticated access", () => {
  test("health is public and reports live mode unavailable without credentials", async () => {
    const c = makeClient(app.base);
    const { status, data } = await c.get("/api/health");
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.liveMode.available, false, "no Google Places key, so live must be blocked");
    assert.ok(data.liveMode.requiredMissing.includes("google_places"));
  });

  test("API routes refuse anonymous callers", async () => {
    const c = makeClient(app.base);
    for (const url of ["/api/runs", "/api/review", "/api/auth/session"]) {
      const { status, data } = await c.get(url);
      if (url === "/api/auth/session") {
        assert.equal(data.signedIn, false, "the session probe answers rather than 401s");
      } else {
        assert.equal(status, 401, `${url} must require a session`);
      }
    }
  });

  test("pages redirect to the sign-in screen", async () => {
    const res = await fetch(`${app.base}/`, { redirect: "manual" });
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/login/);
  });

  test("a protected page preserves where you were going", async () => {
    const res = await fetch(`${app.base}/tracking`, { redirect: "manual" });
    assert.match(decodeURIComponent(res.headers.get("location") ?? ""), /next=\/tracking/);
  });

  test("security headers are set on every response", async () => {
    const res = await fetch(`${app.base}/login`);
    assert.match(res.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.match(res.headers.get("content-security-policy") ?? "", /object-src 'none'/);
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(res.headers.get("permissions-policy") ?? "", /geolocation=\(\)/);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  });
});

describe("sign-up and sign-in", () => {
  test("a weak password is refused with specific reasons", async () => {
    const c = makeClient(app.base);
    const { status, data } = await c.post("/api/auth/signup", {
      email: "weak@example.test",
      password: "password123",
    });
    assert.equal(status, 400);
    assert.ok(Array.isArray(data.problems) && data.problems.length > 0);
  });

  test("the first account is created as admin and is sent to choose a mode", async () => {
    const c = makeClient(app.base);
    const { status, data } = await c.post("/api/auth/signup", {
      email: "admin@example.test",
      password: PASSWORD,
      name: "Admin Person",
    });
    assert.equal(status, 200);
    assert.equal(data.user.role, "admin", "an empty deployment makes its first user the admin");
    assert.equal(data.next, "/mode");
    assert.ok(c.jar.get("dmi_session"), "a session cookie was set");
    assert.ok(c.jar.get("dmi_csrf"), "a CSRF token was issued");
  });

  test("the same address cannot be registered twice", async () => {
    const c = makeClient(app.base);
    const { status } = await c.post("/api/auth/signup", {
      email: "admin@example.test",
      password: PASSWORD,
    });
    assert.equal(status, 409);
  });

  test("a wrong password and an unknown address give the same answer", async () => {
    const c = makeClient(app.base);
    const wrong = await c.post("/api/auth/login", { email: "admin@example.test", password: "not the password" });
    const unknown = await c.post("/api/auth/login", { email: "nobody@example.test", password: "not the password" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(
      wrong.data.error,
      unknown.data.error,
      "differing messages would let an attacker enumerate accounts",
    );
  });

  test("the second account is a member, not an admin", async () => {
    const c = makeClient(app.base);
    const { data } = await c.post("/api/auth/signup", {
      email: "member@example.test",
      password: PASSWORD,
      name: "Member Person",
    });
    assert.equal(data.user.role, "member");
  });

  test("repeated failures lock the address out", async () => {
    const c = makeClient(app.base);
    const email = "lockme@example.test";
    await c.post("/api/auth/signup", { email, password: PASSWORD });
    await c.post("/api/auth/logout", {});

    let sawLockout = false;
    for (let i = 0; i < 8; i++) {
      const r = await c.post("/api/auth/login", { email, password: `wrong-${i}` });
      if (r.status === 429) {
        sawLockout = true;
        assert.ok(r.headers.get("retry-after"), "a 429 must say how long to wait");
        break;
      }
    }
    assert.ok(sawLockout, "brute-forcing one address must eventually be blocked");
  });
});

describe("mode lifecycle", () => {
  async function signedIn(email) {
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email, password: PASSWORD, name: "Test" });
    return c;
  }

  test("live mode is refused while required settings are missing", async () => {
    const c = await signedIn(`live-${Date.now()}@example.test`);
    const { status, data } = await c.post("/api/auth/mode", { mode: "live" });
    assert.equal(status, 412, "precondition failed, with the reason attached");
    assert.ok(data.requiredMissing.some((m) => m.id === "google_places"));
  });

  test("mock mode starts, and cannot then be switched", async () => {
    const c = await signedIn(`mock-${Date.now()}@example.test`);
    const first = await c.post("/api/auth/mode", { mode: "mock" });
    assert.equal(first.status, 200);
    assert.equal(first.data.mode, "mock");

    const again = await c.post("/api/auth/mode", { mode: "live" });
    assert.equal(again.status, 409, "the mode is fixed for the life of the session");
    assert.equal(again.data.mode, "mock");

    const session = await c.get("/api/auth/session");
    assert.equal(session.data.mode, "mock");
  });

  test("signing out and back in is how the mode changes", async () => {
    const email = `switch-${Date.now()}@example.test`;
    const c = await signedIn(email);
    await c.post("/api/auth/mode", { mode: "mock" });
    await c.post("/api/auth/logout", {});
    assert.equal((await c.get("/api/auth/session")).data.signedIn, false);

    await c.post("/api/auth/login", { email, password: PASSWORD });
    const fresh = await c.get("/api/auth/session");
    assert.equal(fresh.data.mode, null, "a new session starts with no mode chosen");
  });
});

describe("password reset", () => {
  test("the response is identical whether or not the address exists", async () => {
    const c = makeClient(app.base);
    const known = `reset-known-${Date.now()}@example.test`;
    await c.post("/api/auth/signup", { email: known, password: PASSWORD });
    await c.post("/api/auth/logout", {});

    const a = await c.post("/api/auth/forgot", { email: known });
    const b = await c.post("/api/auth/forgot", { email: "definitely-nobody@example.test" });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.data.message, b.data.message, "the response must not reveal whether the account exists");
  });

  test("the dev link is returned when no email provider is configured, and works end to end", async () => {
    const c = makeClient(app.base);
    const email = `reset-flow-${Date.now()}@example.test`;
    await c.post("/api/auth/signup", { email, password: PASSWORD });
    await c.post("/api/auth/mode", { mode: "mock" });
    await c.post("/api/auth/logout", {});

    const req = await c.post("/api/auth/forgot", { email });
    assert.equal(req.status, 200);
    assert.ok(req.data.devLink, "no RESEND_API_KEY is configured for this test run, so a dev link must be returned");
    const token = new URL(req.data.devLink).searchParams.get("token");
    assert.ok(token);

    const newPassword = "granite kettle overpass jungle";
    const reset = await c.post("/api/auth/reset", { token, password: newPassword });
    assert.equal(reset.status, 200);
    assert.equal(reset.data.next, "/login");

    // Old password no longer works; new password does.
    const oldLogin = await c.post("/api/auth/login", { email, password: PASSWORD });
    assert.equal(oldLogin.status, 401);
    const newLogin = await c.post("/api/auth/login", { email, password: newPassword });
    assert.equal(newLogin.status, 200);
  });

  test("a used token cannot be replayed", async () => {
    const c = makeClient(app.base);
    const email = `reset-replay-${Date.now()}@example.test`;
    await c.post("/api/auth/signup", { email, password: PASSWORD });
    await c.post("/api/auth/logout", {});

    const req = await c.post("/api/auth/forgot", { email });
    const token = new URL(req.data.devLink).searchParams.get("token");

    const first = await c.post("/api/auth/reset", { token, password: "another good passphrase" });
    assert.equal(first.status, 200);
    const second = await c.post("/api/auth/reset", { token, password: "yet another passphrase" });
    assert.equal(second.status, 400);
    assert.match(second.data.error, /already been used/i);
  });

  test("resetting the password revokes every existing session", async () => {
    const c = makeClient(app.base);
    const email = `reset-revoke-${Date.now()}@example.test`;
    await c.post("/api/auth/signup", { email, password: PASSWORD });
    await c.post("/api/auth/mode", { mode: "mock" });
    assert.equal((await c.get("/api/runs")).status, 200, "the session works before the reset");

    // Request the reset from a *different* client so the session under test
    // is never itself the one asking, mirroring a real forgotten-password flow.
    const requester = makeClient(app.base);
    const req = await requester.post("/api/auth/forgot", { email });
    const token = new URL(req.data.devLink).searchParams.get("token");
    await requester.post("/api/auth/reset", { token, password: "brand new passphrase nine" });

    assert.equal((await c.get("/api/runs")).status, 401, "the old session must be dead after a reset");
  });

  test("a weak new password is refused", async () => {
    const c = makeClient(app.base);
    const email = `reset-weak-${Date.now()}@example.test`;
    await c.post("/api/auth/signup", { email, password: PASSWORD });
    await c.post("/api/auth/logout", {});
    const req = await c.post("/api/auth/forgot", { email });
    const token = new URL(req.data.devLink).searchParams.get("token");
    const res = await c.post("/api/auth/reset", { token, password: "short" });
    assert.equal(res.status, 400);
    assert.ok(res.data.problems?.length > 0);
  });

  test("an unknown token is rejected with a clear message", async () => {
    const c = makeClient(app.base);
    const res = await c.post("/api/auth/reset", { token: "not-a-real-token-at-all", password: PASSWORD });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /invalid/i);
  });

  test("the endpoints are reachable without a session", async () => {
    const res = await fetch(`${app.base}/api/auth/forgot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "anonymous-caller@example.test" }),
    });
    assert.equal(res.status, 200);
  });
});

describe("guests", () => {
  test("a guest can read after choosing a mode, but cannot write", async () => {
    const c = makeClient(app.base);
    const { status, data } = await c.post("/api/auth/guest", {});
    assert.equal(status, 200);
    assert.equal(data.mode, null, "a guest is not pinned to a mode at sign-in");
    assert.equal(data.user.role, "guest");
    await c.post("/api/auth/mode", { mode: "mock" });

    const runs = await c.get("/api/runs");
    assert.equal(runs.status, 200, "guests may read");
    assert.ok(runs.data.runs.length > 0, "the seeded inspections are visible");

    const items = await c.get("/api/review?status=open");
    const target = items.data.items[0];
    const write = await c.patch(`/api/review/${encodeURIComponent(target.id)}`, {
      status: "resolved",
      outcome: "pass",
    });
    assert.equal(write.status, 403, "guests must not be able to change a score");
  });

  test("a guest chooses a mode just like any other account", async () => {
    const c = makeClient(app.base);
    const guest = await c.post("/api/auth/guest", {});
    assert.equal(guest.data.mode, null, "a guest gets the mode question too, not an auto-pinned mode");
    assert.equal(guest.data.next, "/mode");

    // Live is blocked here by the harness having no Google Places key, the
    // same reason it's blocked for every other role — not because they're a
    // guest. A guest choosing mock, meanwhile, works exactly like anyone else.
    const live = await c.post("/api/auth/mode", { mode: "live" });
    assert.equal(live.status, 412, "blocked by readiness, not by role");

    const mock = await c.post("/api/auth/mode", { mode: "mock" });
    assert.equal(mock.status, 200);
    assert.equal(mock.data.mode, "mock");
  });
});

describe("CSRF and sessions", () => {
  test("a state-changing request without the CSRF header is refused", async () => {
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email: `csrf-${Date.now()}@example.test`, password: PASSWORD });
    await c.post("/api/auth/mode", { mode: "mock" });

    const items = await c.get("/api/review?status=open");
    const target = items.data.items[0];
    const bare = await c.postWithoutCsrf(`/api/review/${encodeURIComponent(target.id)}`, {});
    assert.ok(bare.status === 403 || bare.status === 405, `expected rejection, got ${bare.status}`);
  });

  test("a revoked session stops working immediately", async () => {
    const email = `revoke-${Date.now()}@example.test`;
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email, password: PASSWORD });
    assert.equal((await c.get("/api/runs")).status, 200);

    await c.post("/api/auth/logout", {});
    assert.equal((await c.get("/api/runs")).status, 401, "the cookie must not outlive the session record");
  });

  test("a forged session cookie is rejected", async () => {
    const res = await fetch(`${app.base}/api/runs`, {
      headers: { cookie: "dmi_session=forged.signature" },
    });
    assert.equal(res.status, 401);
  });

  test("an invalid-signature cookie visiting /login does not redirect-loop", async () => {
    // Regression test for a real incident: middleware used to redirect any
    // *cookied* visit to /login onward to /mode, without checking whether
    // the cookie's signature actually verified. A stale/invalid cookie (e.g.
    // left over from before an AUTH_SECRET rotation) bounced middleware
    // /login -> /mode, /mode's real getAuth() rejected it and sent the
    // browser back to /login, and middleware bounced it to /mode again —
    // forever, until the browser gave up with ERR_TOO_MANY_REDIRECTS.
    const res = await fetch(`${app.base}/login`, {
      headers: { cookie: "dmi_session=forged.notarealsignature" },
      redirect: "manual",
    });
    // The real fix: this must render the login page directly (200), not
    // redirect anywhere at all — middleware no longer acts on cookie
    // presence alone for this path.
    assert.equal(res.status, 200, "a cookie present but invalid must not trigger any redirect from /login");
  });

  test("an invalid-signature cookie visiting a protected page redirects exactly once", async () => {
    for (const path of ["/", "/mode", "/review", "/tracking"]) {
      const res = await fetch(`${app.base}${path}`, {
        headers: { cookie: "dmi_session=forged.notarealsignature" },
        redirect: "manual",
      });
      assert.equal(res.status, 307, `${path} with an invalid cookie should redirect once`);
      assert.match(
        res.headers.get("location") ?? "",
        /\/login/,
        `${path} with an invalid cookie must redirect straight to /login, not bounce through /mode`,
      );
    }
  });
});

describe("answering a review question", () => {
  test("resolving an open item updates the score and attributes it to the signed-in user", async () => {
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email: `answer-${Date.now()}@example.test`, password: PASSWORD, name: "Answerer" });
    await c.post("/api/auth/mode", { mode: "mock" });

    const runs = await c.get("/api/runs");
    const run = runs.data.runs.find((r) => r.openReviews > 0);
    assert.ok(run, "a seeded run should have open questions");

    const before = await c.get(`/api/runs/${run.id}`);
    const openItems = before.data.reviewItems.filter((i) => i.status === "open");
    // Pick one attached to a criterion that is not already passing.
    const undetermined = new Set(
      before.data.run.categories
        .flatMap((cat) => cat.findings)
        .filter((f) => f.outcome === "undetermined")
        .map((f) => f.id),
    );
    const target = openItems.find((i) => i.findingId && undetermined.has(i.findingId));
    assert.ok(target, "expected an unresolved criterion to answer");

    const res = await c.patch(`/api/review/${encodeURIComponent(target.id)}`, {
      status: "resolved",
      outcome: "pass",
      resolution: "Checked by hand.",
      by: "someone-else-entirely",
    });
    assert.equal(res.status, 200);
    assert.equal(
      res.data.run.totalScore,
      before.data.run.totalScore + 1,
      "answering one undetermined criterion moves the score by exactly one",
    );

    const after = await c.get(`/api/runs/${run.id}`);
    const resolved = after.data.reviewItems.find((i) => i.id === target.id);
    assert.equal(resolved.status, "resolved");
    assert.equal(
      resolved.resolvedBy,
      "Answerer",
      "the audit trail must record the signed-in user, not the client-supplied name",
    );
  });
});

describe("machine-to-machine endpoints", () => {
  test("intake stays reachable without a session", async () => {
    const res = await fetch(`${app.base}/api/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        company_name: "Webhook Test Shop",
        website_url: "southsidetire.example",
        email: "webhook@example.test",
        appointmentStartTime: "2026-10-01T15:00:00Z",
      }),
    });
    assert.ok(res.status === 202 || res.status === 200, `got ${res.status}`);
    const body = await res.json();
    assert.ok(body.runId);
  });

  test("a duplicate webhook returns the same run", async () => {
    const payload = {
      company_name: "Webhook Test Shop",
      website_url: "southsidetire.example",
      email: "webhook@example.test",
      appointmentStartTime: "2026-10-01T19:00:00Z",
    };
    const send = () =>
      fetch(`${app.base}/api/intake`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
    const a = await send();
    const b = await send();
    assert.equal(b.duplicate, true);
    assert.equal(a.runId, b.runId);
  });
});

describe("starting an inspection from the dashboard", () => {
  test("a signed-in member can start one, and it shows up in the runs list", async () => {
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email: `dash-${Date.now()}@example.test`, password: PASSWORD });
    await c.post("/api/auth/mode", { mode: "mock" });

    const res = await c.post("/api/runs", { shopName: "Dashboard Started Shop", website: "https://dashboardstarted.example" });
    assert.equal(res.status, 202);
    assert.ok(res.data.runId);
    assert.equal(res.data.mode, "mock", "the run must inherit the session's chosen mode, not default to live");

    const runs = await c.get("/api/runs");
    assert.ok(runs.data.runs.some((r) => r.id === res.data.runId), "the new run must appear in the list immediately");
  });

  test("starting the same shop twice returns the existing run instead of a second one", async () => {
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email: `dash-dup-${Date.now()}@example.test`, password: PASSWORD });
    await c.post("/api/auth/mode", { mode: "mock" });

    const a = await c.post("/api/runs", { shopName: "Dashboard Duplicate Shop" });
    const b = await c.post("/api/runs", { shopName: "Dashboard Duplicate Shop" });
    assert.equal(a.status, 202);
    assert.equal(b.status, 200);
    assert.equal(b.data.duplicate, true);
    assert.equal(a.data.runId, b.data.runId);
  });

  test("a blank shop name is rejected", async () => {
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email: `dash-blank-${Date.now()}@example.test`, password: PASSWORD });
    await c.post("/api/auth/mode", { mode: "mock" });

    const res = await c.post("/api/runs", { shopName: "  " });
    assert.equal(res.status, 400);
  });

  test("a guest cannot start an inspection", async () => {
    const c = makeClient(app.base);
    await c.post("/api/auth/guest", {});
    const res = await c.post("/api/runs", { shopName: "Guest Attempt Shop" });
    assert.equal(res.status, 403, "guests are read-only everywhere, this included");
  });

  test("a session with no mode chosen yet cannot start an inspection", async () => {
    const c = makeClient(app.base);
    await c.post("/api/auth/signup", { email: `dash-nomode-${Date.now()}@example.test`, password: PASSWORD });
    const res = await c.post("/api/runs", { shopName: "No Mode Yet Shop" });
    assert.equal(res.status, 409);
  });
});
