"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { deleteDocument, restoreDocument } from "./actions";
import { DocumentCard, type DocumentCardData } from "./document-card";
import { NewDocumentButton } from "./new-document-button";

/** How long the "Document deleted — Undo" affordance stays visible. */
const UNDO_DURATION_MS = 6000;

/** A dashboard document plus the raw timestamps needed for client-side sorting. */
export type DashboardDocument = DocumentCardData & {
  createdAtMs: number;
  updatedAtMs: number;
};

const SORT_KEYS = ["edited", "title", "created"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "edited", label: "Last edited" },
  { value: "title", label: "Title (A–Z)" },
  { value: "created", label: "Date created" },
];

/** Coerces a raw URL value to a known sort key, defaulting to "edited". */
function parseSort(value: string | null): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "edited";
}

/** Returns a new array sorted by the chosen key (does not mutate the input). */
function sortDocuments(
  docs: DashboardDocument[],
  sort: SortKey,
): DashboardDocument[] {
  const copy = [...docs];
  switch (sort) {
    case "title":
      return copy.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
    case "created":
      return copy.sort((a, b) => b.createdAtMs - a.createdAtMs);
    case "edited":
    default:
      return copy.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }
}

const primaryButtonClass =
  "flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";

function UndoToast({ title, onUndo }: { title: string; onUndo: () => void }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/10 bg-zinc-900 px-5 py-3 text-sm text-white shadow-lg dark:border-black/20 dark:bg-zinc-100 dark:text-zinc-900"
      >
        <span className="truncate">
          Document deleted
          <span className="hidden text-zinc-400 sm:inline dark:text-zinc-500">
            {" "}
            — “{title}”
          </span>
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-full font-semibold text-indigo-300 underline-offset-2 transition hover:underline dark:text-indigo-600"
        >
          Undo
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Renders the dashboard document grid (or the empty state) and owns the
 * soft-delete lifecycle so the transient undo affordance can live above the
 * individual cards.
 *
 * Deletion is optimistic: the deleted id is hidden immediately and
 * `deleteDocument` (soft delete) runs in a transition while the server
 * revalidation reconciles the list. A single "Document deleted — Undo" toast is
 * shown for {@link UNDO_DURATION_MS} (>= the required 5s).
 *
 * Undo must restore the card instantly, but by the time it is clicked the
 * delete's `revalidatePath` has already dropped the document from the server
 * `documents` prop — so simply un-hiding the id is not enough. We keep the
 * deleted document's data (`restored`) and re-insert it locally until the
 * `restoreDocument` revalidation brings it back into `documents` (at which point
 * the duplicate guard drops the local copy).
 *
 * The toolbar adds a case-insensitive title search (client-side, local state)
 * and a sort control (Last edited / Title A–Z / Date created) whose selection
 * persists in the URL `sort` search param via the History API (kept in sync with
 * `useSearchParams`, so no server round-trip is needed to re-sort).
 */
export function DocumentList({
  documents,
}: {
  documents: DashboardDocument[];
}) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState<DashboardDocument[]>([]);
  const [undo, setUndo] = useState<DashboardDocument | null>(null);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const sort = parseSort(searchParams.get("sort"));

  const setSort = (next: SortKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (next === "edited") {
      params.delete("sort");
    } else {
      params.set("sort", next);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const handleDelete = useCallback(
    (data: DocumentCardData) => {
      // Stash the full sortable document (preserving any optimistic/renamed
      // title) so an undone card lands in the right place in the sorted list.
      const full = documents.find((document) => document.id === data.id);
      const stash: DashboardDocument = full
        ? { ...full, title: data.title }
        : { ...data, createdAtMs: Date.now(), updatedAtMs: Date.now() };
      setRemovedIds((prev) => new Set(prev).add(data.id));
      setRestored((prev) => prev.filter((item) => item.id !== data.id));
      setUndo(stash);
      clearTimer();
      timerRef.current = setTimeout(() => setUndo(null), UNDO_DURATION_MS);
      startTransition(async () => {
        await deleteDocument(data.id);
      });
    },
    [clearTimer, documents],
  );

  const handleUndo = useCallback(() => {
    if (!undo) {
      return;
    }
    const data = undo;
    setUndo(null);
    clearTimer();
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(data.id);
      return next;
    });
    setRestored((prev) => [
      data,
      ...prev.filter((item) => item.id !== data.id),
    ]);
    startTransition(async () => {
      await restoreDocument(data.id);
    });
  }, [undo, clearTimer]);

  const base = documents.filter((document) => !removedIds.has(document.id));
  const baseIds = new Set(base.map((document) => document.id));
  const extra = restored.filter(
    (item) => !baseIds.has(item.id) && !removedIds.has(item.id),
  );
  const combined = [...extra, ...base];

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? combined.filter((document) =>
        document.title.toLowerCase().includes(trimmedQuery),
      )
    : combined;
  const visible = sortDocuments(filtered, sort);

  const hasDocuments = combined.length > 0;

  return (
    <>
      {!hasDocuments ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              No documents yet
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Create your first document to start turning text into visuals.
            </p>
          </div>
          <NewDocumentButton className={primaryButtonClass}>
            Create your first document
          </NewDocumentButton>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search documents"
                placeholder="Search documents"
                className="h-10 w-full rounded-full border border-black/[.08] bg-white pl-9 pr-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/[.12] dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-700"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label
                htmlFor="sort-documents"
                className="text-sm text-zinc-500 dark:text-zinc-400"
              >
                Sort
              </label>
              <select
                id="sort-documents"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                aria-label="Sort documents"
                className="h-10 rounded-full border border-black/[.08] bg-white px-4 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/[.12] dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-700"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-zinc-950">
              <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                No documents match your search
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Try a different title or clear the search.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visible.map((document) => (
                <DocumentCard
                  key={document.id}
                  id={document.id}
                  title={document.title}
                  editedLabel={document.editedLabel}
                  workspaceName={document.workspaceName}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {undo && <UndoToast title={undo.title} onUndo={handleUndo} />}
    </>
  );
}
