/**
 * Starter template catalog for new documents.
 *
 * Each entry pairs human-friendly metadata with a chunk of Markdown `content`
 * (parseable by `parseMarkdown`) and an optional `visualKind` hint for the kind
 * of visual the structure lends itself to. "Create a document from a template"
 * (US-014) seeds a new document's `content` from the chosen entry.
 *
 * This module is intentionally framework-free (no React/Next imports) so it
 * stays pure and unit-testable under `node --test` + `tsx`. Markdown blocks are
 * blank-line separated so `parseMarkdown` keeps them as distinct blocks rather
 * than joining consecutive lines into one paragraph.
 */

import type { VisualKind } from "@/lib/visual/schema";

export interface TemplateEntry {
  /** Stable, URL-safe identifier used by `createDocumentFromTemplate`. */
  id: string;
  /** Short display name shown in the template picker. */
  name: string;
  /** One-line description of what the template is good for. */
  description: string;
  /** Markdown seed content; always parses to at least one block. */
  content: string;
  /** Visual kind the structure suits, if any. */
  visualKind?: VisualKind;
}

/** Id of the default "Blank" template (the fallback for an unknown id). */
export const BLANK_TEMPLATE_ID = "blank";

export const TEMPLATE_CATALOG: TemplateEntry[] = [
  {
    id: BLANK_TEMPLATE_ID,
    name: "Blank",
    description: "Start from scratch with an empty document.",
    content: "# Untitled\n",
  },
  {
    id: "flowchart",
    name: "Process / Flowchart",
    description: "Map a step-by-step process from start to finish.",
    visualKind: "flowchart",
    content: [
      "# Process overview",
      "",
      "Describe the goal of this process in a sentence or two.",
      "",
      "## Steps",
      "",
      "- Start: capture the incoming request",
      "- Review the details and gather context",
      "- Take the main action",
      "- Verify the result",
      "- Finish: notify and close out",
      "",
    ].join("\n"),
  },
  {
    id: "mindmap",
    name: "Mind Map",
    description: "Brainstorm a central idea and its branches.",
    visualKind: "mindmap",
    content: [
      "# Central idea",
      "",
      "What is the one concept everything else connects to?",
      "",
      "## Branches",
      "",
      "- First branch",
      "- Second branch",
      "- Third branch",
      "- Fourth branch",
      "",
    ].join("\n"),
  },
  {
    id: "comparison",
    name: "Comparison",
    description: "Weigh two or more options side by side.",
    visualKind: "comparison",
    content: [
      "# Comparison",
      "",
      "State the decision you are trying to make.",
      "",
      "## Option A",
      "",
      "- Strength of option A",
      "- Trade-off of option A",
      "",
      "## Option B",
      "",
      "- Strength of option B",
      "- Trade-off of option B",
      "",
    ].join("\n"),
  },
];

/** Returns the template with the given id, or `undefined` if none matches. */
export function getTemplate(id: string): TemplateEntry | undefined {
  return TEMPLATE_CATALOG.find((entry) => entry.id === id);
}

/**
 * Returns the template with the given id, falling back to the Blank template
 * when the id is unknown/missing. `createDocumentFromTemplate` (US-014) uses
 * this so an invalid id degrades gracefully to a blank document.
 */
export function getTemplateOrBlank(
  id: string | null | undefined,
): TemplateEntry {
  const entry = id ? getTemplate(id) : undefined;
  return entry ?? getTemplate(BLANK_TEMPLATE_ID)!;
}
