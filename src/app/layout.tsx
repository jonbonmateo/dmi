import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { RouteProgress } from "@/components/route-progress";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMI — Digital Marketing Inspection",
  description:
    "Automated Digital Marketing Inspection for automotive repair shops: website, SEO, advertising and social media, scored with evidence.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const THEME_KEY = "dmi-theme";

/**
 * Applies a previously-chosen dark theme before the first paint.
 *
 * The brand light theme is the default for everyone; dark only exists once a
 * visitor has explicitly flipped ThemeToggle, recorded in localStorage. This
 * runs synchronously (no `defer`/`type="module"`) so there is no flash of
 * the light theme for a visitor who chose dark last time. It needs the CSP
 * nonce middleware issues per request, since the production Content-Security-
 * Policy only allows inline scripts carrying it.
 */
const THEME_INIT = `(function(){try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark"){document.documentElement.setAttribute("data-theme","dark")}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          suppressHydrationWarning: React deliberately omits `nonce` from the
          server-rendered markup it diffs against for security (so it never
          shows up in devtools/view-source), which makes hydration always
          "mismatch" on this exact prop even though the browser executes the
          script correctly either way — a documented React quirk, not a bug.
        */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {/*
          Isolated from page content on purpose: this Suspense boundary
          wraps only this small floating indicator, never a page's own
          server component (see RouteProgress's own comment for why that
          distinction matters for redirect()-performing pages).
        */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
