/**
 * Pure helpers for slide comment anchor semantics (Epic #380).
 *
 * A comment may carry an optional slide-level anchor that pins it to a
 * specific location inside a {@link Deck}. This module resolves and
 * manipulates those anchors without any I/O or React dependencies — fully
 * testable under `node --test`.
 *
 * Anchor resolution states:
 *  - `"deck"`     — no slideId; the comment floats at deck level.
 *  - `"attached"` — the referenced slide (and element, if any) still exists.
 *  - `"orphaned"` — the referenced slide or element no longer exists in the
 *                   deck (was deleted or its id changed).
 *  - `"unknown"`  — anchor data is present but the deck is unavailable, so
 *                   live resolution is impossible.
 */

import type { Deck } from "./deck";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Anchor geometry: a point expressed in percent units (0–100) relative to
 * the slide canvas, used to pin a comment indicator on-screen.
 */
export interface AnchorPoint {
  /** Horizontal position as a percent of slide width (0 = left, 100 = right). */
  x: number;
  /** Vertical position as a percent of slide height (0 = top, 100 = bottom). */
  y: number;
}

/**
 * The slide-level portion of a comment anchor. Mirrors the nullable DB
 * columns added in migration 20260622140000_add_comment_slide_anchors.
 *
 * All fields are optional — an absent/null anchor means the comment is
 * attached to the whole document (deck level).
 */
export interface SlideCommentAnchor {
  /** Slide.id from deckJson. Null → deck-level comment. */
  slideId?: string | null;
  /**
   * SlideElement.id within the slide. When present the comment is pinned to
   * a specific element; absent means the comment is pinned to the slide.
   */
  elementId?: string | null;
  /**
   * Optional visual pin point. Coordinates are in percent units (0–100)
   * relative to the slide canvas. Stored in anchorGeometry DB column.
   */
  geometry?: AnchorPoint | null;
}

/**
 * The resolved state of a {@link SlideCommentAnchor} against a live deck.
 *
 * | Value       | Meaning                                                      |
 * |-------------|--------------------------------------------------------------|
 * | `"deck"`    | No slide anchor — comment belongs to the whole deck.         |
 * | `"attached"`| Slide (and element if specified) exists in the deck.         |
 * | `"orphaned"`| Slide or element no longer exists (deleted / id changed).    |
 * | `"unknown"` | Anchor specifies a slideId but no deck was provided.         |
 */
export type AnchorState = "deck" | "attached" | "orphaned" | "unknown";

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the live state of `anchor` against `deck`.
 *
 * Pass `null` or `undefined` for `deck` when no deck is loaded — the result
 * will be `"unknown"` for any anchor that specifies a slideId.
 */
export function resolveAnchorState(
  anchor: SlideCommentAnchor,
  deck: Deck | null | undefined,
): AnchorState {
  if (!anchor.slideId) {
    return "deck";
  }

  if (!deck) {
    return "unknown";
  }

  const slide = deck.slides.find((s) => s.id === anchor.slideId);
  if (!slide) {
    return "orphaned";
  }

  if (anchor.elementId) {
    const elements = slide.elements ?? [];
    const elementExists = elements.some((el) => el.id === anchor.elementId);
    if (!elementExists) {
      return "orphaned";
    }
  }

  return "attached";
}

// ---------------------------------------------------------------------------
// Anchor mutations (stubs — extended in later slices)
// ---------------------------------------------------------------------------

/**
 * Returns a new anchor with `slideId` cleared to null, effectively demoting
 * it to a deck-level comment. Used when a slide is deleted and the caller
 * chooses to float the comment rather than discard it.
 *
 * This is a pure transform: the original anchor is not mutated.
 */
export function floatAnchorToDeck(
  anchor: SlideCommentAnchor,
): SlideCommentAnchor {
  return { ...anchor, slideId: null, elementId: null };
}

/**
 * Returns a new anchor with `elementId` cleared to null, keeping the slide
 * attachment but removing the element pin. Used when an element is deleted.
 *
 * This is a pure transform: the original anchor is not mutated.
 */
export function floatAnchorToSlide(
  anchor: SlideCommentAnchor,
): SlideCommentAnchor {
  return { ...anchor, elementId: null };
}

/**
 * Re-targets a slide anchor to `newSlideId` (e.g. after a slide duplicate).
 * The elementId and geometry are preserved so the comment pin position is
 * maintained on the new slide.
 *
 * This is a pure transform: the original anchor is not mutated.
 */
export function retargetAnchorSlide(
  anchor: SlideCommentAnchor,
  newSlideId: string,
): SlideCommentAnchor {
  return { ...anchor, slideId: newSlideId };
}
