import type { VisualKind } from "@/lib/visual/schema";

export interface TemplateEntry {
  /** Stable, URL-safe identifier used by createDocumentFromTemplate. */
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
