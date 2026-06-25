/**
 * Pure, framework-free decision helpers for the canvas keyboard accessibility
 * wave (issues #530–#535).
 *
 * Everything here is headless — no DOM, no React, no browser APIs — so the real
 * coverage for the keyboard model lives in `canvas-a11y.test.ts` rather than in
 * a browser. The React editors (`slide-editor.tsx`, `slide-stage-editor.tsx`)
 * call into these helpers and keep their own wiring minimal.
 *
 * Geometry is expressed in the same percentage units (0–100) as every
 * {@link ElementBox}, so the helpers are resolution independent.
 */

import { CONNECTOR_ANCHORS, anchorPoint } from "./connector-geometry";
import {
  SHORTCUT_REGISTRY,
  shortcutDisplayLabel,
} from "@/lib/shortcuts/catalog";
import type {
  ConnectorAnchor,
  ConnectorElement,
  ConnectorEndpoint,
  ElementBox,
  SlideElement,
} from "./deck";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** The four arrow keys that drive keyboard nudge and resize. */
export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** A minimal positioned element shape used by the traversal helpers. */
export interface PositionedElement {
  id: string;
  box: ElementBox;
}

interface PointPct {
  x: number;
  y: number;
}

const ARROW_KEYS: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

/** Returns `true` when `key` is one of the four {@link ArrowKey} values. */
export function isArrowKey(key: string): key is ArrowKey {
  return ARROW_KEYS.has(key);
}

// ---------------------------------------------------------------------------
// #530 (R1) — Keyboard resize parity
// ---------------------------------------------------------------------------

