/**
 * Pure, DOM-free helper for labelling a slide in the thumbnail rail and other
 * chrome. Derivation order:
 *
 *  1. the `role: "title"` text element's text;
 *  2. otherwise the first non-empty `text` element;
 *  3. otherwise a title placeholder label;
 *  4. otherwise the positional fallback `"Slide N"` (1-based).
 *
 * No React, no DOM — fully testable under `node --test`.
 */

import {
  PLACEHOLDER_TYPE_LABELS,
  type PlaceholderElement,
  type Slide,
  type TextElement,
} from "./deck";

/**
 * The slide's effective title (without any positional fallback). The title is
 * read from the `role: "title"` text element so on-stage edits stay the single
 * source of truth. Returns `""` when no title element yields a non-empty title.
 *
 * Shared by {@link deriveSlideTitle} (rail label) and `deck-merge` (sync
 * matching key) so the displayed title and the matching key never drift apart —
 * a renamed title element matches its slide instead of orphaning it.
 */
export function slideEffectiveTitle(slide: Slide): string {
  const elements = slide.elements ?? [];
  const titleElement = elements.find(
    (element): element is TextElement =>
      element.kind === "text" &&
      element.role === "title" &&
      element.text.trim().length > 0,
  );
  if (titleElement) {
    return titleElement.text.trim();
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

  const titlePlaceholder = (slide.elements ?? []).find(
    (element): element is PlaceholderElement =>
      element.kind === "placeholder" && element.placeholderType === "title",
  );
  if (titlePlaceholder) {
    return titlePlaceholder.label?.trim() || PLACEHOLDER_TYPE_LABELS.title;
  }

  return `Slide ${index + 1}`;
}
