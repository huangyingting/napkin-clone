"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { TEMPLATE_CATALOG } from "@/lib/templates/catalog";

import { createDocumentFromTemplate } from "./actions";

/**
 * A modal that lists the starter templates (name + description) so the user can
 * choose how a new document begins. Blank is listed first and remains the
 * default starting point.
 *
 * Selecting a template runs `createDocumentFromTemplate` in a transition (which
 * creates the document and redirects to its editor), showing a per-tile pending
 * state. The dialog closes on Escape, a backdrop click, or the Cancel button.
 */
function TemplatePicker({ onClose }: { onClose: () => void }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const choose = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      await createDocumentFromTemplate(id);
    });
  };

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
        aria-labelledby="template-picker-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black/[.06] bg-white p-6 shadow-xl dark:border-white/[.08] dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="template-picker-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Start a new document
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Pick a template or start blank.
            </p>
          </div>
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

        <ul className="mt-4 grid grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {TEMPLATE_CATALOG.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                aria-label={`${template.name} template`}
                disabled={isPending}
                onClick={() => choose(template.id)}
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-black/[.06] p-4 text-left transition hover:border-black/20 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.08] dark:hover:border-white/25 dark:hover:bg-zinc-900"
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {pendingId === template.id ? "Creating…" : template.name}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {template.description}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center justify-center rounded-full border border-black/[.06] px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/[.08] dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Opens the template picker so the user can choose how to start a new document.
 * Keeps the same props (`className`, `children`) as the previous submit button
 * so the header and empty-state call sites are unchanged.
 */
export function NewDocumentButton({
  className,
  children = "New document",
}: {
  className: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <TemplatePicker onClose={() => setOpen(false)} />}
    </>
  );
}
