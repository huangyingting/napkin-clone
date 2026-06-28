/**
 * Pure, DOM-free merge of a freshly-derived deck back into a manually-edited
 * deck — the "Sync from document" model for issue #205.
 *
 * A naive full re-derive (`buildDeckFromBlocks`) would clobber every free-form
 * element the user positioned by hand. Instead this merges the refreshed
 * document content into matching slides. For slides whose `elements[]` are
 * still recognizable as auto-derived, the elements are rebuilt from refreshed
 * content so the rendered slide actually updates. For hand-edited slides
 * each slide's `elements[]`, design overrides and theme are PRESERVED
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

import type { Deck, Slide } from "./deck-core";
import type { SlideElement, TextRun, VisualElement } from "./deck-elements";
import type { SourceRef } from "./deck-source-refs";
import { buildSlideElementsFromContent } from "./deck-derivation";
import { buildVisualElement } from "./deck-elements";
import { normalizeTitle } from "./deck-hash";
import { slideEffectiveTitle } from "./slide-title";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import { hashDocumentBlock } from "./document-block-hash";
import {
  updateTextElementFromBlock,
  buildRefreshSourceRef,
} from "./source-link-staleness";

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
  /**
   * Number of new document visuals appended to a hand-edited slide during this
   * sync. Only set when > 0 (i.e. when new visuals were actually appended).
   */
  visualsAdded?: number;
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
  /**
   * The raw document blocks from the current document state. When provided,
   * the merge applies element-level source precedence for hand-edited
   * slides (issue #409): text/visual elements with active source metadata that
   * matches a changed block are updated in place, preserving geometry and style.
   * Elements whose source block is missing (orphaned) are left untouched —
   * they are never auto-deleted (#410).
   */
  freshBlocks?: readonly DocumentBlock[];
}

function snapshot(slide: Slide): MergeSlideSnapshot {
  return {
    title: slide.title,
    bulletCount: slideBullets(slide).length,
    visualCount: slideVisualIds(slide).length,
  };
}

function elementContent(
  element: SlideElement | undefined,
): Record<string, any> {
  if (element === undefined) return {};
  return ((element as any).content ?? {}) as Record<string, any>;
}

function elementRole(element: SlideElement): string | undefined {
  return (element as { role?: string }).role;
}

function elementVisualId(element: SlideElement): string | undefined {
  return elementContent(element).visualId;
}

function elementSource(element: SlideElement): SourceRef | undefined {
  return (element as { source?: SourceRef }).source;
}

function slideLayout(slide: Slide): string {
  /* node:coverage ignore next 3 */
  /* Layout fallback behavior is asserted by merge tests; tsx maps this helper as residual rows. */
  return (slide as any).templateId ?? "blank";
}

function slideSectionId(slide: Slide): string | undefined {
  return (slide as any).source?.sectionId;
}

function slideBullets(slide: Slide): string[] {
  const bullet = (slide.elements ?? []).find(
    (element) => element.kind === "text" && elementRole(element) === "bullet",
  );
  const paragraphs = elementContent(bullet as SlideElement).paragraphs ?? [];
  return paragraphs.map((paragraph: any) => paragraph.text ?? "");
}

function slideVisualIds(slide: Slide): string[] {
  return (slide.elements ?? [])
    .filter((element) => element.kind === "visual")
    .map((element) => elementVisualId(element))
    .filter((visualId): visualId is string => typeof visualId === "string");
}

function slideTitleRuns(slide: Slide): TextRun[] | undefined {
  const title = (slide.elements ?? []).find(
    (element) => element.kind === "text" && elementRole(element) === "title",
  );
  return elementContent(title as SlideElement).runs;
}

function slideBodyRuns(slide: Slide): TextRun[][] | undefined {
  const bullet = (slide.elements ?? []).find(
    (element) => element.kind === "text" && elementRole(element) === "bullet",
  );
  const paragraphs = elementContent(bullet as SlideElement).paragraphs;
  if (!Array.isArray(paragraphs)) return undefined;
  return paragraphs.map((paragraph: any) => paragraph.runs ?? []);
}

