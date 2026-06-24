/**
 * Semantic slide-slot model (#628).
 *
 * Layout binding needs to know what an element *represents* (title, body,
 * visual, …) so a layout change can move authored content into the target
 * layout's geometry instead of replacing or orphaning it. This module defines
 * the canonical slot vocabulary and small pure helpers for reading slot
 * bindings off elements.
 *
 * Design constraints:
 *  - No DOM, no React, no imports from `deck.ts` (kept dependency-free so the
 *    element types in `deck.ts` can import {@link LayoutSlotBinding} without a
 *    runtime cycle).
 *  - Bindings are additive and optional. An element without a binding is
 *    free-form/unbound and is never moved by layout application.
 */

/**
 * Canonical semantic slot kinds. A superset of `PlaceholderType` (title,
 * subtitle, body, visual, footer) plus `image` and `caption`, which real
 * slides commonly carry but the reusable-placeholder catalogue did not model.
 */
export const SLIDE_SLOT_KINDS = [
  "title",
  "subtitle",
  "body",
  "visual",
  "image",
  "caption",
  "footer",
] as const;

export type SlideSlotKind = (typeof SLIDE_SLOT_KINDS)[number];

/** Type guard: is `value` a known {@link SlideSlotKind}? */
export function isSlideSlotKind(value: unknown): value is SlideSlotKind {
  return (
    typeof value === "string" &&
    (SLIDE_SLOT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Binds an element to a semantic layout slot. `index` disambiguates repeated
 * same-kind slots on one slide (e.g. body column 1 vs body column 2); absent
 * means occurrence 0.
 */
export interface LayoutSlotBinding {
  kind: SlideSlotKind;
  /** Occurrence index for repeated same-kind slots (0-based). Absent → 0. */
  index?: number;
}

/** Minimal element shape the slot helpers operate on. */
interface SlotBoundLike {
  layoutSlot?: LayoutSlotBinding;
}

/** Normalizes a binding's occurrence index, treating absent as 0. */
export function slotIndex(binding: LayoutSlotBinding): number {
  return binding.index ?? 0;
}

/**
 * Stable string key for a binding, e.g. `"body#0"`. Useful for matching slots
 * across the existing slide and a target layout deterministically.
 */
export function slotKey(binding: LayoutSlotBinding): string {
  return `${binding.kind}#${slotIndex(binding)}`;
}

/** True when two bindings refer to the same slot kind and occurrence. */
export function sameSlot(a: LayoutSlotBinding, b: LayoutSlotBinding): boolean {
  return a.kind === b.kind && slotIndex(a) === slotIndex(b);
}

/** True when the element is bound to a layout slot (not free-form). */
export function isBoundElement<T extends SlotBoundLike>(el: T): boolean {
  return el.layoutSlot !== undefined;
}

/**
 * Returns the first element bound to the given slot kind + occurrence index,
 * or `undefined` when no element fills that slot.
 */
export function findSlotElement<T extends SlotBoundLike>(
  elements: readonly T[],
  kind: SlideSlotKind,
  index = 0,
): T | undefined {
  return elements.find(
    (el) =>
      el.layoutSlot !== undefined &&
      el.layoutSlot.kind === kind &&
      slotIndex(el.layoutSlot) === index,
  );
}

/** Returns only the free-form (unbound) elements, preserving order. */
export function freeFormElements<T extends SlotBoundLike>(
  elements: readonly T[],
): T[] {
  return elements.filter((el) => el.layoutSlot === undefined);
}

/** Returns the bound elements paired with their binding, preserving order. */
export function boundSlots<T extends SlotBoundLike>(
  elements: readonly T[],
): Array<{ binding: LayoutSlotBinding; element: T }> {
  const out: Array<{ binding: LayoutSlotBinding; element: T }> = [];
  for (const el of elements) {
    if (el.layoutSlot !== undefined) {
      out.push({ binding: el.layoutSlot, element: el });
    }
  }
  return out;
}
