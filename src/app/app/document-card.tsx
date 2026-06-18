"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DocumentCardData = {
  id: string;
  title: string;
  editedLabel: string;
  workspaceName: string | null;
};

type DocumentCardProps = DocumentCardData & {
  onDelete: (data: DocumentCardData) => void;
};

function DocumentThumbnail() {
  return (
    <div className="flex aspect-[16/10] items-center justify-center bg-zinc-50 transition group-hover:bg-zinc-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-zinc-300 dark:text-zinc-600"
      >
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    </div>
  );
}

function DeleteConfirmDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-document-title"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-black/[.06] bg-white p-6 shadow-xl dark:border-white/[.08] dark:bg-zinc-950"
      >
        <h2
          id="delete-document-title"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Delete document?
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            “{title}”
          </span>{" "}
          will be moved to the trash. You can undo this right after.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 items-center justify-center rounded-full border border-black/[.06] px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/[.08] dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-9 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A dashboard document card: a navigable link plus an overflow (kebab) menu for
 * per-document actions. The kebab button and its dropdown live in a sibling of
 * the `<Link>` (not inside it) so opening the menu never triggers navigation.
 *
 * The menu uses the ref-containment click-outside pattern (per AGENTS.md): the
 * toggle button and the dropdown are both wrapped in `menuRef`, and a document
 * listener closes the menu only for clicks outside that container — no
 * `stopPropagation`, which would be unreliable under the App Router's delegated
 * events.
 *
 * Deletion is owned by the parent `DocumentList` (which manages optimistic
 * removal and the transient undo affordance): confirming the dialog calls the
 * `onDelete(id, title)` callback rather than deleting here.
 */
export function DocumentCard({
  id,
  title,
  editedLabel,
  workspaceName,
  onDelete,
}: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete({ id, title, editedLabel, workspaceName });
  };

  return (
    <li className="relative">
      <Link
        href={`/app/documents/${id}`}
        className="group flex flex-col overflow-hidden rounded-xl border border-black/[.06] bg-white transition hover:border-black/15 hover:shadow-sm dark:border-white/[.08] dark:bg-zinc-950 dark:hover:border-white/20"
      >
        <DocumentThumbnail />
        <div className="flex flex-col gap-1 p-4">
          <span className="truncate pr-7 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {title}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Edited {editedLabel}
            </span>
            {workspaceName && (
              <>
                <span className="text-xs text-zinc-300 dark:text-zinc-600">
                  ·
                </span>
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {workspaceName}
                </span>
              </>
            )}
          </div>
        </div>
      </Link>

      <div ref={menuRef} className="absolute right-2 top-2 z-10">
        <button
          type="button"
          aria-label={`Actions for ${title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-zinc-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-zinc-900 dark:bg-black/40 dark:text-zinc-300 dark:hover:bg-black/70 dark:hover:text-zinc-50"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-black/[.06] bg-white py-1 shadow-lg dark:border-white/[.08] dark:bg-zinc-900"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {confirmOpen && (
        <DeleteConfirmDialog
          title={title}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </li>
  );
}