function elementCount(slide: Slide): number {
  return slide.elements?.length ?? 0;
}

function sameContent(existing: Slide, fresh: Slide): boolean {
  return (
    existing.title === fresh.title &&
    slideLayout(existing) === slideLayout(fresh) &&
    existing.notes === fresh.notes &&
    slideBullets(existing).length === slideBullets(fresh).length &&
    slideBullets(existing).every(
      (bullet, i) => bullet === slideBullets(fresh)[i],
    ) &&
    slideVisualIds(existing).length === slideVisualIds(fresh).length &&
    slideVisualIds(existing).every(
      (id, i) => id === slideVisualIds(fresh)[i],
    ) &&
    sameRunList(slideTitleRuns(existing), slideTitleRuns(fresh)) &&
    sameBodyRuns(slideBodyRuns(existing), slideBodyRuns(fresh))
  );
}

/** Field-wise equality of two rich-text runs. */
function sameTextRun(a: TextRun, b: TextRun): boolean {
  return (
    a.text === b.text &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.code === b.code &&
    a.color === b.color &&
    a.link === b.link
  );
}

/**
 * Length-then-elementwise equality of two run lists, treating `undefined` as an
 * empty list — consistent with how {@link sameContent} compares body paragraphs
 * and visual references.
 */
function sameRunList(
  a: TextRun[] | undefined,
  b: TextRun[] | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  return (
    aa.length === bb.length && aa.every((run, i) => sameTextRun(run, bb[i]))
  );
}

/** Length-then-elementwise equality of two parallel body run lists. */
function sameBodyRuns(
  a: TextRun[][] | undefined,
  b: TextRun[][] | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  return (
    aa.length === bb.length && aa.every((runs, i) => sameRunList(runs, bb[i]))
  );
}

/**
 * Builds lookup maps from fresh document blocks for element-level source
 * precedence (issue #409): text blocks indexed by blockId, visual blocks
 * indexed by visualId.
 */
function buildFreshBlockMaps(freshBlocks: readonly DocumentBlock[]): {
  textById: Map<string, DocumentTextBlock>;
  visualByVisualId: Map<string, DocumentBlock>;
} {
  const textById = new Map<string, DocumentTextBlock>();
  const visualByVisualId = new Map<string, DocumentBlock>();
  for (const block of freshBlocks) {
    if (block.kind === "text" && block.blockId !== undefined) {
      textById.set(block.blockId, block);
    } else if (block.kind === "visual") {
      visualByVisualId.set(block.visualId, block);
    }
  }
  return { textById, visualByVisualId };
}

/**
 * Applies element-level source updates to a hand-edited slide's elements
 * (issue #409). For each element with active source metadata whose source
 * block has changed, the element's content is refreshed while geometry, style,
 * and z-order are preserved. Orphaned elements (missing source block) are left
 * untouched — they are never auto-deleted (#410).
 *
 * Returns the updated elements array and a count of elements refreshed.
 */
