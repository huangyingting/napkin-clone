"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The header user menu: a dropdown showing the current user's name + email with
 * a link to account settings and a sign-out control (passed as `children` so the
 * sign-out server action stays in a server component).
 *
 * Uses the ref-containment click-outside pattern (per AGENTS.md): the toggle and
 * dropdown are both wrapped in `menuRef`, and a document listener closes the menu
 * only for clicks outside that container — no `stopPropagation`, which is
 * unreliable under the App Router's delegated events.
 */
export function UserMenu({
  name,
  email,
  children,
}: {
  name: string | null;
  email: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const trimmedName = name?.trim() ?? "";
  const displayName = trimmedName || email;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 max-w-[12rem] items-center gap-2 rounded-full border border-black/10 p-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 sm:pr-3 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900"
        >
          {displayName.charAt(0).toUpperCase() || "?"}
        </span>
        <span className="hidden truncate sm:inline">{displayName}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-black/[.06] bg-white py-1 shadow-lg dark:border-white/[.08] dark:bg-zinc-900"
        >
          <div className="border-b border-black/[.06] px-3 py-2 dark:border-white/[.08]">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {trimmedName || "Your account"}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {email}
            </p>
          </div>
          <Link
            href="/app/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Settings
          </Link>
          <div className="border-t border-black/[.06] dark:border-white/[.08]">
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
