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
        className="flex h-9 max-w-[12rem] items-center gap-2 rounded-full border border-ghost-border p-1 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text sm:pr-3"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ghost-accent text-xs font-semibold text-white"
        >
          {displayName.charAt(0).toUpperCase() || "?"}
        </span>
        <span className="hidden truncate sm:inline">{displayName}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-ghost-border bg-ghost-bg py-1 shadow-lg"
        >
          <div className="border-b border-ghost-border px-3 py-2">
            <p className="truncate text-sm font-medium text-ghost-text">
              {trimmedName || "Your account"}
            </p>
            <p className="truncate text-xs text-ghost-secondary">{email}</p>
          </div>
          <Link
            href="/app/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
          >
            Settings
          </Link>
          <div className="border-t border-ghost-border">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