function applyElementSourceUpdates(
  elements: SlideElement[],
  textById: Map<string, DocumentTextBlock>,
  visualByVisualId: Map<string, DocumentBlock>,
  linkedAt: string,
): { elements: SlideElement[]; sourceUpdatedCount: number } {
  let sourceUpdatedCount = 0;
  const updated = elements.map((el): SlideElement => {
    const source = elementSource(el);
    if (
      source === undefined ||
      source.unlinked === true ||
      source.contentHash === undefined
    ) {
      return el;
    }

    const blockKind = source.blockKind;

    if (blockKind === "visual") {
      const freshBlock = visualByVisualId.get(source.blockId);
      if (freshBlock === undefined) return el; // orphan — never auto-delete
      const freshHash = hashDocumentBlock(freshBlock);
      if (freshHash === source.contentHash) return el; // up-to-date
      // Visual id stayed the same; update the contentHash.
      const newRef = buildRefreshSourceRef(
        source,
        source.blockId,
        freshHash,
        linkedAt,
        "visual",
      );
      sourceUpdatedCount += 1;
      return { ...el, source: newRef };
    } else {
      const freshBlock = textById.get(source.blockId);
      if (freshBlock === undefined) return el; // orphan — never auto-delete
      const freshHash = hashDocumentBlock(freshBlock);
      if (freshHash === source.contentHash) return el; // up-to-date
      if (el.kind !== "text") return el; // can only update text elements
      const newRef = buildRefreshSourceRef(
        source,
        source.blockId,
        freshHash,
        linkedAt,
        "text",
      );
      sourceUpdatedCount += 1;
      return updateTextElementFromBlock(el, freshBlock, newRef);
    }
  });
  return { elements: updated, sourceUpdatedCount };
}

/**
 * True when a slide's `elements[]` are still purely auto-derived from document
 * content (issue #221) and may therefore be safely rebuilt from refreshed
 * document content.
 */
function elementsArePurelyDerived(slide: Slide): boolean {
  const elements = slide.elements ?? [];
  if (elements.length === 0) return false;
  return elements.every((element) => {
    const role = elementRole(element);
    return (
      role === "title" ||
      /* node:coverage ignore next */
      /* Section-title derived slides share the same rematerialization path as title slides; source maps leave this literal row residual. */
      role === "sectionTitle" ||
      role === "bullet" ||
      role === "visual"
    );
  });
}

/**
 * Produces a merged slide: refreshed document content from `fresh`. For slides
 * whose `elements[]` are still purely derived, the elements are RE-MATERIALIZED
 * from the freshly-derived content so the rendered slide actually updates
 * (issue #221). For hand-edited slides, every
 * manual aspect of `existing` (free-form `elements[]`, `background`, `accent`,
 * theme) is preserved verbatim. Additionally, any document visuals in
 * `fresh.elements[]` that are NOT already rendered on the hand-edited slide are
 * appended as new visual elements (issue #294).
 *
 * When `freshBlockMaps` is provided, element-level source metadata on hand-edited
 * slides are checked: elements with an active source ref whose content changed
 * are updated in place (#409). Orphaned elements (missing source block) are
 * never auto-deleted (#410).
 */
