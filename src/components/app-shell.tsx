import Link from "next/link";
import type { AuthContext } from "@/lib/auth/types";
import { ModeBadge } from "./ui";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";

/**
 * The signed-in chrome: nav, the mode banner, and the user menu.
 *
 * The mode banner is a full-width bar rather than a discreet chip on purpose.
 * Whether a DMI is built from real observations or fixtures is the single
 * most consequential fact about what is on screen, so it is impossible to
 * miss and impossible to confuse with the page content.
 */
export function AppShell({
  auth,
  active,
  openReviews = 0,
  children,
}: {
  auth: AuthContext;
  active: "runs" | "review" | "tracking" | "setup" | "onboarding" | null;
  openReviews?: number;
  children: React.ReactNode;
}) {
  const mode = auth.mode;
  const nav: { href: string; label: string; key: typeof active; badge?: number }[] = [
    { href: "/", label: "Inspections", key: "runs" },
    { href: "/review", label: "Review queue", key: "review", badge: openReviews },
    { href: "/tracking", label: "Tracking sheet", key: "tracking" },
  ];
  // Setup exposes what's wired up (and what a live run degrades to when it
  // isn't) — connection status, not secrets, but still not something every
  // signed-in role needs to see day to day.
  if (auth.user.role === "admin") {
    nav.push({ href: "/setup", label: "Admin Dev Setup", key: "setup" });
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      {mode && (
        <div
          role="status"
          className="no-print border-b px-6 py-2 text-center text-[13px] font-medium"
          style={{
            background: mode === "live" ? "var(--color-live-soft)" : "var(--color-mock-soft)",
            borderColor: mode === "live" ? "var(--color-live-line)" : "var(--color-mock-line)",
            color: mode === "live" ? "var(--color-live)" : "var(--color-mock)",
          }}
        >
          {mode === "live" ? (
            <>
              <strong>Live mode.</strong> Inspections call real APIs, read real websites and write to
              GoHighLevel and the tracking sheet.
            </>
          ) : (
            <>
              <strong>Mock mode.</strong> Every finding comes from bundled fixtures, not real
              observations. Nothing here is a real inspection of a real shop.
            </>
          )}{" "}
          <span className="opacity-75">Sign out and back in to switch.</span>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
            <span
              aria-hidden
              className="relative grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-[var(--color-brand)] text-[13px] font-bold text-white"
            >
              D
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--color-brand-accent)]"
              />
            </span>
            <span>DMI</span>
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active === item.key
                    ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-grey-soft)]"
                }`}
              >
                {item.label}
                {item.badge ? (
                  <span className="ml-1.5 rounded-full bg-[var(--color-yellow-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-yellow)]">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {mode && <ModeBadge mode={mode} />}
            <ThemeToggle />
            <UserMenu
              name={auth.user.name ?? auth.user.email ?? "Account"}
              role={auth.user.role}
              email={auth.user.email}
            />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
