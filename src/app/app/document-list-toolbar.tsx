import type { AvailableTag } from "@/lib/document/list";
import { SelectMenu } from "@/components/ui";

import {
  SORT_OPTIONS,
  type SortKey,
  type ViewKey,
} from "./document-list-url-state";

function isSortKey(value: string): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value);
}

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
  const tagOptions = [
    { value: "", label: "All tags" },
    ...availableTags.map((tag) => ({ value: tag.slug, label: tag.name })),
  ];

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
            <SelectMenu
              value={selectedTag ?? ""}
              options={tagOptions}
              onChange={(value) => setTag(value || null)}
              aria-label="Filter by tag"
              buttonClassName="h-10 max-w-none rounded-full border border-ds-border-strong bg-ds-surface-base px-4 text-ds-text-primary hover:bg-ds-surface-sunken"
              menuClassName="w-44"
              scrollable={false}
              textSize="sm"
            />
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
        <SelectMenu
          value={sort}
          options={SORT_OPTIONS}
          onChange={(value) => {
            if (isSortKey(value)) setSort(value);
          }}
          aria-label="Sort documents"
          buttonClassName="h-10 max-w-none rounded-full border border-ds-border-strong bg-ds-surface-base px-4 text-ds-text-primary hover:bg-ds-surface-sunken"
          menuClassName="w-44"
          scrollable={false}
          textSize="sm"
        />
      </div>
    </div>
  );
}
