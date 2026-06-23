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
 *
 * ## DB ↔ TS mapping
 * The Prisma Comment model stores anchor data in three columns:
 *  - `slideId`        — maps 1-to-1 to {@link SlideCommentAnchor.slideId}
 *  - `elementId`      — maps 1-to-1 to {@link SlideCommentAnchor.elementId}
 *  - `anchorGeometry` — maps to {@link SlideCommentAnchor.geometry} (rename!)
 *
 * Always use {@link commentAnchorFromRecord} / {@link commentAnchorToRecord}
 * at the DB boundary to avoid silently dropping coordinates from the rename.
 *
 * ## Geometry versioning (TODO — Epic #380 follow-up)
 * `anchorGeometry` currently stores a simple `{x, y}` point. Future slices
 * may extend it with additional fields (e.g. bounding-box, version tag).
 * When that happens, bump the geometry schema and migrate stored JSON blobs.
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
 * Geometry is also cleared: a deck-level comment has no meaningful pin point.
 *
 * This is a pure transform: the original anchor is not mutated.
 */
export function floatAnchorToDeck(
  anchor: SlideCommentAnchor,
): SlideCommentAnchor {
  return { ...anchor, slideId: null, elementId: null, geometry: null };
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
 * ⚠️ **Footgun**: only use this when you know the new slide shares the same
 * element IDs as the source slide (e.g. an exact duplicate). If `elementId`
 * may not exist in `newSlideId`, use {@link retargetAnchorToSlideOnly}
 * instead to avoid producing an orphaned anchor.
 *
 * This is a pure transform: the original anchor is not mutated.
 */
export function retargetAnchorSlide(
  anchor: SlideCommentAnchor,
  newSlideId: string,
): SlideCommentAnchor {
  return { ...anchor, slideId: newSlideId };
}

/**
 * Re-targets an anchor to `newSlideId`, clearing `elementId` so the comment
 * becomes a slide-level pin. Use this when the new slide's element IDs are
 * not guaranteed to match those of the original (e.g. a layout retarget).
 *
 * Geometry is preserved as it is expressed in slide-percent coordinates and
 * remains valid across slides.
 *
 * This is a pure transform: the original anchor is not mutated.
 */
export function retargetAnchorToSlideOnly(
  anchor: SlideCommentAnchor,
  newSlideId: string,
): SlideCommentAnchor {
  return { ...anchor, slideId: newSlideId, elementId: null };
}

// ---------------------------------------------------------------------------
// DB ↔ TS mappers
// ---------------------------------------------------------------------------

/**
 * Partial Prisma Comment record shape containing the anchor columns.
 * The `anchorGeometry` column is named differently from the TS field
 * (`geometry`) — always use these mappers at the DB boundary.
 */
export interface CommentAnchorRecord {
  slideId?: string | null;
  elementId?: string | null;
  /** Prisma Json? — an already-parsed object (Postgres and SQLite via Prisma). */
  anchorGeometry?: unknown;
}

/**
 * Maps a Prisma Comment record to a {@link SlideCommentAnchor}.
 *
 * Handles the `anchorGeometry` → `geometry` rename and validates that the
 * stored value has the expected `{x, y}` shape, silently dropping malformed
 * blobs rather than letting bad data propagate into UI coordinates.
 */
export function commentAnchorFromRecord(
  record: CommentAnchorRecord,
): SlideCommentAnchor {
  let geometry: AnchorPoint | null = null;
  if (record.anchorGeometry != null) {
    const g = record.anchorGeometry as { x?: unknown; y?: unknown };
    if (typeof g.x === "number" && typeof g.y === "number") {
      geometry = { x: g.x, y: g.y };
    }
  }
  return {
    slideId: record.slideId ?? null,
    elementId: record.elementId ?? null,
    geometry,
  };
}

/**
 * Maps a {@link SlideCommentAnchor} to the Prisma write shape for a Comment.
 *
 * Handles the `geometry` → `anchorGeometry` rename so callers never need to
 * remember the column name difference.
 */
export function commentAnchorToRecord(anchor: SlideCommentAnchor): {
  slideId: string | null;
  elementId: string | null;
  anchorGeometry: AnchorPoint | null;
} {
  return {
    slideId: anchor.slideId ?? null,
    elementId: anchor.elementId ?? null,
    anchorGeometry: anchor.geometry ?? null,
  };
}