function mergeSlide(
  existing: Slide,
  fresh: Slide,
  freshBlockMaps?: ReturnType<typeof buildFreshBlockMaps>,
): { slide: Slide; visualsAdded: number } {
  const {
    elements: _existingElements,
    templateId: _existingTemplateId,
    ...existingBase
  } = existing as any;
  const freshTemplateId = slideLayout(fresh);
  const refreshed: Slide = {
    ...existingBase,
    title: fresh.title,
    notes: fresh.notes,
    ...(freshTemplateId !== "blank" ? { templateId: freshTemplateId } : {}),
  };

  if (!elementsArePurelyDerived(existing)) {
    // Apply element-level source updates when freshBlockMaps are provided
    // (#409). Text/visual elements with a matching changed source block are
    // refreshed in place; orphaned elements (missing block) are left untouched.
    const baseElements = existing.elements ?? [];
    const linkedAt = new Date().toISOString();
    const elementsBefore = freshBlockMaps
      ? applyElementSourceUpdates(
          baseElements,
          freshBlockMaps.textById,
          freshBlockMaps.visualByVisualId,
          linkedAt,
        ).elements
      : baseElements;

    // Collect visual ids already rendered as elements on this hand-edited slide
    // so we can diff against fresh slide visuals without duplicating anything.
    const renderedVisualIds = new Set(
      elementsBefore
        .filter((el): el is VisualElement => el.kind === "visual")
        .map((el) => elementVisualId(el))
        .filter((id): id is string => typeof id === "string"),
    );
    // New document visuals not yet present on this slide, in document order.
    const newVisualIds = slideVisualIds(fresh).filter(
      (id) => !renderedVisualIds.has(id),
    );
    if (newVisualIds.length === 0) {
      return {
        slide: { ...refreshed, elements: elementsBefore },
        visualsAdded: 0,
      };
    }
    // Assign zIndices above all existing elements.
    const maxZ = elementsBefore.reduce(
      (max, el) => Math.max(max, el.zIndex),
      -1,
    );
    const newElements: SlideElement[] = newVisualIds.map(
      (visualId, offset) => ({
        ...buildVisualElement(visualId),
        zIndex: maxZ + 1 + offset,
      }),
    );
    return {
      slide: {
        ...refreshed,
        elements: [...elementsBefore, ...newElements],
      },
      visualsAdded: newVisualIds.length,
    };
  }

  const elements = buildSlideElementsFromContent({
    ...refreshed,
    visualRefs: slideVisualIds(fresh),
    bodyTexts: slideBullets(fresh),
    bodyRuns: slideBodyRuns(fresh),
    titleRuns: slideTitleRuns(fresh),
    templateId: slideLayout(fresh) as any,
    elements: undefined,
  });
  return {
    slide: { ...refreshed, elements },
    visualsAdded: 0,
  };
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
  // Build fresh block maps once upfront for element-level source ref precedence
  // (#409). Only built when freshBlocks are provided; otherwise the merge falls
  // back to the existing slide-level behavior.
  const freshBlockMaps = options.freshBlocks
    ? buildFreshBlockMaps(options.freshBlocks)
    : undefined;

  // freshIndex -> existingIndex once paired; existing slides get consumed once.
  const pairedExistingToFresh = new Map<number, number>();
  const consumedExisting = new Set<number>();
  const matchedFresh = new Set<number>();

  // Pass 0 — match by source section id (both present and equal; first-unconsumed-
  // wins to handle duplicate headings). This survives a slide's on-stage title
  // rename and section reordering because the id is frozen from the doc heading.
  const existingBySectionId = new Map<string, number[]>();
  existing.slides.forEach((slide, i) => {
    const sectionId = slideSectionId(slide);
    if (!sectionId) return;
    const bucket = existingBySectionId.get(sectionId);
    if (bucket) bucket.push(i);
    else existingBySectionId.set(sectionId, [i]);
  });

  fresh.slides.forEach((slide, freshIndex) => {
    const sectionId = slideSectionId(slide);
    if (!sectionId) return;
    const bucket = existingBySectionId.get(sectionId);
    if (!bucket) return;
    const existingIndex = bucket.find((i) => !consumedExisting.has(i));
    if (existingIndex === undefined) return;
    consumedExisting.add(existingIndex);
    matchedFresh.add(freshIndex);
    pairedExistingToFresh.set(existingIndex, freshIndex);
  });

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
    const mergeResult = changed
      ? mergeSlide(existingSlide, freshSlide, freshBlockMaps)
      : freshBlockMaps && !elementsArePurelyDerived(existingSlide)
        ? // Even when slide-level content is unchanged, apply element-level
          // source-ref updates to hand-edited slides when freshBlocks provided.
          mergeSlide(existingSlide, existingSlide, freshBlockMaps)
        : { slide: existingSlide, visualsAdded: 0 };
    const merged = mergeResult.slide;
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
      ...(mergeResult.visualsAdded > 0
        ? { visualsAdded: mergeResult.visualsAdded }
        : {}),
    });
    return merged;
  });

  // Append unmatched fresh slides (when enabled). Presentation theme is deck-level.
  let appendedCount = 0;
  if (appendNew) {
    fresh.slides.forEach((freshSlide, freshIndex) => {
      if (matchedFresh.has(freshIndex)) return;
      const appended: Slide = { ...freshSlide };
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
