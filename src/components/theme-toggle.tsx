"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "dmi-theme";

/**
 * Light is the default for everyone; dark exists only once someone clicks
 * this. No `prefers-color-scheme` following on purpose — see globals.css.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // Starts false (light) to match server-rendered markup; corrected on mount
  // from whatever the no-flash boot script (layout.tsx) already applied.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Reads a DOM attribute the no-flash boot script (layout.tsx) set outside
    // React before hydration — not state React owns, so this one-time
    // correction after mount is the actual fix, not something render-time
    // computation could replace (the server has no access to localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      if (next) localStorage.setItem(THEME_KEY, "dark");
      else localStorage.removeItem(THEME_KEY);
    } catch {
      /* private browsing / storage blocked — the toggle still works for this page load */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={`grid h-9 w-9 place-items-center rounded-lg text-[var(--color-ink-soft)] hover:bg-[var(--color-grey-soft)] ${className}`}
    >
      {dark ? (
        // sun — click to go back to light
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
          />
        </svg>
      ) : (
        // moon — click to go to dark
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
          />
        </svg>
      )}
    </button>
  );
}
