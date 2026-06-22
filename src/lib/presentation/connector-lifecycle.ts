/**
 * Pure helpers for maintaining {@link ConnectorElement} and legacy
 * `shape:"line"` endpoint bindings across element lifecycle operations:
 * delete, duplicate, and copy/paste.
 *
 * Design goals:
 *  - Pure and headless — no DOM, no React, no browser APIs.  Fully testable
 *    under `node --test`.
 *  - All functions are immutable: inputs are never mutated.  Object identity
 *    is preserved when nothing actually changes so callers can cheap-compare
 *    results.
 *
 * **Delete policy** — when a shape that a connector endpoint is bound to is
 * deleted, the endpoint is *detached*: converted from a
 * {@link ConnectorEndpoint} to a {@link ConnectorPointFree} at the
 * anchor's last resolved position.  The connector itself is kept, not
 * deleted, so users do not accidentally lose a connector when they meant to
 * delete a shape.
 *
 * **Duplicate / paste policy** — when both endpoint shapes are included in
 * the copied / duplicated selection, connector bindings are remapped to the
 * new copy IDs (preserving the connection between the duplicates).  When only
 * one endpoint shape is included, the unmatched endpoint is detached.
 */

import type {
  ConnectorEndpoint,
  ConnectorElement,
  ConnectorPoint,
  ConnectorPointFree,
  ShapeElement,
  SlideElement,
} from "./deck";
import { anchorPoint } from "./connector-geometry";

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `ep` is a {@link ConnectorEndpoint}
 * (`{elementId, anchor}` discriminant).
 */
function isBound(ep: ConnectorPoint): ep is ConnectorEndpoint {
  return "elementId" in ep;
}

// ---------------------------------------------------------------------------
// detachConnectorEndpoint
// ---------------------------------------------------------------------------

/**
 * Converts a {@link ConnectorEndpoint} into a {@link ConnectorPointFree}
 * at the anchor's currently-resolved position.
 *
 * The position is looked up in `elements` (the full slide element list
 * **before** any deletion so the shape's geometry is still available).
 * Returns `{ x: 50, y: 50 }` as a safe centred fallback when the target
 * element cannot be found (e.g. it was already removed).
 *
 * @param endpoint - The bound endpoint to detach.
 * @param elements - The slide element list that still contains the target.
 */
export function detachConnectorEndpoint(
  endpoint: ConnectorEndpoint,
  elements: readonly SlideElement[],
): ConnectorPointFree {
  const target = elements.find((el) => el.id === endpoint.elementId);
  if (!target) {
    // Target is already gone — fall back to slide centre.
    return { x: 50, y: 50 };
  }
  const pt = anchorPoint(target.box, endpoint.anchor);
  return { x: pt.x, y: pt.y };
}

// ---------------------------------------------------------------------------
// updateConnectorBindingsOnDelete
// ---------------------------------------------------------------------------

/**
 * Given the full slide element list **before** a deletion and the set of
 * element ids that are about to be removed, returns a new element list where
 * every connector endpoint that referenced a deleted id has been detached to
 * a free point at its last anchor position.
 *
 * - {@link ConnectorElement}: `start` and/or `end` are converted to free
 *   points when they are bound to a deleted id.
 * - Legacy `shape:"line"` {@link ShapeElement}: the `connector.start` /
 *   `connector.end` binding objects are cleared (`undefined`) when their
 *   `elementId` is in `deletedIds`.  The line's visual geometry comes from
 *   its bounding box, so clearing the binding is sufficient.
 * - All other element types are passed through with the same object identity.
 *
 * Returns the same array reference (cast to `SlideElement[]`) when
 * `deletedIds` is empty or no element is actually affected — callers can use
 * reference equality as a cheap no-op signal.
 *
 * **Call this BEFORE filtering out the deleted elements** so that the shapes'
 * position data is still available for anchor resolution.
 *
 * @param elements   The full slide element list (still contains the shapes
 *                   that are about to be deleted).
 * @param deletedIds The ids of elements that will be removed.
 */
export function updateConnectorBindingsOnDelete(
  elements: readonly SlideElement[],
  deletedIds: ReadonlySet<string>,
): SlideElement[] {
  if (deletedIds.size === 0) {
    return elements as SlideElement[];
  }

  let anyChanged = false;
  const patched = elements.map((el): SlideElement => {
    let next: SlideElement;

    if (el.kind === "connector") {
      next = patchConnectorOnDelete(el, deletedIds, elements);
    } else if (el.kind === "shape" && el.shape === "line") {
      next = patchLegacyLineOnDelete(
        el as ShapeElement & { shape: "line" },
        deletedIds,
      );
    } else {
      return el;
    }

    if (next !== el) anyChanged = true;
    return next;
  });

  return anyChanged ? patched : (elements as SlideElement[]);
}

/** Patches a single {@link ConnectorElement} for a pending deletion batch. */
function patchConnectorOnDelete(
  el: ConnectorElement,
  deletedIds: ReadonlySet<string>,
  elements: readonly SlideElement[],
): ConnectorElement {
  const startNeedsDetach =
    isBound(el.start) && deletedIds.has(el.start.elementId);
  const endNeedsDetach = isBound(el.end) && deletedIds.has(el.end.elementId);

  if (!startNeedsDetach && !endNeedsDetach) return el;

  return {
    ...el,
    start: startNeedsDetach
      ? detachConnectorEndpoint(el.start as ConnectorEndpoint, elements)
      : el.start,
    end: endNeedsDetach
      ? detachConnectorEndpoint(el.end as ConnectorEndpoint, elements)
      : el.end,
  };
}

