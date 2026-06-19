"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { useTranslation } from "@/lib/i18n/locale-context";
import { isNewDocumentShortcut } from "@/lib/shortcuts/match";
import { useKeyboardShortcut } from "@/lib/shortcuts/use-keyboard-shortcuts";
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
  const t = useTranslation();
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
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ghost-border bg-ghost-bg p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="template-picker-title"
              className="text-base font-semibold text-ghost-text"
            >
              {t("templatePicker.title")}
            </h2>
            <p className="mt-1 text-sm text-ghost-secondary">
              {t("templatePicker.subtitle")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("templatePicker.close")}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
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
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-ghost-border p-4 text-left transition hover:border-ghost-accent/40 hover:bg-ghost-wash disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-sm font-medium text-ghost-text">
                  {pendingId === template.id
                    ? t("templatePicker.creating")
                    : template.name}
                </span>
                <span className="text-xs text-ghost-secondary">
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
            className="flex h-9 items-center justify-center rounded-full border border-ghost-border px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
          >
            {t("templatePicker.cancel")}
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
 *
 * When `enableShortcut` is set (only the always-present header instance does so,
 * to avoid double-handling when the empty-state button is also rendered), a bare
 * `n` keypress opens the picker.
 */
export function NewDocumentButton({
  className,
  children = "New document",
  enableShortcut = false,
}: {
  className: string;
  children?: React.ReactNode;
  enableShortcut?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useKeyboardShortcut(
    (event) => {
      if (isNewDocumentShortcut(event)) {
        event.preventDefault();
        setOpen(true);
      }
    },
    { enabled: enableShortcut },
  );

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <TemplatePicker onClose={() => setOpen(false)} />}
    </>
  );
}
