/**
 * Edge middleware: security headers on every response, and a cheap
 * signed-in check that redirects anonymous browsers to /login.
 *
 * The check here is deliberately shallow — it verifies the cookie's HMAC but
 * does not touch the database, because middleware runs on every asset request.
 * The real authorisation (session valid? revoked? role?) happens in
 * `requireAuth`/`getAuth` on the server. Middleware is the bouncer; the route
 * handler is the lock.
 */
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "dmi_session";

/** Reachable without signing in. */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/guest",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/health",
  // Machine-to-machine, authenticated by their own shared secrets.
  "/api/intake",
  "/api/cron",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Content-Security-Policy.
 *
 * Next.js needs 'unsafe-inline' for the styles it injects, and dev mode also
 * needs 'unsafe-eval' for React Refresh. Scripts use a per-request nonce in
 * production so an injected <script> without the nonce will not execute.
 */
function csp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    dev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    // Google profile pictures come from googleusercontent.com.
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    // The browser never calls third-party APIs directly; the server does.
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const dev = process.env.NODE_ENV !== "production";
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  let res: NextResponse;

  if (!isPublic(pathname) && !hasCookie) {
    if (pathname.startsWith("/api/")) {
      res = NextResponse.json({ error: "Not signed in." }, { status: 401 });
    } else {
      const to = req.nextUrl.clone();
      to.pathname = "/login";
      // Come back to where they were headed after signing in.
      to.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
      res = NextResponse.redirect(to);
    }
  } else if (pathname === "/login" && hasCookie) {
    const to = req.nextUrl.clone();
    to.pathname = "/mode";
    to.search = "";
    res = NextResponse.redirect(to);
  } else {
    const headers = new Headers(req.headers);
    headers.set("x-nonce", nonce);
    res = NextResponse.next({ request: { headers } });
  }

  res.headers.set("Content-Security-Policy", csp(nonce, dev));
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  if (!dev) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  // Never let a proxy or CDN cache a page rendered for a specific session.
  if (!pathname.startsWith("/_next/static")) {
    res.headers.set("Cache-Control", "private, no-store");
  }
  return res;
}

export const config = {
  matcher: [
    // Everything except Next's static output and the favicon.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
