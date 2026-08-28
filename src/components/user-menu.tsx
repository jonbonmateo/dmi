"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";

export function UserMenu({
  name,
  role,
  email,
}: {
  name: string;
  role: string;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    await apiPost("/api/auth/logout", {});
    router.push("/login");
    router.refresh();
  }

  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-grey-soft)]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-grey-soft)] text-[11px] font-bold text-[var(--color-ink-soft)]">
          {initials || "?"}
        </span>
        <span className="hidden text-sm font-medium sm:inline">{name}</span>
        <span aria-hidden className="text-[10px] text-[var(--color-muted)]">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-pop)]"
        >
          <div className="border-b border-[var(--color-line)] px-3 py-2.5">
            <p className="text-sm font-semibold">{name}</p>
            {email && <p className="truncate text-xs text-[var(--color-muted)]">{email}</p>}
            <p className="mt-1 inline-block rounded bg-[var(--color-grey-soft)] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {role}
            </p>
          </div>
          <Link
            href="/onboarding"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-grey-soft)]"
          >
            Replay the tour
          </Link>
          <Link
            href="/setup"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-grey-soft)]"
          >
            Setup &amp; connections
          </Link>
          <button
            role="menuitem"
            onClick={signOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--color-red)] hover:bg-[var(--color-red-soft)]"
          >
            Sign out
            <span className="block text-xs text-[var(--color-muted)]">
              Signing back in is how you change mode
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
