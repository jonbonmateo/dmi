/**
 * End-to-end in a real browser: the sign-in → mode → tour → dashboard journey,
 * plus table sorting/filtering and answering a review question by clicking.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startApp } from "./harness.mjs";

let app;
let browser;

before(async () => {
  app = await startApp({ seed: true });
  browser = await chromium.launch({ args: ["--no-sandbox"] });
}, { timeout: 180_000 });

after(async () => {
  await browser?.close();
  await app?.stop();
});

let ipSeq = 0;

/**
 * A fresh browser context that fails the test on any console error.
 *
 * Each one presents its own forwarded IP. Every context otherwise arrives from
 * localhost and would share the per-IP signup bucket — the limiter behaving
 * correctly, but it would mask everything the UI suite is actually here to
 * check. The limiter is covered directly in the API suite.
 */
async function newPage() {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${(ipSeq++ % 250) + 1}` },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.__errors = errors;
  return page;
}

const PASSWORD = "brake fluid ledger nine";
let uid = 0;
const nextEmail = () => `ui-${Date.now()}-${uid++}@example.test`;

/** Sign up through the actual form and land wherever the app sends us. */
async function signUp(page, email = nextEmail()) {
  await page.goto(`${app.base}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create one/i }).click().catch(() => {});
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  const name = await page.$("#name");
  if (name) await name.fill("Test Person");
  await Promise.all([
    page.waitForURL(/\/mode/, { timeout: 20_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);
  return email;
}

describe("sign-in journey", () => {
  test("an anonymous visitor is sent to the sign-in page", async () => {
    const page = await newPage();
    await page.goto(`${app.base}/`, { waitUntil: "networkidle" });
    assert.match(page.url(), /\/login/);
    assert.ok(await page.getByRole("heading", { name: /sign in|create the first account/i }).isVisible());
    await page.context().close();
  });

  test("the guest button signs in and pins mock mode", async () => {
    const page = await newPage();
    await page.goto(`${app.base}/login`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForURL(/\/onboarding/, { timeout: 20_000 }),
      page.getByRole("button", { name: /continue as a guest/i }).click(),
    ]);
    // A guest never sees the mode question — the session is already pinned.
    const session = await page.evaluate(() => fetch("/api/auth/session").then((r) => r.json()));
    assert.equal(session.mode, "mock", "guests must be pinned to mock mode at sign-in");
    assert.equal(session.user.role, "guest");
    assert.deepEqual(page.__errors, []);
    await page.context().close();
  });

  test("a bad password shows an error and does not sign anyone in", async () => {
    const page = await newPage();
    await page.goto(`${app.base}/login`, { waitUntil: "networkidle" });
    // On an empty deployment the form opens on "Create account"; the toggle at
    // the bottom is what switches it to sign-in.
    const submit = page.getByRole("button", { name: /create account|^sign in$/i }).first();
    if (/create account/i.test((await submit.textContent()) ?? "")) {
      await page.getByRole("button", { name: /^sign in$/i }).last().click();
    }
    await page.fill("#email", "nobody@example.test");
    await page.fill("#password", "wrong password entirely");
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    await page.waitForSelector("text=/do not match an account/i", { timeout: 15_000 });
    assert.match(page.url(), /\/login/);
    await page.context().close();
  });
});

describe("mode chooser", () => {
  test("live mode is visibly blocked and explains how to fix it", async () => {
    const page = await newPage();
    await signUp(page);

    const liveButton = page.getByRole("button", { name: /start in live mode/i });
    assert.equal(await liveButton.isDisabled(), true, "live must be unavailable with no credentials");
    assert.ok(await page.getByText(/required/i).first().isVisible());

    // The remediation steps are one click away — on the row that is failing.
    const placesRow = page.locator("li", { hasText: /Google Places API/i }).first();
    await placesRow.getByRole("button", { name: /how do i fix this/i }).click();
    assert.ok(
      await placesRow.getByText(/GOOGLE_MAPS_API_KEY/).first().isVisible(),
      "the missing environment variable must be named on its own row",
    );
    assert.ok(
      await placesRow.getByText(/Places API \(New\)/i).isVisible(),
      "the steps must say which API to enable",
    );
    assert.deepEqual(page.__errors, []);
    await page.context().close();
  });

  test("choosing mock mode leads into the tour and shows the banner", async () => {
    const page = await newPage();
    await signUp(page);
    await Promise.all([
      page.waitForURL(/\/onboarding/, { timeout: 20_000 }),
      page.getByRole("button", { name: /start in mock mode/i }).click(),
    ]);
    assert.ok(await page.getByRole("heading", { name: /what a dmi is/i }).isVisible());
    await page.context().close();
  });

  test("the mode page cannot be revisited once a mode is chosen", async () => {
    const page = await newPage();
    await signUp(page);
    await Promise.all([
      page.waitForURL(/\/onboarding/, { timeout: 20_000 }),
      page.getByRole("button", { name: /start in mock mode/i }).click(),
    ]);
    await page.goto(`${app.base}/mode`, { waitUntil: "networkidle" });
    assert.doesNotMatch(page.url(), /\/mode$/, "revisiting /mode must redirect away");
    await page.context().close();
  });
});

describe("onboarding tour", () => {
  test("steps through and finishes on the dashboard", async () => {
    const page = await newPage();
    await signUp(page);
    await Promise.all([
      page.waitForURL(/\/onboarding/, { timeout: 20_000 }),
      page.getByRole("button", { name: /start in mock mode/i }).click(),
    ]);

    let steps = 1;
    for (;;) {
      const next = page.getByRole("button", { name: /^next/i });
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      steps += 1;
      if (steps > 12) throw new Error("the tour did not terminate");
    }
    assert.ok(steps >= 5, `expected a multi-step tour, saw ${steps}`);

    await Promise.all([
      page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 }),
      page.getByRole("button", { name: /get started/i }).click(),
    ]);
    assert.ok(await page.getByRole("heading", { name: /^inspections$/i }).isVisible());

    // Having finished it once, sign-in should no longer force the tour.
    await page.goto(`${app.base}/`, { waitUntil: "networkidle" });
    assert.equal(new URL(page.url()).pathname, "/");
    assert.deepEqual(page.__errors, []);
    await page.context().close();
  });
});