/**
 * Patches a legacy `shape:"line"` element by clearing any connector binding
 * whose `elementId` is in `deletedIds`.
 */
function patchLegacyLineOnDelete(
  el: ShapeElement & { shape: "line" },
  deletedIds: ReadonlySet<string>,
): ShapeElement {
  if (!el.connector) return el;

  const startAffected =
    el.connector.start !== undefined &&
    deletedIds.has(el.connector.start.elementId);
  const endAffected =
    el.connector.end !== undefined &&
    deletedIds.has(el.connector.end.elementId);

  if (!startAffected && !endAffected) return el;

  const connector = { ...el.connector };
  if (startAffected) delete connector.start;
  if (endAffected) delete connector.end;

  return { ...el, connector };
}

// ---------------------------------------------------------------------------
// remapConnectorBindings
// ---------------------------------------------------------------------------

/**
 * Remaps or detaches bound connector endpoints in a set of duplicate / pasted
 * copies according to `idMap` (old id → new id for every element included in
 * the duplication / paste operation).
 *
 * Rules for each bound endpoint in a copied {@link ConnectorElement}:
 * - `elementId` **is** in `idMap` → the binding is updated to the copy id
 *   (both connected shapes were included — the connection is preserved).
 * - `elementId` **is not** in `idMap` → the endpoint is detached to a free
 *   point at the position resolved against `allElements` (only one connected
 *   shape was included — the dangling endpoint becomes a free point).
 *
 * For legacy `shape:"line"` copies:
 * - `connector.start` / `connector.end` are remapped when the elementId is in
 *   `idMap`, or cleared when it is not (the line's visual geometry is
 *   bounding-box derived so clearing is sufficient).
 *
 * Non-connector copies are returned with the same object identity.
 * The `allElements` list should be the **original** slide elements (before the
 * copies are appended) so that positions of unremapped shapes can be resolved.
 *
 * @param copies      The newly created copies (same connector endpoint ids as
 *                    the originals before remapping).
 * @param idMap       Maps each original element id to its copy id for every
 *                    element included in the duplication / paste.
 * @param allElements The original slide element list (used to resolve
 *                    positions when detaching unremapped endpoints).
 */
export function remapConnectorBindings(
  copies: SlideElement[],
  idMap: ReadonlyMap<string, string>,
  allElements: readonly SlideElement[],
): SlideElement[] {
  if (idMap.size === 0) return copies;

  let anyChanged = false;
  const result = copies.map((el): SlideElement => {
    let next: SlideElement;

    if (el.kind === "connector") {
      next = remapConnectorElement(el, idMap, allElements);
    } else if (el.kind === "shape" && el.shape === "line") {
      next = remapLegacyLine(el as ShapeElement & { shape: "line" }, idMap);
    } else {
      return el;
    }

    if (next !== el) anyChanged = true;
    return next;
  });

  return anyChanged ? result : copies;
}

/** Remaps (or detaches) the endpoints of a single copied connector. */
function remapConnectorElement(
  el: ConnectorElement,
  idMap: ReadonlyMap<string, string>,
  allElements: readonly SlideElement[],
): ConnectorElement {
  const newStart = remapEndpoint(el.start, idMap, allElements);
  const newEnd = remapEndpoint(el.end, idMap, allElements);
  if (newStart === el.start && newEnd === el.end) return el;
  return { ...el, start: newStart, end: newEnd };
}

/**
 * Remaps a single endpoint:
 * - Free points pass through unchanged.
 * - Bound endpoints whose target is in `idMap` are remapped.
 * - Bound endpoints whose target is NOT in `idMap` are detached.
 */
function remapEndpoint(
  ep: ConnectorPoint,
  idMap: ReadonlyMap<string, string>,
  allElements: readonly SlideElement[],
): ConnectorPoint {
  if (!isBound(ep)) return ep;

  const newId = idMap.get(ep.elementId);
  if (newId !== undefined) {
    // Both endpoints included in the selection — remap to the copy.
    return { elementId: newId, anchor: ep.anchor };
  }
  // Only one endpoint included — detach to a free point.
  return detachConnectorEndpoint(ep, allElements);
}

/** Remaps (or clears) the connector bindings of a legacy line copy. */
function remapLegacyLine(
  el: ShapeElement & { shape: "line" },
  idMap: ReadonlyMap<string, string>,
): ShapeElement {
  if (!el.connector) return el;

  let changed = false;
  const connector = { ...el.connector };

  if (connector.start) {
    const newId = idMap.get(connector.start.elementId);
    if (newId !== undefined) {
      connector.start = { ...connector.start, elementId: newId };
      changed = true;
    } else {
      // Not in selection — clear the binding.
      delete connector.start;
      changed = true;
    }
  }

  if (connector.end) {
    const newId = idMap.get(connector.end.elementId);
    if (newId !== undefined) {
      connector.end = { ...connector.end, elementId: newId };
      changed = true;
    } else {
      // Not in selection — clear the binding.
      delete connector.end;
      changed = true;
    }
  }

  if (!changed) return el;
  return { ...el, connector };
}
