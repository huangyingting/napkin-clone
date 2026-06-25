/**
 * Offline icon catalog backed by the bundled lucide-react package.
 *
 * This framework-free facade owns query behavior while static catalog/default
 * data lives in data.ts. Resolving a name to a renderable component is left
 * to consumers so this file stays pure and unit-testable.
 */

import { DEFAULT_ICON_NAMES, ICON_CATALOG } from "./data";
import type { IconEntry } from "./types";

export { DEFAULT_ICON_NAMES, ICON_CATALOG } from "./data";
export type { IconEntry } from "./types";

const ICON_NAME_SET: ReadonlySet<string> = new Set(
  ICON_CATALOG.map((entry) => entry.name),
);

const ICON_BY_NAME: ReadonlyMap<string, IconEntry> = new Map(
  ICON_CATALOG.map((entry) => [entry.name, entry]),
);

const DEFAULT_ICONS: readonly IconEntry[] = DEFAULT_ICON_NAMES.map((name) =>
  ICON_BY_NAME.get(name),
).filter((entry): entry is IconEntry => entry !== undefined);

const DEFAULT_LIMIT = 30;
const DEFAULT_SUGGESTION_LIMIT = 6;

/** Returns true when name is a known icon in the catalog. */
export function isKnownIcon(name: string | null | undefined): boolean {
  return name != null && ICON_NAME_SET.has(name);
}

/** Looks up a catalog entry by its canonical name, or undefined. */
export function getIconEntry(name: string): IconEntry | undefined {
  return ICON_BY_NAME.get(name);
}

function scoreEntry(entry: IconEntry, query: string): number {
  const name = entry.name.toLowerCase();
  let score = 0;

  if (name === query) score = Math.max(score, 100);
  else if (name.startsWith(query)) score = Math.max(score, 80);
  else if (name.includes(query)) score = Math.max(score, 60);

  for (const keyword of entry.keywords) {
    const value = keyword.toLowerCase();
    if (value === query) score = Math.max(score, 70);
    else if (value.startsWith(query)) score = Math.max(score, 50);
    else if (value.includes(query)) score = Math.max(score, 30);
  }

  return score;
}

/**
 * Ranks catalog icons by relevance to query. Matching is case-insensitive and
 * considers both the icon name and its keywords. An empty (or whitespace-only)
 * query returns a curated default set. Results are deterministic: ties break
 * alphabetically by name.
 */
export function searchIcons(
  query: string,
  limit: number = DEFAULT_LIMIT,
): IconEntry[] {
  const max = Math.max(0, Math.floor(limit));
  if (max === 0) return [];

  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return DEFAULT_ICONS.slice(0, max);
  }

  const matches: { entry: IconEntry; score: number }[] = [];
  for (const entry of ICON_CATALOG) {
    const score = scoreEntry(entry, normalized);
    if (score > 0) matches.push({ entry, score });
  }

  matches.sort(
    (a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name),
  );

  return matches.slice(0, max).map((match) => match.entry);
}

/**
 * Suggests icons for a node label by searching the full label first, then
 * individual words as fallbacks. Results are de-duplicated in discovery order.
 */
export function suggestIconsForLabel(
  label: string,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): IconEntry[] {
  const max = Math.max(0, Math.floor(limit));
  if (max === 0) return [];

  const trimmed = label.trim();
  if (!trimmed) {
    return [];
  }

  const seen = new Set<string>();
  const suggestions: IconEntry[] = [];
  const queries = [
    trimmed,
    ...trimmed
      .split(/[^A-Za-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  ];

  for (const query of queries) {
    for (const entry of searchIcons(query, max)) {
      if (seen.has(entry.name)) {
        continue;
      }
      seen.add(entry.name);
      suggestions.push(entry);
      if (suggestions.length >= max) {
        return suggestions;
      }
    }
  }

  return suggestions;
}

/** Throws when static icon data/defaults drift out of sync. */
export function assertIconCatalogCompleteness(): void {
  if (ICON_CATALOG.length === 0) {
    throw new Error("[icons] Catalog must contain at least one icon");
  }

  const seen = new Set<string>();
  for (const entry of ICON_CATALOG) {
    if (!entry.name) {
      throw new Error("[icons] Catalog entry is missing a name");
    }
    if (seen.has(entry.name)) {
      throw new Error("[icons] Duplicate icon name: " + entry.name);
    }
    seen.add(entry.name);

    if (entry.keywords.length === 0) {
      throw new Error(
        "[icons] " + entry.name + " must have at least one keyword",
      );
    }
  }

  const defaultSeen = new Set<string>();
  for (const name of DEFAULT_ICON_NAMES) {
    if (!ICON_NAME_SET.has(name)) {
      throw new Error("[icons] Default icon is missing from catalog: " + name);
    }
    if (defaultSeen.has(name)) {
      throw new Error("[icons] Duplicate default icon: " + name);
    }
    defaultSeen.add(name);
  }

  if (DEFAULT_ICONS.length !== DEFAULT_ICON_NAMES.length) {
    throw new Error("[icons] Default icon index drifted from default names");
  }
}