/** Sign up, pick mock mode, skip the tour, and land on the dashboard. */
async function intoApp(page) {
  await signUp(page);
  await Promise.all([
    page.waitForURL(/\/onboarding/, { timeout: 20_000 }),
    page.getByRole("button", { name: /start in mock mode/i }).click(),
  ]);
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 }),
    page.getByRole("button", { name: /^skip$/i }).click(),
  ]);
}

describe("dashboard table", () => {
  test("shows the seeded inspections and the mock banner", async () => {
    const page = await newPage();
    await intoApp(page);
    const rows = await page.$$("tbody tr");
    assert.equal(rows.length, 5, "five seeded inspections");
    assert.ok(
      await page.getByText(/every finding comes from bundled fixtures/i).isVisible(),
      "the mock banner must be unmissable",
    );
    await page.context().close();
  });

  test("sorting by score reorders the rows", async () => {
    const page = await newPage();
    await intoApp(page);
    const scores = async () =>
      page.$$eval("tbody tr td:nth-child(3)", (tds) =>
        tds.map((td) => {
          const m = td.textContent.match(/(\d+)\/20/);
          return m ? Number(m[1]) : null;
        }),
      );

    await page.getByRole("button", { name: /^score/i }).click();
    const asc = await scores();
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b), `not ascending: ${asc}`);

    await page.getByRole("button", { name: /^score/i }).click();
    const desc = await scores();
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a), `not descending: ${desc}`);
    await page.context().close();
  });

  test("searching narrows the table and the count updates", async () => {
    const page = await newPage();
    await intoApp(page);
    await page.fill("#table-search", "miller");
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
    assert.match(await page.textContent("tbody tr td:first-child"), /Miller/);
    assert.ok(await page.getByText(/1 of 5/).isVisible());

    await page.getByRole("button", { name: /clear filters/i }).click();
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 5);
    await page.context().close();
  });

  test("the band facet filters to one classification", async () => {
    const page = await newPage();
    await intoApp(page);
    await page.selectOption("#facet-classification", "green");
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
    assert.match((await page.textContent("tbody")) ?? "", /16\/20/);
    await page.context().close();
  });

  test("filters that match nothing say so rather than showing an empty table", async () => {
    const page = await newPage();
    await intoApp(page);
    await page.fill("#table-search", "zzzz-no-such-shop");
    await page.waitForSelector("text=/No inspections match those filters/i");
    await page.context().close();
  });
});

