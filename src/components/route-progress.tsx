"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin top-of-page progress bar for client-side tab/link navigation.
 *
 * Deliberately NOT built on Next's `loading.tsx` file convention or a
 * `<Suspense>` boundary around page content: wrapping a page's own component
 * in Suspense means the server has to start streaming a 200 before that
 * page's `redirect()` calls (auth/mode checks) have run, so a plain HTTP
 * client (curl, this app's own e2e suite, or just a slow connection) can get
 * stuck on a frozen loading skeleton instead of the real redirect — a real
 * incident from an earlier attempt at exactly this feature. This component
 * only watches for navigation the same way a browser's own tab spinner
 * would — a click on an internal link — and never touches what the server
 * sends or when, so it can't affect a single response's status code.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = `${pathname}?${searchParams.toString()}`;
  const lastKey = useRef(key);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;

      setActive(true);
      // Any navigation that doesn't land within a couple of seconds (an
      // error page, an aborted request) clears itself rather than sticking
      // the bar on screen forever.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(false), 4000);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (key !== lastKey.current) {
      lastKey.current = key;
      setActive(false);
      if (timer.current) clearTimeout(timer.current);
    }
  }, [key]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className="no-print fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden"
      style={{ background: "var(--color-brand-soft)" }}
    >
      <div
        className="h-full w-1/3 animate-route-progress"
        style={{ background: "var(--color-brand)" }}
      />
    </div>
  );
}
