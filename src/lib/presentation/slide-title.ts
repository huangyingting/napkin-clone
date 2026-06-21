/**
 * Pure, DOM-free helper for labelling a slide in the thumbnail rail and other
 * chrome. Derivation order:
 *
 *  1. the slide's explicit `title` (trimmed), when non-empty;
 *  2. otherwise the first non-empty `text` element — preferring a title-role
 *     element, then any text element — so free-form slides (which keep their
 *     content in `elements[]`, not the legacy `title`) still get a real label;
 *  3. otherwise the positional fallback `"Slide N"` (1-based).
 *
 * No React, no DOM — fully testable under `node --test`.
 */

import type { Slide, TextElement } from "./deck";

/** Derives a human-readable title for `slide` at zero-based `index`. */
export function deriveSlideTitle(slide: Slide, index: number): string {
  const explicit = slide.title?.trim();
  if (explicit) {
    return explicit;
  }

  const texts = (slide.elements ?? []).filter(
    (element): element is TextElement =>
      element.kind === "text" && element.text.trim().length > 0,
  );
  const chosen = texts.find((element) => element.role === "title") ?? texts[0];
  if (chosen) {
    return chosen.text.trim();
  }

  return `Slide ${index + 1}`;
}
