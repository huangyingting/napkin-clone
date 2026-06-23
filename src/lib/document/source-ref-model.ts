/**
 * Document-to-deck source reference model (#475).
 *
 * Centralizes the dependency model for how slides reference document visuals
 * and source blocks. Previously this logic was scattered across:
 *  - `stripOrphanedVisuals` — removes missing visual references from the deck.
 *  - `source-link-staleness.ts` — detects stale source-linked elements.
 *  - `anchor-resolver.ts` — resolves individual block/visual/slide refs.
 *  - `restoreDocumentVersion` — sanitizes restored decks + reconciles.
 *
 * This module provides:
 *  1. A typed `DocumentDeckDependency` that explicitly describes every reference
 *     from a deck slide to a document block or visual.
 *  2. `enumerateDeckDependencies(deck)` — returns ALL deck→document references.
 *  3. `checkDependencyHealth(deck, freshBlocks)` — classifies each dependency
 *     as "found", "stale", "missing", or "invalid" using the shared anchor
 *     resolver vocabulary.
 *  4. `reconcileDeckVisuals(deck, knownVisualIds)` — delegates to
 *     `stripOrphanedVisuals`, providing one canonical reconcile call-site.
 *  5. `collectDeckVisualIds(deck)` — enumerates all visual ids the deck references.
 *
 * All helpers are pure (no DB, no React) so they can run in server actions,
 * tests, and the browser without adaptation.
 */

import type { Deck, SlideElement, SourceRef } from "@/lib/presentation/deck";
import type { DocumentBlock } from "@/lib/visual/document-export";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import { resolveVisualRef, resolveSourceRef } from "@/lib/anchor-resolver";
import type { AnchorResolution } from "@/lib/anchor-resolver";

export type { AnchorResolution };

// ---------------------------------------------------------------------------
// Dependency types
// ---------------------------------------------------------------------------

/**
 * A single reference from a deck slide element to a document block or visual.
 */
export type DocumentDeckDependency =
  | {
      /** Reference via a `VisualElement.visualId` (free-form slide). */
      kind: "visual";
      slideId: string;
      elementId: string;
      visualId: string;
    }
  | {
      /** Reference via a legacy `Slide.visualIds` array (legacy slides). */
      kind: "legacy_visual";
      slideId: string;
      /** Index in the `visualIds` array. */
      index: number;
      visualId: string;
    }
  | {
      /**
       * Reference via a `SourceRef` on any slide element (text or visual
       * block linked from the document).
       */
      kind: "source_ref";
      slideId: string;
      elementId: string;
      blockId: string;
      blockKind: "text" | "visual";
      sourceRef: SourceRef;
    };

// ---------------------------------------------------------------------------
// Dependency enumeration
// ---------------------------------------------------------------------------

/**
 * Returns every deck→document dependency: visual element references, legacy
 * `visualIds` array entries, and source-linked elements. The result is the
 * complete graph of what the deck depends on from the document.
 *
 * Callers can use this as the canonical input to `checkDependencyHealth`
 * and `reconcileDeckVisuals` so all consistency-maintenance paths start from
 * the same enumeration.
 */
export function enumerateDeckDependencies(
  deck: Deck,
): DocumentDeckDependency[] {
  const deps: DocumentDeckDependency[] = [];

  for (const slide of deck.slides) {
    // Legacy visualIds array.
    if (slide.visualIds && slide.visualIds.length > 0) {
      for (let i = 0; i < slide.visualIds.length; i++) {
        deps.push({
          kind: "legacy_visual",
          slideId: slide.id,
          index: i,
          visualId: slide.visualIds[i],
        });
      }
    }

    // Free-form elements.
    if (slide.elements) {
      for (const element of slide.elements) {
        // Visual element → visualId dependency.
        if (element.kind === "visual") {
          deps.push({
            kind: "visual",
            slideId: slide.id,
            elementId: element.id,
            visualId: element.visualId,
          });
        }

        // Source-ref dependency (present on any element kind).
        const ref = (element as SlideElement & { sourceRef?: SourceRef })
          .sourceRef;
        if (
          ref !== undefined &&
          ref.unlinked !== true &&
          ref.blockId !== undefined
        ) {
          const blockKind: "text" | "visual" = ref.blockKind ?? "text";
          deps.push({
            kind: "source_ref",
            slideId: slide.id,
            elementId: element.id,
            blockId: ref.blockId,
            blockKind,
            sourceRef: ref,
          });
        }
      }
    }
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Dependency health check
// ---------------------------------------------------------------------------

/** Health status of a single dependency. */
export type DependencyHealth = {
  dependency: DocumentDeckDependency;
  /** Resolution result from the anchor resolver. */
  resolution: AnchorResolution<DocumentBlock>;
};

/**
 * Classifies every deck→document dependency against the current document
 * state. Returns one `DependencyHealth` entry per dependency.
 *
 * Callers can filter by `resolution.status`:
 *  - `"found"` — dependency is satisfied.
 *  - `"stale"` — found but content hash doesn't match.
 *  - `"missing"` — block or visual no longer exists in the document.
 *  - `"invalid"` — dependency descriptor itself is malformed.
 *
 * @param deck         The deck to inspect.
 * @param freshBlocks  Output of `collectDocumentBlocks` from the current
 *                     document state (or `collectVisualNodes` mapped to
 *                     `DocumentBlock` form).
 */
export function checkDependencyHealth(
  deck: Deck,
  freshBlocks: readonly DocumentBlock[],
): DependencyHealth[] {
  const deps = enumerateDeckDependencies(deck);
  return deps.map((dep) => {
    let resolution: AnchorResolution<DocumentBlock>;

    switch (dep.kind) {
      case "visual":
      case "legacy_visual":
        resolution = resolveVisualRef(dep.visualId, freshBlocks);
        break;
      case "source_ref":
        resolution = resolveSourceRef(dep.sourceRef, freshBlocks);
        break;
    }

    return { dependency: dep, resolution };
  });
}

// ---------------------------------------------------------------------------
// Reconciliation helpers
// ---------------------------------------------------------------------------

/**
 * Returns a copy of `deck` with all orphaned visual references removed.
 *
 * This is the canonical reconcile entry point for all paths that need to
 * ensure the deck does not reference visuals that no longer exist:
 *  - Version restore sanitization.
 *  - Post-mirror deck reconciliation.
 *  - Duplicate/derive operations.
 *
 * Delegates to `stripOrphanedVisuals` so the stripping logic stays in one
 * place; callers that were calling `stripOrphanedVisuals` directly may continue
 * doing so — this function provides a stable name in the dependency model.
 *
 * @param deck            The deck to sanitize.
 * @param knownVisualIds  Set of visual ids that currently exist in the document.
 */
export function reconcileDeckVisuals(
  deck: Deck,
  knownVisualIds: ReadonlySet<string>,
): Deck {
  return stripOrphanedVisuals(deck, knownVisualIds);
}

/**
 * Collects every visual id the deck references (from both `visualIds` arrays
 * and `visual` element `visualId` fields).
 *
 * Useful as a quick way to build the "what does this deck need?" set for
 * orphan detection or dependency checks without running a full
 * `enumerateDeckDependencies` pass.
 */
export function collectDeckVisualIds(deck: Deck): Set<string> {
  const ids = new Set<string>();
  for (const slide of deck.slides) {
    if (slide.visualIds) {
      for (const id of slide.visualIds) {
        ids.add(id);
      }
    }
    if (slide.elements) {
      for (const element of slide.elements) {
        if (element.kind === "visual" && element.visualId) {
          ids.add(element.visualId);
        }
      }
    }
  }
  return ids;
}
