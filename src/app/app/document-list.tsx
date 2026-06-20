"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { deleteDocument, restoreDocument, searchDocuments } from "./actions";
import type { SearchResult } from "./actions";
import { DocumentCard, type DocumentCardData } from "./document-card";
import { NewDocumentButton } from "./new-document-button";

/** How long the "Document deleted — Undo" affordance stays visible. */
const UNDO_DURATION_MS = 6000;

/** Debounce delay (ms) before a server-side search fires. */
const SEARCH_DEBOUNCE_MS = 300;

/** A dashboard document plus the raw timestamps needed for client-side sorting. */
export type DashboardDocument = DocumentCardData & {
  createdAtMs: number;
  updatedAtMs: number;
  tags: { slug: string; name: string }[];
};

/** A tag available for filtering the dashboard. */
export type AvailableTag = { slug: string; name: string };

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

type ViewKey = "all" | "favorites";

/** Coerces a raw URL value to a known view, defaulting to "all". */
function parseView(value: string | null): ViewKey {
  return value === "favorites" ? "favorites" : "all";
}

/**
 * Returns a new array sorted by the chosen key (does not mutate the input).
 *
 * When `favoritesFirst` is set, starred documents float to the top of the grid
 * while preserving the chosen sort within the favorite and non-favorite groups
 * (`Array.prototype.sort` is stable, and the partition keeps relative order).
 */
function sortDocuments(
  docs: DashboardDocument[],
  sort: SortKey,
  favoritesFirst: boolean,
): DashboardDocument[] {
  const copy = [...docs];
  switch (sort) {
    case "title":
      copy.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
      break;
    case "created":
      copy.sort((a, b) => b.createdAtMs - a.createdAtMs);
      break;
    case "edited":
    default:
      copy.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      break;
  }
  if (favoritesFirst) {
    return [
      ...copy.filter((document) => document.favorite),
      ...copy.filter((document) => !document.favorite),
    ];
  }
  return copy;
}

const primaryButtonClass =
  "flex h-10 items-center justify-center rounded-full bg-ghost-accent px-5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60";

