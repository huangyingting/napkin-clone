/**
 * Pure geometry helpers for multi-selection bounding-box resize and rotate
 * (issue #329).
 *
 * All coordinates are expressed in slide-percentage units (0–100) to match the
 * rest of the free-form element model.  No DOM, no React — fully testable under
 * `node --test`.
 */

import type { ElementBox, SlideElement } from "./deck-elements";

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

/**
 * Returns the axis-aligned union bounding box that exactly contains all of the
 * given {@link ElementBox}es.  Returns a zero-sized box at the origin when the
 * input array is empty.
 */
export function selectionBoundingBox(boxes: ElementBox[]): ElementBox {
  if (boxes.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    const rx = box.x + box.w;
    const ry = box.y + box.h;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// Proportional scale
// ---------------------------------------------------------------------------

/**
 * Scales each element proportionally so its position and size within the
 * selection bounding box are preserved as ratios when the box is replaced by
 * `newBbox`.
 *
 * The input elements are **not** mutated — a new array of updated elements is
 * returned.  Elements whose box has degenerate size (w/h = 0) in `oldBbox` are
 * left untouched to avoid divide-by-zero.
 */
export function scaleElementsInBoundingBox(
  elements: SlideElement[],
  oldBbox: ElementBox,
  newBbox: ElementBox,
): SlideElement[] {
  if (oldBbox.w === 0 || oldBbox.h === 0) {
    return elements;
  }
  return elements.map((el) => {
    const relX = (el.box.x - oldBbox.x) / oldBbox.w;
    const relY = (el.box.y - oldBbox.y) / oldBbox.h;
    const relW = el.box.w / oldBbox.w;
    const relH = el.box.h / oldBbox.h;
    const newBox: ElementBox = {
      x: newBbox.x + relX * newBbox.w,
      y: newBbox.y + relY * newBbox.h,
      w: Math.max(0, relW * newBbox.w),
      h: Math.max(0, relH * newBbox.h),
    };
    return { ...el, box: newBox };
  });
}

// ---------------------------------------------------------------------------
// Rotation around a pivot
// ---------------------------------------------------------------------------

/**
 * Normalises a rotation value (degrees) to the `(−180, 180]` range used
 * throughout the deck model.  Returns `undefined` for 0° so the field can be
 * omitted from the stored element (matching the convention in `BaseElement`).
 */
function normalizeRotationDeg(deg: number): number | undefined {
  // Reduce to [0, 360)
  let n = ((deg % 360) + 360) % 360;
  // Map [180, 360) → (−180, 0)
  if (n > 180) n -= 360;
  return n === 0 ? undefined : n;
}

/**
 * Rotates each element's center around `(centerX, centerY)` by `deltaAngle`
 * degrees (clockwise positive, matching CSS `rotate()`).  The element's own
 * `rotation` field is incremented by the same delta so each shape visually
 * spins with the group.
 *
 * Connector elements follow the same transform — their bounding box center
 * rotates around the selection center just like any other element.
 *
 * The input elements are **not** mutated.
 */
export function rotateElementsAroundCenter(
  elements: SlideElement[],
  centerX: number,
  centerY: number,
  deltaAngle: number,
): SlideElement[] {
  const rad = (deltaAngle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return elements.map((el) => {
    // Current center of the element in slide-percentage coords.
    const cx = el.box.x + el.box.w / 2;
    const cy = el.box.y + el.box.h / 2;
    // Rotate around pivot.
    const dx = cx - centerX;
    const dy = cy - centerY;
    const newCx = centerX + dx * cos - dy * sin;
    const newCy = centerY + dx * sin + dy * cos;
    const newBox: ElementBox = {
      x: newCx - el.box.w / 2,
      y: newCy - el.box.h / 2,
      w: el.box.w,
      h: el.box.h,
    };
    const newRotation = normalizeRotationDeg((el.rotation ?? 0) + deltaAngle);
    const next = { ...el, box: newBox } as SlideElement;
    if (newRotation === undefined) {
      delete (next as { rotation?: number }).rotation;
    } else {
      (next as { rotation?: number }).rotation = newRotation;
    }
    return next;
  });
}
