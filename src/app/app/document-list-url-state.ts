import type { DashboardDocument } from "@/lib/document/list";

export const SORT_KEYS = ["edited", "title", "created"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "edited", label: "Last edited" },
  { value: "title", label: "Title (A–Z)" },
  { value: "created", label: "Date created" },
];

export type ViewKey = "all" | "favorites";

type SearchParamsLike = {
  entries(): IterableIterator<[string, string]>;
};

export function parseSort(value: string | null): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "edited";
}

export function parseView(value: string | null): ViewKey {
  return value === "favorites" ? "favorites" : "all";
}

export function parseTag(
  value: string | null,
  availableTags: { slug: string }[],
): string | null {
  if (!value) return null;
  return availableTags.some((tag) => tag.slug === value) ? value : null;
}

export function replaceDocumentListQueryState(
  pathname: string,
  searchParams: SearchParamsLike,
  mutate: (params: URLSearchParams) => void,
): void {
  const params = new URLSearchParams(Array.from(searchParams.entries()));
  mutate(params);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
}

export function sortDocuments(
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
  if (!favoritesFirst) return copy;
  return [
    ...copy.filter((document) => document.favorite),
    ...copy.filter((document) => !document.favorite),
  ];
}

export function filterDocumentsByTag(
  docs: DashboardDocument[],
  tagSlug: string | null,
): DashboardDocument[] {
  return tagSlug
    ? docs.filter((document) =>
        document.tags.some((tag) => tag.slug === tagSlug),
      )
    : docs;
}

export function filterDocumentsByView(
  docs: DashboardDocument[],
  view: ViewKey,
): DashboardDocument[] {
  return view === "favorites"
    ? docs.filter((document) => document.favorite)
    : docs;
}

export function applyDocumentListViewState(
  docs: DashboardDocument[],
  state: { sort: SortKey; view: ViewKey; tagSlug: string | null },
): DashboardDocument[] {
  const tagFiltered = filterDocumentsByTag(docs, state.tagSlug);
  const favoriteFiltered = filterDocumentsByView(tagFiltered, state.view);
  return sortDocuments(
    favoriteFiltered,
    state.sort,
    state.view !== "favorites",
  );
}