/** Bounds + minimum-size constraints applied by {@link resizeBoxByStep}. */
export interface ResizeBounds {
  /** Minimum width and height in percent units. Defaults to `2`. */
  minPct?: number;
  /** Canvas extent in percent units. Defaults to `{ width: 100, height: 100 }`. */
  canvas?: { width: number; height: number };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Resizes a single {@link ElementBox} by one keyboard step, mirroring the nudge
 * step model. The element's top-left (`x`, `y`) stays fixed; only the right and
 * bottom edges move:
 *
 * - `ArrowRight` widens (right edge out), `ArrowLeft` narrows.
 * - `ArrowDown` grows taller (bottom edge down), `ArrowUp` shrinks shorter.
 *
 * The result is clamped to `minPct` and to the canvas bounds so the box can
 * never invert, shrink below the minimum, or extend past the slide edge. When
 * the clamp leaves the box unchanged the original reference is returned so
 * callers can cheaply detect a no-op.
 */
export function resizeBoxByStep(
  box: ElementBox,
  key: ArrowKey,
  stepPct: number,
  bounds: ResizeBounds = {},
): ElementBox {
  const min = bounds.minPct ?? 2;
  const canvasW = bounds.canvas?.width ?? 100;
  const canvasH = bounds.canvas?.height ?? 100;

  let w = box.w;
  let h = box.h;

  switch (key) {
    case "ArrowRight":
      w = clamp(box.w + stepPct, min, canvasW - box.x);
      break;
    case "ArrowLeft":
      w = clamp(box.w - stepPct, min, canvasW - box.x);
      break;
    case "ArrowDown":
      h = clamp(box.h + stepPct, min, canvasH - box.y);
      break;
    case "ArrowUp":
      h = clamp(box.h - stepPct, min, canvasH - box.y);
      break;
  }

  if (w === box.w && h === box.h) {
    return box;
  }
  return { ...box, w, h };
}

// ---------------------------------------------------------------------------
// #531 (R2) — Deterministic selection traversal
// ---------------------------------------------------------------------------

/**
 * Returns the element ids in a deterministic reading order: top → bottom by box
 * top edge, then left → right by box left edge, with the id itself as a final
 * tiebreaker so the order is stable regardless of the input array order.
 *
 * Used to drive keyboard "select next / previous" traversal and roving
 * tabindex, so traversal never depends on raw DOM / z-index order.
 */
export function orderedElementIds(
  elements: readonly PositionedElement[],
): string[] {
  return elements
    .slice()
    .sort((a, b) => {
      if (a.box.y !== b.box.y) return a.box.y - b.box.y;
      if (a.box.x !== b.box.x) return a.box.x - b.box.x;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((el) => el.id);
}

/**
 * Returns the next (or previous) element id in `orderedIds` relative to
 * `currentId`, wrapping around at the ends.
 *
 * - `dir > 0` moves forward, `dir < 0` moves backward.
 * - When `currentId` is `null` or not present, forward starts at the first
 *   element and backward starts at the last.
 * - Returns `null` only when there are no elements to traverse.
 */
export function nextElementId(
  orderedIds: readonly string[],
  currentId: string | null,
  dir: number,
): string | null {
  if (orderedIds.length === 0) return null;
  const step = dir < 0 ? -1 : 1;
  const index = currentId == null ? -1 : orderedIds.indexOf(currentId);
  if (index === -1) {
    return step > 0 ? orderedIds[0] : orderedIds[orderedIds.length - 1];
  }
  const next = (index + step + orderedIds.length) % orderedIds.length;
  return orderedIds[next];
}

// ---------------------------------------------------------------------------
// #532 (R2) — Focus restoration after mutations
// ---------------------------------------------------------------------------

/**
 * Given the reading order **before** a deletion and the set of ids being
 * removed, returns the id of the element that should receive focus afterwards:
 * the nearest surviving element after the first deleted one in reading order,
 * falling back to the nearest surviving element before it. Returns `null` when
 * nothing survives (the caller should focus the canvas container instead).
 */
export function focusTargetAfterDelete(
  orderedIds: readonly string[],
  deletedIds: ReadonlySet<string>,
): string | null {
  if (orderedIds.length === 0 || deletedIds.size === 0) return null;
  const firstDeleted = orderedIds.findIndex((id) => deletedIds.has(id));
  if (firstDeleted === -1) return null;

  for (let i = firstDeleted + 1; i < orderedIds.length; i += 1) {
    if (!deletedIds.has(orderedIds[i])) return orderedIds[i];
  }
  for (let i = firstDeleted - 1; i >= 0; i -= 1) {
    if (!deletedIds.has(orderedIds[i])) return orderedIds[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// #533 (R3) — Screen-reader announcement string builders
// ---------------------------------------------------------------------------

function pct(value: number): number {
  return Math.round(value);
}

/** "Selected {name}" — announced when the canvas selection changes. */
export function announceSelection(name: string): string {
  return `Selected ${name}`;
}

/** "Moved {name} to {x}%, {y}%" — announced after a keyboard nudge. */
export function announceMove(name: string, x: number, y: number): string {
  return `Moved ${name} to ${pct(x)}%, ${pct(y)}%`;
}

/** "Resized {name} to {w}% by {h}%" — announced after a keyboard resize. */
export function announceResize(name: string, w: number, h: number): string {
  return `Resized ${name} to ${pct(w)}% by ${pct(h)}%`;
}

/** "Deleted {name}" — announced after a keyboard delete. */
export function announceDelete(name: string): string {
  return `Deleted ${name}`;
}

// ---------------------------------------------------------------------------
// #534 (A1) — Keyboard connector create / reattach (interim subset)
// ---------------------------------------------------------------------------

/**
 * Returns `true` when an element can be a connector endpoint: any positioned
 * element that is neither a connector itself nor a free `line` shape (lines are
 * skipped by the pointer anchor-snapping model too).
 */
export function isConnectableElement(el: SlideElement): boolean {
  if (el.kind === "connector") return false;
  if (el.kind === "shape" && el.shape === "line") return false;
  return true;
}

/**
 * Resolves the two connectable elements to wire together when exactly two are
 * selected, ordered by reading order (so `start` is the upper-left element).
 * Returns `null` when the selection is not exactly two connectable elements.
 */
export function selectedConnectablePair(
  elements: readonly SlideElement[],
  selectedIds: ReadonlySet<string>,
): [SlideElement, SlideElement] | null {
  const selected = elements.filter((el) => selectedIds.has(el.id));
  if (selected.length !== 2) return null;
  if (!selected.every(isConnectableElement)) return null;
  const order = orderedElementIds(selected);
  const first = selected.find((el) => el.id === order[0]);
  const second = selected.find((el) => el.id === order[1]);
  if (!first || !second) return null;
  return [first, second];
}

/**
 * Chooses the most natural pair of facing anchors for a connector between two
 * boxes, based on the dominant separation axis: a horizontal layout binds
 * `right → left` (or the reverse), a vertical layout binds `bottom → top`.
 */
export function defaultAnchorPair(
  boxA: ElementBox,
  boxB: ElementBox,
): { start: ConnectorAnchor; end: ConnectorAnchor } {
  const aCenter = anchorPoint(boxA, "center");
  const bCenter = anchorPoint(boxB, "center");
  const dx = bCenter.x - aCenter.x;
  const dy = bCenter.y - aCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { start: "right", end: "left" }
      : { start: "left", end: "right" };
  }
  return dy >= 0
    ? { start: "bottom", end: "top" }
    : { start: "top", end: "bottom" };
}

/**
 * Returns the axis-aligned bounding box (in percent units) spanning two points,
 * never smaller than `minPct` on either axis so a perfectly horizontal or
 * vertical connector still has a non-degenerate box.
 */
export function connectorBoundingBox(
  p1: PointPct,
  p2: PointPct,
  minPct = 1,
): ElementBox {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.max(Math.abs(p2.x - p1.x), minPct);
  const h = Math.max(Math.abs(p2.y - p1.y), minPct);
  return { x, y, w, h };
}

/**
 * Builds a connector element (without `id` / `zIndex`, which the
 * `ADD_ELEMENT` command assigns) whose endpoints are bound to the two given
 * elements at their default facing anchors. This is the accessible interim
 * path: create a default-endpoint connector, then nudge / reattach by keyboard.
 */
export function buildConnectorBetween(
  a: SlideElement,
  b: SlideElement,
): Omit<ConnectorElement, "id" | "zIndex"> {
  const { start: startAnchor, end: endAnchor } = defaultAnchorPair(
    a.box,
    b.box,
  );
  const startPt = anchorPoint(a.box, startAnchor);
  const endPt = anchorPoint(b.box, endAnchor);
  return {
    kind: "connector",
    box: connectorBoundingBox(startPt, endPt),
    start: { elementId: a.id, anchor: startAnchor },
    end: { elementId: b.id, anchor: endAnchor },
    arrowEnd: "arrow",
  };
}

function isBoundEndpoint(
  endpoint: ConnectorElement["start"],
): endpoint is ConnectorEndpoint {
  return "elementId" in endpoint;
}

/**
 * Cycles the anchor of a bound connector endpoint among the candidate anchors
 * (`center / top / bottom / left / right`) by `dir`, returning a new connector.
 * When the endpoint is a free floating point it has no candidate anchors, so
 * the original connector is returned unchanged (identity).
 */
export function cycleEndpointAnchor(
  connector: ConnectorElement,
  whichEnd: "start" | "end",
  dir: number,
): ConnectorElement {
  const endpoint = connector[whichEnd];
  if (!isBoundEndpoint(endpoint)) return connector;
  const anchors = CONNECTOR_ANCHORS;
  const step = dir < 0 ? -1 : 1;
  const index = anchors.indexOf(endpoint.anchor);
  const safeIndex = index === -1 ? 0 : index;
  const nextAnchor =
    anchors[(safeIndex + step + anchors.length) % anchors.length];
  if (nextAnchor === endpoint.anchor) return connector;
  return {
    ...connector,
    [whichEnd]: { elementId: endpoint.elementId, anchor: nextAnchor },
  };
}

// ---------------------------------------------------------------------------
// #535 — In-product keyboard shortcut help
// ---------------------------------------------------------------------------

/** A single keyboard shortcut row in the help overlay. */
export interface ShortcutHelpEntry {
  /** Human-readable key combination, e.g. `"Alt + Arrow"`. */
  keys: string;
  /** What the shortcut does. */
  description: string;
}

/** A titled group of related shortcuts. */
export interface ShortcutHelpGroup {
  title: string;
  entries: ShortcutHelpEntry[];
}

/**
 * Returns the grouped canvas keyboard shortcut reference rendered by the
 * in-product help dialog (#535). `isMac` swaps the Ctrl modifier for ⌘ so the
 * overlay matches the platform shortcuts used by the editor.
 */
export function canvasShortcutHelp(
  opts: { isMac?: boolean } = {},
): ShortcutHelpGroup[] {
  const groups = new Map<string, ShortcutHelpEntry[]>();
  for (const shortcut of SHORTCUT_REGISTRY) {
    if (shortcut.surface !== "slide-canvas" || !shortcut.helpGroup) {
      continue;
    }
    const entries = groups.get(shortcut.helpGroup) ?? [];
    entries.push({
      keys: shortcutDisplayLabel(shortcut, opts),
      description: shortcut.description,
    });
    groups.set(shortcut.helpGroup, entries);
  }
  return Array.from(groups, ([title, entries]) => ({ title, entries }));
}
