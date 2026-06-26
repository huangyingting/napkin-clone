/**
 * Pure, DOM-free helper for labelling a slide in the thumbnail rail and other
 * chrome. Derivation order:
 *
 *  1. the highest-priority heading text element (`textRole` h1, then h2, h3);
 *  2. otherwise the first non-empty `text` element;
 *  3. otherwise a title placeholder label;
 *  4. otherwise the positional fallback `"Slide N"` (1-based).
 *
 * No React, no DOM — fully testable under `node --test`.
 */

import { type Slide, type TextElement } from "./deck";

/**
 * The slide's effective title (without any positional fallback). The title is
 * read from the highest-priority heading text element (`textRole` h1 → h2 → h3)
 * so on-stage edits stay the single source of truth. Returns `""` when no
 * heading element yields a non-empty title.
 *
 * Shared by {@link deriveSlideTitle} (rail label) and `deck-merge` (sync
 * matching key) so the displayed title and the matching key never drift apart —
 * a renamed title element matches its slide instead of orphaning it.
 */
const TITLE_ROLE_PRIORITY = ["h1", "h2", "h3"] as const;

export function slideEffectiveTitle(slide: Slide): string {
  const elements = slide.elements ?? [];
  for (const role of TITLE_ROLE_PRIORITY) {
    const heading = elements.find(
      (element): element is TextElement =>
        element.kind === "text" &&
        element.textRole === role &&
        element.text.trim().length > 0,
    );
    if (heading) {
      return heading.text.trim();
    }
  }
  return "";
}

/** Derives a human-readable title for `slide` at zero-based `index`. */
export function deriveSlideTitle(slide: Slide, index: number): string {
  const effective = slideEffectiveTitle(slide);
  if (effective) {
    return effective;
  }

  // Labelling-only fallback: a slide with body text but no title element still
  // gets a real label rather than "Slide N".
  const texts = (slide.elements ?? []).filter(
    (element): element is TextElement =>
      element.kind === "text" && element.text.trim().length > 0,
  );
  if (texts[0]) {
    return texts[0].text.trim();
  }

  return `Slide ${index + 1}`;
}