function UndoToast({ title, onUndo }: { title: string; onUndo: () => void }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-toast flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-4 rounded-full border border-ghost-border bg-ghost-text px-5 py-3 text-sm text-ghost-bg shadow-lg"
      >
        <span className="truncate">
          Document deleted
          <span className="hidden text-ghost-secondary sm:inline">
            {" "}
            — “{title}”
          </span>
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-full font-semibold text-ghost-accent underline-offset-2 transition hover:underline"
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
 * The toolbar adds a case-insensitive title search (client-side, local state),
 * a sort control (Last edited / Title A–Z / Date created), and a Favorites
 * filter. The sort and favorites selections persist in the URL (`sort` / `view`
 * search params) via the History API (kept in sync with `useSearchParams`, so no
 * server round-trip is needed); the search query is local-only. When the
 * Favorites filter is off, starred documents float to the top of the grid.
 */
export function DocumentList({
  documents,
  availableTags,
}: {
  documents: DashboardDocument[];
  availableTags: AvailableTag[];
}) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState<DashboardDocument[]>([]);
  const [undo, setUndo] = useState<DashboardDocument | null>(null);
  const [query, setQuery] = useState("");
  // Server-side search results: null = no active search (show all docs).
  const [searchResults, setSearchResults] = useState<
    DashboardDocument[] | null
  >(null);
  // Separate transition for search so isPending is scoped to search calls only.
  const [isSearchPending, startSearchTransition] = useTransition();
  const [, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const sort = parseSort(searchParams.get("sort"));
  const view = parseView(searchParams.get("view"));
  const viewFavorites = view === "favorites";
  const rawTag = searchParams.get("tag");
  // Only honor a tag slug that actually exists; otherwise treat as "all".
  const selectedTag =
    rawTag && availableTags.some((tag) => tag.slug === rawTag) ? rawTag : null;
  const selectedTagName =
    availableTags.find((tag) => tag.slug === selectedTag)?.name ?? null;

  // Persists a view-state param in the URL (dropping it for its default value)
  // via the History API. `useSearchParams` reflects this without a server round
  // trip, so the list re-renders instantly while the value survives reloads.
  const updateParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    mutate(params);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const setSort = (next: SortKey) => {
    updateParams((params) => {
      if (next === "edited") {
        params.delete("sort");
      } else {
        params.set("sort", next);
      }
    });
  };

  const setView = (next: ViewKey) => {
    updateParams((params) => {
      if (next === "all") {
        params.delete("view");
      } else {
        params.set("view", next);
      }
    });
  };

  const setTag = (next: string | null) => {
    updateParams((params) => {
      if (!next) {
        params.delete("tag");
      } else {
        params.set("tag", next);
      }
    });
  };

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // Debounced server-side search: fires SEARCH_DEBOUNCE_MS after the user stops
  // typing. When query is empty the last results are stale but `activePool`
  // (below) ignores them — no synchronous setState needed in the effect body.
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    const trimmed = query.trim();
    if (!trimmed) {
      searchDebounceRef.current = null;
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const results = await searchDocuments(trimmed);
        setSearchResults(
          results.map((r: SearchResult) => ({
            id: r.id,
            title: r.title,
            favorite: r.favorite,
            editedLabel: r.editedLabel,
            workspaceName: r.workspaceName,
            thumbnail: r.thumbnail,
            excerpt: r.excerpt,
            readingMinutes: r.readingMinutes,
            createdAtMs: r.createdAtMs,
            updatedAtMs: r.updatedAtMs,
            tags: r.tags,
          })),
        );
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [query]); // startSearchTransition is stable; searchDocuments is module-level

  const handleDelete = useCallback(
    (data: DocumentCardData) => {
      // Stash the full sortable document (preserving any optimistic/renamed
      // title) so an undone card lands in the right place in the sorted list.
      const full = documents.find((document) => document.id === data.id);
      const stash: DashboardDocument = full
        ? { ...full, title: data.title }
        : {
            ...data,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
            tags: [],
          };
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

  // When a search is active, use server results (filtered by removedIds);
  // otherwise fall through to the full server-rendered document list.
  const trimmedQuery = query.trim();
  const activePool: DashboardDocument[] = trimmedQuery
    ? (searchResults ?? []).filter((document) => !removedIds.has(document.id))
    : combined;

  const tagFiltered = selectedTag
    ? activePool.filter((document) =>
        document.tags.some((tag) => tag.slug === selectedTag),
      )
    : activePool;

  const favFiltered = viewFavorites
    ? tagFiltered.filter((document) => document.favorite)
    : tagFiltered;

  const visible = sortDocuments(favFiltered, sort, !viewFavorites);

  const hasDocuments = combined.length > 0;
  const noTagMatch = selectedTag !== null && tagFiltered.length === 0;
  const noFavorites = viewFavorites && favFiltered.length === 0;
  // Spinner shows while the search transition is pending AND the query is active.
  const isSearching = isSearchPending && Boolean(trimmedQuery);

  return (
    <>
      {!hasDocuments ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-ghost-border bg-ghost-bg px-6 py-16 text-center">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium text-ghost-text">
              No documents yet
            </h2>
            <p className="text-sm text-ghost-secondary">
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
              {isSearching ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ghost-accent"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost-secondary"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              )}
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search documents"
                placeholder="Search documents"
                className="h-10 w-full rounded-full border border-ghost-border bg-ghost-bg pl-9 pr-4 text-sm text-ghost-text outline-none transition placeholder:text-ghost-secondary focus:border-ghost-accent focus:ring-2 focus:ring-ghost-accent/30"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {availableTags.length > 0 && (
                <>
                  <label
                    htmlFor="filter-tag"
                    className="text-sm text-ghost-secondary"
                  >
                    Tag
                  </label>
                  <select
                    id="filter-tag"
                    value={selectedTag ?? ""}
                    onChange={(event) => setTag(event.target.value || null)}
                    aria-label="Filter by tag"
                    className="h-10 rounded-full border border-ghost-border bg-ghost-bg px-4 text-sm text-ghost-text outline-none transition focus:border-ghost-accent focus:ring-2 focus:ring-ghost-accent/30"
                  >
                    <option value="">All tags</option>
                    {availableTags.map((tag) => (
                      <option key={tag.slug} value={tag.slug}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                aria-label="Show favorites only"
                aria-pressed={viewFavorites}
                onClick={() => setView(viewFavorites ? "all" : "favorites")}
                className={`flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition ${
                  viewFavorites
                    ? "border-transparent bg-ghost-accent text-white"
                    : "border-ghost-border bg-ghost-bg text-ghost-secondary hover:text-ghost-text"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill={viewFavorites ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-amber-400"
                >
                  <path d="M12 17.27 6.18 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.82 4.73L17.82 21z" />
                </svg>
                Favorites
              </button>
              <label
                htmlFor="sort-documents"
                className="text-sm text-ghost-secondary"
              >
                Sort
              </label>
              <select
                id="sort-documents"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                aria-label="Sort documents"
                className="h-10 rounded-full border border-ghost-border bg-ghost-bg px-4 text-sm text-ghost-text outline-none transition focus:border-ghost-accent focus:ring-2 focus:ring-ghost-accent/30"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {noTagMatch ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ghost-border bg-ghost-bg px-6 py-16 text-center">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-medium text-ghost-text">
                  No documents tagged “{selectedTagName}”
                </h2>
                <p className="text-sm text-ghost-secondary">
                  Try a different tag or clear the filter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTag(null)}
                className="rounded-full border border-ghost-border bg-ghost-bg px-4 py-2 text-sm font-medium text-ghost-text transition hover:bg-ghost-wash"
              >
                Clear filter
              </button>
            </div>
          ) : noFavorites ? (
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-ghost-border bg-ghost-bg px-6 py-16 text-center">
              <h2 className="text-base font-medium text-ghost-text">
                No favorite documents yet
              </h2>
              <p className="text-sm text-ghost-secondary">
                Star a document to keep it here for quick access.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-ghost-border bg-ghost-bg px-6 py-16 text-center">
              <h2 className="text-base font-medium text-ghost-text">
                No documents match your search
              </h2>
              <p className="text-sm text-ghost-secondary">
                Try different keywords or clear the search. Searches cover
                titles and document content.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visible.map((document) => (
                <DocumentCard
                  key={document.id}
                  id={document.id}
                  title={document.title}
                  favorite={document.favorite}
                  editedLabel={document.editedLabel}
                  workspaceName={document.workspaceName}
                  thumbnail={document.thumbnail}
                  excerpt={document.excerpt}
                  readingMinutes={document.readingMinutes}
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