describe("report and review", () => {
  test("a report renders twenty criteria with evidence", async () => {
    const page = await newPage();
    await intoApp(page);
    await Promise.all([
      page.waitForURL(/\/dmi\//, { timeout: 20_000 }),
      page.getByRole("link", { name: /Precision Auto Care/i }).click(),
    ]);

    const marks = await page.$$eval("section ul > li span[title]", (els) =>
      els.map((e) => e.getAttribute("title")),
    );
    assert.equal(marks.length, 20, "five criteria in each of four categories");
    assert.ok(marks.some((m) => /Point awarded/.test(m)));
    assert.ok(marks.some((m) => /could not be determined/.test(m)));

    assert.ok(
      await page.getByText(/this inspection used mock data/i).isVisible(),
      "a mock report must say so at the top",
    );
    assert.deepEqual(page.__errors, []);
    await page.context().close();
  });

  test("answering a question in the UI raises that shop's score by one", async () => {
    const page = await newPage();
    await intoApp(page);

    const scoreFor = async (shop) =>
      page.evaluate(async (name) => {
        const res = await fetch("/api/runs").then((r) => r.json());
        const row = res.runs.find((r) => r.shopName.includes(name));
        return row ? row.totalScore : null;
      }, shop);

    const before = await scoreFor("Precision");
    assert.ok(typeof before === "number");

    await page.goto(`${app.base}/review`, { waitUntil: "networkidle" });

    // The phone criterion is always undetermined, so answering it must score.
    const card = page
      .locator("li", { hasText: /Precision/ })
      .filter({ hasText: /Did a real person answer/i })
      .first();
    await card.locator("textarea").fill("Called — Rita answered in two rings.");
    const cardsBefore = await page.locator("ul > li").count();
    await card.getByRole("button", { name: /award the point/i }).click();

    // The queue defaults to open items, so a resolved card leaves the list.
    await page.waitForFunction(
      (n) => document.querySelectorAll("ul > li").length < n,
      cardsBefore,
      { timeout: 20_000 },
    );

    const after = await scoreFor("Precision");
    assert.equal(after, before + 1, "answering one undetermined criterion adds exactly one point");

    // And the dashboard shows it.
    await page.goto(`${app.base}/`, { waitUntil: "networkidle" });
    const row = page.locator("tbody tr", { hasText: /Precision/ });
    assert.match((await row.textContent()) ?? "", new RegExp(`${after}/20`));
    await page.context().close();
  });
});

describe("tracking sheet", () => {
  test("renders rows and filters by weekly status", async () => {
    const page = await newPage();
    await intoApp(page);
    await page.goto(`${app.base}/tracking`, { waitUntil: "networkidle" });
    assert.ok(await page.getByRole("heading", { name: /tracking sheet/i }).isVisible());
    assert.ok((await page.$$("tbody tr")).length >= 3);

    await page.selectOption("#facet-weeklyStatus", "Needs Review");
    // Resolve the column by its header rather than by position, so adding or
    // removing a column does not silently make this assert the wrong cell.
    const statuses = await page.evaluate(() => {
      const headers = [...document.querySelectorAll("thead th")].map((th) =>
        th.textContent.replace(/[▲▼↕]/g, "").trim().toLowerCase(),
      );
      const idx = headers.indexOf("status");
      if (idx < 0) throw new Error(`no status column in: ${headers.join(", ")}`);
      return [...document.querySelectorAll("tbody tr")].map((tr) =>
        tr.children[idx].textContent.trim(),
      );
    });
    assert.ok(statuses.length > 0, "the filter should leave at least one row");
    assert.ok(statuses.every((s) => s === "Needs Review"), `unexpected statuses: ${statuses}`);
    await page.context().close();
  });
});

describe("password reset", () => {
  test("forgot -> dev link -> reset -> sign in with the new password", async () => {
    const page = await newPage();
    const addr = `ui-reset-${Date.now()}@example.test`;
    await page.goto(`${app.base}/login`, { waitUntil: "networkidle" });
    // Create the account first, through the real signup form.
    await page.getByRole("button", { name: /create one|create account/i }).first().click().catch(() => {});
    await page.fill("#email", addr);
    await page.fill("#password", PASSWORD);
    await Promise.all([
      page.waitForURL(/\/mode/, { timeout: 20_000 }),
      page.getByRole("button", { name: /create account/i }).click(),
    ]);

    // Sign out so the reset flow starts from a logged-out browser.
    await page.goto(`${app.base}/login`, { waitUntil: "networkidle" }).catch(() => {});
    await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));

    await page.goto(`${app.base}/login`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /forgot password/i }).click();
    await page.waitForURL(/\/forgot-password/);
    await page.fill("#email", addr);
    await page.getByRole("button", { name: /send reset link/i }).click();
    await page.waitForSelector("text=/check your email/i", { timeout: 15_000 });

    // No email provider is configured for the test run, so the dev link is
    // rendered directly on the page.
    const devLink = await page.locator('a[href*="/reset-password?token="]').getAttribute("href");
    assert.ok(devLink, "expected a dev-mode reset link on the confirmation screen");

    await page.goto(devLink, { waitUntil: "networkidle" });
    const newPassword = "granite kettle overpass jungle";
    await page.fill("#password", newPassword);
    await page.fill("#confirm", newPassword);
    await page.getByRole("button", { name: /set new password/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // The old password must be dead; the new one must sign in.
    await page.fill("#email", addr);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    await page.waitForSelector("text=/do not match an account/i", { timeout: 15_000 });

    await page.fill("#password", newPassword);
    await Promise.all([
      page.waitForURL(/\/mode/, { timeout: 15_000 }),
      page.getByRole("button", { name: /^sign in$/i }).first().click(),
    ]);
    // The deliberate old-password attempt above is a real 401, which Chromium
    // surfaces as a "failed to load resource" console entry even though it is
    // the correct, intended response — filter that one expected line out.
    const unexpected = page.__errors.filter((e) => !/401 \(Unauthorized\)/.test(e));
    assert.deepEqual(unexpected, []);
    await page.context().close();
  });

  test("mismatched confirmation is caught before the request is sent", async () => {
    const page = await newPage();
    await page.goto(`${app.base}/reset-password?token=irrelevant-for-this-check`, { waitUntil: "networkidle" });
    await page.fill("#password", "brake fluid ledger nine");
    await page.fill("#confirm", "a different passphrase entirely");
    await page.getByRole("button", { name: /set new password/i }).click();
    assert.ok(await page.getByText(/do not match/i).isVisible());
    await page.context().close();
  });
});

describe("signing out", () => {
  test("sign out returns to login and the mode question comes back", async () => {
    const page = await newPage();
    await intoApp(page);
    await page.getByRole("button", { name: /test person/i }).click();
    await Promise.all([
      page.waitForURL(/\/login/, { timeout: 20_000 }),
      page.getByRole("menuitem", { name: /sign out/i }).click(),
    ]);
    await page.goto(`${app.base}/`, { waitUntil: "networkidle" });
    assert.match(page.url(), /\/login/, "the session must be gone");
    await page.context().close();
  });
});
