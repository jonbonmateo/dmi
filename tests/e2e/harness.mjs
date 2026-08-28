/**
 * Boots the real app on a throwaway port with its own data directory, so the
 * end-to-end suite exercises middleware, cookies, CSRF and rate limiting
 * exactly as a browser would meet them — and leaves no state behind.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Signals the whole process group, so npx's child dies with it. */
function killGroup(proc, signal) {
  if (!proc.pid) return;
  try {
    process.kill(-proc.pid, signal);
  } catch {
    try {
      proc.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

export async function startApp({ seed = true } = {}) {
  const port = await freePort();
  const dataDir = `.data/e2e-${port}`;
  const cwd = process.cwd();
  await fs.rm(path.resolve(cwd, dataDir), { recursive: true, force: true });

  const env = {
    ...process.env,
    // ---------------------------------------------------------------------
    // CRITICAL: blank out every real credential, explicitly.
    //
    // `next start` loads `.env`/`.env.production*` from its cwd itself, on
    // top of whatever env this spawn() call provides — Next's dotenv loader
    // fills in any key that is not *already present* in process.env, even if
    // the intent here was just "don't pass one along." A developer's real
    // `.env` in this same project directory (Supabase creds, API keys) would
    // otherwise leak straight into this throwaway server. Setting each key
    // to "" here counts as "already present" to that loader, so the real
    // values in `.env` are never read for this child process — the local
    // JSON store and fixture-backed providers are used unconditionally, and
    // nothing in this suite can ever write to a real database or call a real
    // API, no matter what the developer's own `.env` happens to contain.
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    PAGESPEED_API_KEY: "",
    GOOGLE_MAPS_API_KEY: "",
    META_AD_LIBRARY_TOKEN: "",
    GHL_API_KEY: "",
    GHL_LOCATION_ID: "",
    ZAPIER_TRACKING_WEBHOOK_URL: "",
    ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL: "",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    AUTH_ALLOWED_DOMAINS: "",
    RESEND_API_KEY: "",
    EMAIL_FROM: "",
    DMI_INTAKE_SECRET: "",
    CRON_SECRET: "",
    // ---------------------------------------------------------------------
    PORT: String(port),
    NODE_ENV: "production",
    DMI_DATA_DIR: dataDir,
    DMI_LOG_LEVEL: "error",
    AUTH_SECRET: "e2e-secret-only-used-by-the-test-suite",
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    AUTH_ALLOW_GUEST: "1",
    AUTH_ALLOW_SIGNUP: "1",
    // Safe here only because the e2e server is bound to localhost on a
    // throwaway port for the life of one test run. Never set this on a real
    // deployment — see the warning on env.devResetLinks.
    DMI_DEV_RESET_LINKS: "1",
    // No provider credentials: live mode must be unavailable, which is one of
    // the things the suite asserts.
    DMI_FORCE_MOCK: "",
  };

  if (seed) {
    await new Promise((resolve, reject) => {
      const p = spawn("npx", ["tsx", "scripts/seed.ts"], {
        cwd,
        env: { ...env, DMI_FORCE_MOCK: "1" },
        stdio: "ignore",
      });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed exited ${code}`))));
      p.on("error", reject);
    });
  }

  // `detached` puts the server in its own process group. npx spawns next as a
  // child, so killing the npx pid alone would orphan the actual server and the
  // test file would hang on a live port until it timed out.
  const proc = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd,
    env,
    stdio: "pipe",
    detached: true,
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  // Nothing about this child should keep the test runner's event loop alive.
  proc.unref();

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > deadline) {
      killGroup(proc, "SIGKILL");
      throw new Error(`server did not start in time:\n${log}`);
    }
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    base,
    port,
    log: () => log,
    async stop() {
      killGroup(proc, "SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      killGroup(proc, "SIGKILL");
      // Open pipes are handles too; drop them so the runner can exit.
      proc.stdout?.destroy();
      proc.stderr?.destroy();
      await fs.rm(path.resolve(cwd, dataDir), { recursive: true, force: true });
    },
  };
}

let clientSeq = 0;

/**
 * A tiny cookie-jar fetch, so the API suite behaves like one browser.
 *
 * Each client presents its own X-Forwarded-For address. Without that every
 * client would share one IP and trip the per-IP signup/login burst caps —
 * which is the rate limiter working correctly, but it would mask everything
 * else. The limiter itself is exercised deliberately, from a single client,
 * in its own test.
 */
export function makeClient(base, ip = `203.0.113.${(clientSeq++ % 250) + 1}`) {
  const jar = new Map();

  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const absorb = (res) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }
  };

  async function call(method, url, body, extraHeaders = {}) {
    const headers = { "x-forwarded-for": ip, ...extraHeaders };
    const cookies = cookieHeader();
    if (cookies) headers.cookie = cookies;
    if (body !== undefined) headers["content-type"] = "application/json";
    // Mirror the browser's double-submit CSRF behaviour.
    const csrf = jar.get("dmi_csrf");
    if (csrf && method !== "GET") headers["x-dmi-csrf"] = decodeURIComponent(csrf);

    const res = await fetch(`${base}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    absorb(res);
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }

  return {
    jar,
    get: (u, h) => call("GET", u, undefined, h),
    post: (u, b, h) => call("POST", u, b ?? {}, h),
    patch: (u, b, h) => call("PATCH", u, b ?? {}, h),
    /** Deliberately omits the CSRF header, to prove it is enforced. */
    postWithoutCsrf: async (u, b) => {
      const headers = { "content-type": "application/json", "x-forwarded-for": ip };
      const cookies = cookieHeader();
      if (cookies) headers.cookie = cookies;
      const res = await fetch(`${base}${u}`, {
        method: "POST",
        headers,
        body: JSON.stringify(b ?? {}),
        redirect: "manual",
      });
      let data = null;
      try {
        data = JSON.parse(await res.text());
      } catch {
        /* ignore */
      }
      return { status: res.status, data };
    },
  };
}
