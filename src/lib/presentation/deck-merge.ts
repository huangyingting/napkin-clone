/**
 * Pure, DOM-free merge of a freshly-derived deck back into a manually-edited
 * deck — the "Sync from document" model for issue #205.
 *
 * A naive full re-derive (`buildDeckFromBlocks`) would clobber every free-form
 * element the user positioned by hand. Instead this merges the refreshed
 * document content (title / bullets / visualIds / notes / layout) into matching
 * slides. For slides whose `elements[]` are still purely auto-derived
 * (`elementsDerived === true`, or no elements yet) the elements are
 * RE-MATERIALIZED from the refreshed content so the rendered slide actually
 * updates (issue #221). For hand-edited slides (`elementsDerived === false`)
 * each slide's `elements[]`, `background`, `accent` and theme are PRESERVED
 * verbatim. Slides in the fresh deck with no match are optionally appended;
 * slides in the existing deck with no fresh match (orphans) are always kept —
 * manual work is never silently discarded.
 *
 * Matching is two-pass and deterministic:
 *   1. by normalized title (trimmed, lower-cased) for non-empty titles, and
 *   2. by position (index) for *untitled* slides only — an untitled fresh slide
 *      pairs with the same-position existing slide when it too is untitled.
 *      Titled slides never index-match, so a renamed/new section becomes a clean
 *      append + preserved-orphan pair rather than clobbering a manual slide.
 *
 * Pure and headless — fully testable under `node --test`.
 */

import type { Deck, Slide } from "./deck";
import { materializeSlideElements } from "./deck";
import { normalizeTitle } from "./deck-hash";
import { slideEffectiveTitle } from "./slide-title";

/** How a single resulting slide was affected by a sync. */
export type MergeChangeKind = "updated" | "appended" | "preserved";

/** A compact content fingerprint of a slide for the before/after summary. */
export interface MergeSlideSnapshot {
  title: string;
  bulletCount: number;
  visualCount: number;
}

/** One row in the merge summary, describing a single resulting slide. */
export interface MergeSlideChange {
  /** Resulting slide index after the merge. */
  index: number;
  kind: MergeChangeKind;
  /** Content before the merge (absent for appended slides). */
  before?: MergeSlideSnapshot;
  /** Content after the merge. */
  after: MergeSlideSnapshot;
  /** Number of free-form elements preserved on this slide. */
  elementsPreserved: number;
  /** Whether this slide's content actually changed (updated slides only). */
  contentChanged: boolean;
}

/** Human-readable summary of a sync, shown before applying. */
export interface MergeSummary {
  changes: MergeSlideChange[];
  /** Matched slides whose content was refreshed. */
  updatedCount: number;
  /** Matched slides that were already up to date (no content change). */
  unchangedCount: number;
  /** New slides appended from the document. */
  appendedCount: number;
  /** Existing slides with no document match, preserved as-is. */
  preservedCount: number;
  /** Total free-form elements preserved across all matched slides. */
  preservedElementCount: number;
}

/** Result of {@link mergeDeckFromDocument}: the merged deck plus its summary. */
export interface MergeResult {
  deck: Deck;
  summary: MergeSummary;
}

export interface MergeOptions {
  /**
   * When `true` (default) fresh slides with no existing match are appended to
   * the end of the deck. When `false` they are dropped — matched slides are
   * still refreshed and orphans preserved.
   */
  appendNew?: boolean;
}

function snapshot(slide: Slide): MergeSlideSnapshot {
  return {
    title: slide.title,
    bulletCount: slide.bullets.length,
    visualCount: slide.visualIds.length,
  };
}

function elementCount(slide: Slide): number {
  return slide.elements?.length ?? 0;
}

function sameContent(existing: Slide, fresh: Slide): boolean {
  return (
    existing.title === fresh.title &&
    existing.layout === fresh.layout &&
    existing.notes === fresh.notes &&
    existing.bullets.length === fresh.bullets.length &&
    existing.bullets.every((bullet, i) => bullet === fresh.bullets[i]) &&
    existing.visualIds.length === fresh.visualIds.length &&
    existing.visualIds.every((id, i) => id === fresh.visualIds[i])
  );
}

/**
 * True when a slide's `elements[]` are still purely auto-derived from its
 * legacy `title`/`bullets`/`visualIds` (issue #221) and may therefore be
 * safely re-materialized from refreshed document content:
 *   - `elementsDerived === true` — explicitly stamped by materialization and
 *     never hand-edited since, OR
 *   - the slide has no `elements[]` yet — nothing hand-authored to protect.
 *
 * A slide with `elements[]` but no flag is treated as hand-edited (preserved),
 * so legacy/persisted decks are never clobbered.
 */
function elementsArePurelyDerived(slide: Slide): boolean {
  return slide.elementsDerived === true || (slide.elements?.length ?? 0) === 0;
}

/**
 * Produces a merged slide: refreshed document content from `fresh`. For slides
 * whose `elements[]` are still purely derived, the elements are RE-MATERIALIZED
 * from the freshly-derived content so the rendered slide actually updates
 * (issue #221). For hand-edited slides (`elementsDerived === false`), every
 * manual aspect of `existing` (free-form `elements[]`, `background`, `accent`,
 * theme) is preserved verbatim.
 */
