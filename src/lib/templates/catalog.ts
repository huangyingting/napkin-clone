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
  {
    id: "how-it-works",
    name: "How It Works",
    description: "Explain a system or product step by step.",
    visualKind: "list",
    content: [
      "# How it works",
      "",
      "Briefly describe what this system or product does.",
      "",
      "## Steps",
      "",
      "- Step 1: user provides input or initiates the action",
      "- Step 2: system processes and validates the request",
      "- Step 3: core operation is performed",
      "- Step 4: results are reviewed and confirmed",
      "- Step 5: output is delivered to the user",
      "",
    ].join("\n"),
  },
  {
    id: "timeline",
    name: "Timeline / Roadmap",
    description: "Lay out milestones or events along a time axis.",
    visualKind: "timeline",
    content: [
      "# Roadmap",
      "",
      "Describe the goal or initiative this roadmap supports.",
      "",
      "## Q1",
      "",
      "- Discovery and research",
      "- Define requirements",
      "",
      "## Q2",
      "",
      "- Design and prototyping",
      "- Internal review",
      "",
      "## Q3",
      "",
      "- Build and test",
      "- Beta release",
      "",
      "## Q4",
      "",
      "- General availability",
      "- Retrospective and planning",
      "",
    ].join("\n"),
  },
  {
    id: "org-team",
    name: "Org / Team",
    description: "Show team structure, roles, and reporting lines.",
    visualKind: "concept",
    content: [
      "# Team structure",
      "",
      "Describe the team's mission or area of ownership.",
      "",
      "## Leadership",
      "",
      "- Engineering Lead",
      "- Product Manager",
      "- Design Lead",
      "",
      "## Sub-teams",
      "",
      "- Frontend",
      "- Backend",
      "- Platform",
      "- QA",
      "",
    ].join("\n"),
  },
  {
    id: "pros-cons",
    name: "Pros & Cons",
    description: "List the advantages and drawbacks of a single option.",
    visualKind: "comparison",
    content: [
      "# Pros & Cons",
      "",
      "Name the option, decision, or change you are evaluating.",
      "",
      "## Pros",
      "",
      "- Clear benefit one",
      "- Clear benefit two",
      "- Clear benefit three",
      "",
      "## Cons",
      "",
      "- Drawback or risk one",
      "- Drawback or risk two",
      "- Drawback or risk three",
      "",
    ].join("\n"),
  },
  {
    id: "cycle",
    name: "Cycle / Loop",
    description: "Illustrate a repeating process or feedback loop.",
    visualKind: "cycle",
    content: [
      "# Cycle overview",
      "",
      "Describe the repeating process and why it matters.",
      "",
      "## Phases",
      "",
      "- Plan: set objectives and prepare",
      "- Execute: carry out the work",
      "- Measure: collect results and data",
      "- Improve: apply learnings and iterate",
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
