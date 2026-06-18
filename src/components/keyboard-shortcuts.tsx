"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  SHORTCUT_SCOPES,
  shortcutsForScope,
  type ShortcutEntry,
} from "@/lib/shortcuts/catalog";
import { isHelpShortcut } from "@/lib/shortcuts/match";
import { useKeyboardShortcut } from "@/lib/shortcuts/use-keyboard-shortcuts";

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((token, index) => (
        <kbd
          key={`${token}-${index}`}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-black/[.08] bg-zinc-100 px-1.5 text-xs font-medium text-zinc-700 dark:border-white/[.12] dark:bg-zinc-800 dark:text-zinc-200"
        >
          {token}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-black/[.06] bg-white p-6 shadow-xl dark:border-white/[.08] dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="shortcuts-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-5 overflow-y-auto">
          {SHORTCUT_SCOPES.map((scope) => {
            const entries: ShortcutEntry[] = shortcutsForScope(scope);
            if (entries.length === 0) {
              return null;
            }
            return (
              <div key={scope} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {scope}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {entries.map((entry) => (
                    <li
                      key={entry.description}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {entry.description}
                      </span>
                      <KeyCombo keys={entry.keys} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A discoverable "?" button (in the site header) plus the global `?` shortcut,
 * both of which open a dialog listing the available keyboard shortcuts.
 */
export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useKeyboardShortcut((event) => {
    if (isHelpShortcut(event)) {
      event.preventDefault();
      setOpen((value) => !value);
    }
  });

  return (
    <>
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 sm:flex dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        ?
      </button>
      {open && <ShortcutsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