function mergeSlide(existing: Slide, fresh: Slide): Slide {
  const refreshed: Slide = {
    ...existing,
    title: fresh.title,
    bullets: [...fresh.bullets],
    visualIds: [...fresh.visualIds],
    layout: fresh.layout,
    notes: fresh.notes,
  };

  if (!elementsArePurelyDerived(existing)) {
    return refreshed;
  }

  // Derive a clean element list from the refreshed legacy fields. Clearing
  // `elements` first forces materialization to rebuild from the fresh content.
  const elements = materializeSlideElements({
    ...refreshed,
    elements: undefined,
  });
  return { ...refreshed, elements, elementsDerived: true };
}

/**
 * Merges a freshly-derived deck (`fresh`, from `buildDeckFromBlocks` on the live
 * document) into the manually-edited `existing` deck. See the module docstring
 * for the matching and preservation rules.
 */
export function mergeDeckFromDocument(
  existing: Deck,
  fresh: Deck,
  options: MergeOptions = {},
): MergeResult {
  const appendNew = options.appendNew ?? true;

  // freshIndex -> existingIndex once paired; existing slides get consumed once.
  const pairedExistingToFresh = new Map<number, number>();
  const consumedExisting = new Set<number>();
  const matchedFresh = new Set<number>();

  // Pass 1 — match by normalized non-empty title (first unconsumed wins).
  const existingByTitle = new Map<string, number[]>();
  existing.slides.forEach((slide, i) => {
    const key = normalizeTitle(slideEffectiveTitle(slide));
    if (key === "") return;
    const bucket = existingByTitle.get(key);
    if (bucket) bucket.push(i);
    else existingByTitle.set(key, [i]);
  });

  fresh.slides.forEach((slide, freshIndex) => {
    const key = normalizeTitle(slideEffectiveTitle(slide));
    if (key === "") return;
    const bucket = existingByTitle.get(key);
    if (!bucket) return;
    const existingIndex = bucket.find((i) => !consumedExisting.has(i));
    if (existingIndex === undefined) return;
    consumedExisting.add(existingIndex);
    matchedFresh.add(freshIndex);
    pairedExistingToFresh.set(existingIndex, freshIndex);
  });

  // Pass 2 — match remaining *untitled* fresh slides to the same-position
  // existing slide, but only when that existing slide is also untitled and
  // unconsumed. Restricting index matching to empty-title slides keeps a
  // renamed/new titled section from silently overwriting a manual slide at the
  // same position: those stay a clean append + preserved-orphan pair instead.
  fresh.slides.forEach((slide, freshIndex) => {
    if (matchedFresh.has(freshIndex)) return;
    if (normalizeTitle(slideEffectiveTitle(slide)) !== "") return;
    const existingIndex = freshIndex;
    if (existingIndex >= existing.slides.length) return;
    if (consumedExisting.has(existingIndex)) return;
    if (
      normalizeTitle(slideEffectiveTitle(existing.slides[existingIndex])) !== ""
    )
      return;
    consumedExisting.add(existingIndex);
    matchedFresh.add(freshIndex);
    pairedExistingToFresh.set(existingIndex, freshIndex);
  });

  const changes: MergeSlideChange[] = [];
  let updatedCount = 0;
  let unchangedCount = 0;
  let preservedCount = 0;
  let preservedElementCount = 0;

  // Build the result preserving existing slide order; refresh matched slides
  // in place and keep orphans untouched.
  const mergedSlides: Slide[] = existing.slides.map((existingSlide, i) => {
    const freshIndex = pairedExistingToFresh.get(i);
    if (freshIndex === undefined) {
      // Orphan — no document match. Preserve verbatim.
      preservedCount += 1;
      preservedElementCount += elementCount(existingSlide);
      changes.push({
        index: i,
        kind: "preserved",
        before: snapshot(existingSlide),
        after: snapshot(existingSlide),
        elementsPreserved: elementCount(existingSlide),
        contentChanged: false,
      });
      return existingSlide;
    }

    const freshSlide = fresh.slides[freshIndex];
    const changed = !sameContent(existingSlide, freshSlide);
    const merged = changed
      ? mergeSlide(existingSlide, freshSlide)
      : existingSlide;
    if (changed) updatedCount += 1;
    else unchangedCount += 1;
    // Derived slides are re-materialized (their elements regenerated), so no
    // hand-authored elements are "preserved" for them; only hand-edited slides
    // carry their elements through verbatim.
    const preserved = elementsArePurelyDerived(existingSlide)
      ? 0
      : elementCount(existingSlide);
    preservedElementCount += preserved;
    changes.push({
      index: i,
      kind: "updated",
      before: snapshot(existingSlide),
      after: snapshot(merged),
      elementsPreserved: preserved,
      contentChanged: changed,
    });
    return merged;
  });

  // Append unmatched fresh slides (when enabled), stamped with the deck theme.
  let appendedCount = 0;
  if (appendNew) {
    fresh.slides.forEach((freshSlide, freshIndex) => {
      if (matchedFresh.has(freshIndex)) return;
      const appended: Slide = {
        ...freshSlide,
        theme: existing.theme,
      };
      appendedCount += 1;
      changes.push({
        index: mergedSlides.length,
        kind: "appended",
        after: snapshot(appended),
        elementsPreserved: 0,
        contentChanged: true,
      });
      mergedSlides.push(appended);
    });
  }

  // Re-stamp indices to match final positions.
  const reindexed = mergedSlides.map((slide, index) =>
    slide.index === index ? slide : { ...slide, index },
  );

  return {
    deck: { ...existing, slides: reindexed },
    summary: {
      changes,
      updatedCount,
      unchangedCount,
      appendedCount,
      preservedCount,
      preservedElementCount,
    },
  };
}
