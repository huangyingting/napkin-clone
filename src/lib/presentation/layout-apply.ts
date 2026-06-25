/**
 * Safe, content-preserving layout application (#630).
 *
 * Binds a target layout onto a populated slide: each layout placeholder is
 * matched to the existing element bound to the same semantic slot (#628) and
 * that element is moved into the placeholder's geometry, preserving its text,
 * runs, styles, and source refs. Slots with no existing content receive a fresh
 * placeholder, and free-form (unbound) elements are never moved or deleted.
 *
 * Pure and DOM-free — fully testable under `node --test`.
 */

import {
  makeElementId,
  type PlaceholderElement,
  type SlideElement,
  type SlideLayout,
} from "./deck";
import {
  slotKey,
  type LayoutSlotBinding,
  type SlideSlotKind,
} from "./slide-slots";

/** A target slot derived from a layout placeholder. */
interface TargetSlot {
  binding: LayoutSlotBinding;
  placeholder: PlaceholderElement;
}

/** Outcome of {@link applyLayoutPreservingContent}. */
export interface LayoutApplyResult {
  /** New element list (geometry-updated content + inserted placeholders). */
  elements: SlideElement[];
  /** Slot keys (`kind#index`) whose existing content was moved into place. */
  moved: string[];
  /** Slot keys that received a freshly inserted placeholder. */
  inserted: string[];
}

/**
 * Derives the ordered list of target slots from a layout's placeholders,
 * assigning per-kind occurrence indices (`title#0`, `body#0`, `body#1`, …).
 */
function targetSlots(layout: SlideLayout): TargetSlot[] {
  const counts = new Map<SlideSlotKind, number>();
  return layout.placeholders.map((placeholder) => {
    const kind = placeholder.placeholderType as SlideSlotKind;
    const index = counts.get(kind) ?? 0;
    counts.set(kind, index + 1);
    return {
      binding: { kind, ...(index > 0 ? { index } : {}) },
      placeholder,
    };
  });
}

/** True when an element's binding matches a target slot. */
function matchesSlot(
  element: SlideElement,
  binding: LayoutSlotBinding,
): boolean {
  const b = element.layoutSlot;
  return (
    b !== undefined &&
    b.kind === binding.kind &&
    (b.index ?? 0) === (binding.index ?? 0)
  );
}

/**
 * Applies `layout` onto `elements`, moving slot-bound content into the matching
 * placeholder geometry, inserting placeholders for empty slots, and leaving
 * free-form elements untouched. z-indices are restacked in document order.
 */
export function applyLayoutPreservingContent(
  elements: readonly SlideElement[],
  layout: SlideLayout,
): LayoutApplyResult {
  const slots = targetSlots(layout);
  const moved: string[] = [];
  const inserted: string[] = [];
  const consumed = new Set<string>();

  // 1. Move existing bound content into its slot's geometry; keep everything
  //    else (free-form, or bound to a slot absent from the target) as-is.
  const next: SlideElement[] = elements.map((el) => {
    const slot = slots.find(
      (s) => !consumed.has(slotKey(s.binding)) && matchesSlot(el, s.binding),
    );
    if (!slot) return el;
    consumed.add(slotKey(slot.binding));
    moved.push(slotKey(slot.binding));
    return { ...el, box: { ...slot.placeholder.box } } as SlideElement;
  });

  // 2. Insert a fresh placeholder for every target slot with no existing
  //    content, binding it to the slot so a later apply can match it.
  for (const slot of slots) {
    if (consumed.has(slotKey(slot.binding))) continue;
    const placeholder: PlaceholderElement = {
      ...slot.placeholder,
      id: makeElementId(),
      box: { ...slot.placeholder.box },
      layoutSlot: { ...slot.binding },
    };
    next.push(placeholder);
    inserted.push(slotKey(slot.binding));
  }

  // 3. Restack z-indices in document order.
  const restacked = next.map((el, i) => ({ ...el, zIndex: i }) as SlideElement);

  return { elements: restacked, moved, inserted };
}

/** Outcome of {@link resetLayoutPositions}. */
export interface LayoutResetResult {
  /** New element list (bound elements repositioned; order/z-index preserved). */
  elements: SlideElement[];
  /** Slot keys whose bound element was repositioned. */
  moved: string[];
}

/**
 * Restores bound elements to their slot geometry **without changing content or
 * structure** (#629 "Reset layout positions"). Unlike
 * {@link applyLayoutPreservingContent} this never inserts placeholders, never
 * deletes anything, and preserves element order and z-index — it only updates
 * the `box` of elements already bound to a slot present in the layout. Safe,
 * non-destructive, and undoable.
 */
export function resetLayoutPositions(
  elements: readonly SlideElement[],
  layout: SlideLayout,
): LayoutResetResult {
  const slots = targetSlots(layout);
  const moved: string[] = [];
  const consumed = new Set<string>();

  const next: SlideElement[] = elements.map((el) => {
    const slot = slots.find(
      (s) => !consumed.has(slotKey(s.binding)) && matchesSlot(el, s.binding),
    );
    if (!slot) return el;
    consumed.add(slotKey(slot.binding));
    moved.push(slotKey(slot.binding));
    return { ...el, box: { ...slot.placeholder.box } } as SlideElement;
  });

  return { elements: next, moved };
}
