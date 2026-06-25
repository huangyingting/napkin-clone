import type { AvailableTag } from "@/lib/document-management/list";

import {
  SORT_OPTIONS,
  type SortKey,
  type ViewKey,
} from "./document-list-url-state";

export function DocumentListToolbar({
  availableTags,
  query,
  setQuery,
  isSearching,
  selectedTag,
  setTag,
  sort,
  setSort,
  view,
  setView,
}: {
  availableTags: AvailableTag[];
  query: string;
  setQuery: (query: string) => void;
  isSearching: boolean;
  selectedTag: string | null;
  setTag: (tag: string | null) => void;
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  view: ViewKey;
  setView: (view: ViewKey) => void;
}) {
  const viewFavorites = view === "favorites";

  return (
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
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ds-accent"
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
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-secondary"
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
          className="h-10 w-full rounded-full border border-ds-border-strong bg-ds-surface-base pl-9 pr-4 text-sm text-ds-text-primary outline-none transition placeholder:text-ds-text-secondary focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {availableTags.length > 0 && (
          <>
            <label
              htmlFor="filter-tag"
              className="text-sm text-ds-text-secondary"
            >
              Tag
            </label>
            <select
              id="filter-tag"
              value={selectedTag ?? ""}
              onChange={(event) => setTag(event.target.value || null)}
              aria-label="Filter by tag"
              className="h-10 rounded-full border border-ds-border-strong bg-ds-surface-base px-4 text-sm text-ds-text-primary outline-none transition focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30"
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
              ? "border-transparent bg-ds-accent text-ds-text-on-accent"
              : "border-ds-border-strong bg-ds-surface-base text-ds-text-secondary hover:text-ds-text-primary"
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
            className="h-4 w-4 text-ds-warning"
          >
            <path d="M12 17.27 6.18 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.82 4.73L17.82 21z" />
          </svg>
          Favorites
        </button>
        <label
          htmlFor="sort-documents"
          className="text-sm text-ds-text-secondary"
        >
          Sort
        </label>
        <select
          id="sort-documents"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort documents"
          className="h-10 rounded-full border border-ds-border-strong bg-ds-surface-base px-4 text-sm text-ds-text-primary outline-none transition focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
