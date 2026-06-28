/**
 * Starter template catalog facade for new documents.
 *
 * Static template entries live in data.ts; lookup and fallback behavior stays
 * here so callers keep using one framework-free public catalog module.
 */

import { BLANK_TEMPLATE_ID, TEMPLATE_CATALOG } from "./data";
import type { TemplateEntry } from "./types";

export { BLANK_TEMPLATE_ID, TEMPLATE_CATALOG } from "./data";
export type { TemplateEntry } from "./types";

const TEMPLATE_BY_ID: ReadonlyMap<string, TemplateEntry> = new Map(
  TEMPLATE_CATALOG.map((entry) => [entry.id, entry]),
);

/** Returns the template with the given id, or undefined if none matches. */
export function getTemplate(id: string): TemplateEntry | undefined {
  return TEMPLATE_BY_ID.get(id);
}

/**
 * Returns the template with the given id, falling back to the Blank template
 * when the id is unknown/missing. createDocumentFromTemplate (US-014) uses
 * this so an invalid id degrades gracefully to a blank document.
 */
export function getTemplateOrBlank(
  id: string | null | undefined,
): TemplateEntry {
  const entry = id ? getTemplate(id) : undefined;
  return entry ?? getTemplate(BLANK_TEMPLATE_ID)!;
}

/** Throws when static template data and lookup defaults drift out of sync. */
export function assertTemplateCatalogCompleteness(): void {
  if (TEMPLATE_CATALOG.length === 0) {
    throw new Error("[templates] Catalog must contain at least one template");
  }

  const seen = new Set<string>();
  for (const entry of TEMPLATE_CATALOG) {
    if (!entry.id) {
      throw new Error("[templates] Catalog entry is missing an id");
    }
    if (seen.has(entry.id)) {
      throw new Error("[templates] Duplicate template id: " + entry.id);
    }
    seen.add(entry.id);

    if (!entry.name || !entry.description) {
      throw new Error(
        "[templates] " + entry.id + " is missing display metadata",
      );
    }
    if (typeof entry.content !== "string") {
      throw new Error("[templates] " + entry.id + " content must be a string");
    }
  }

  const blank = getTemplate(BLANK_TEMPLATE_ID);
  if (!blank) {
    throw new Error("[templates] Missing blank template: " + BLANK_TEMPLATE_ID);
  }
  if (getTemplateOrBlank("__missing__") !== blank) {
    /* node:coverage ignore next 2 -- defensive static-catalog drift guard cannot be reached by public APIs. */
    throw new Error("[templates] Unknown template fallback drifted from blank");
  }
}
