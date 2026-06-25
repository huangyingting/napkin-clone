import type { DashboardDocument } from "@/lib/document-management/list";

export const SORT_KEYS = ["edited", "title", "created"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "edited", label: "Last edited" },
  { value: "title", label: "Title (A–Z)" },
  { value: "created", label: "Date created" },
];

export type ViewKey = "all" | "favorites";

type SearchParamsLike = {
  get(name: string): string | null;
  entries(): IterableIterator<[string, string]>;
};

export function parseSort(value: string | null): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "edited";
}

export function parseView(value: string | null): ViewKey {
  return value === "favorites" ? "favorites" : "all";
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
