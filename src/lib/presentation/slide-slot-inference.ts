/**
 * Conservative semantic-slot inference for legacy slides (#626).
 *
 * Slides created before layout binding (#628) carry no `layoutSlot` metadata.
 * To let layout application work on those decks without visual drift, this
 * module infers bindings from high-confidence signals (element kind, text role,
 * placeholder type, and a tight footer position heuristic) and **leaves
 * uncertain elements unbound** rather than guessing destructively.
 *
 * Inference only adds optional metadata: geometry, content, runs, styles, and
 * source refs are never modified, so rendered output is unchanged. Elements
 * that already carry a binding are preserved as-is.
 *
 * Pure and DOM-free — fully testable under `node --test`.
 */

import type { Slide, SlideElement, TextElement } from "./deck";
import type { LayoutSlotBinding, SlideSlotKind } from "./slide-slots";

/**
 * A text element is footer-like when it sits in the bottom band of the slide
 * and is short — the typical signature of a running footer / page-number strip.
 * Tight thresholds keep this from stealing genuine body content.
 */
function isFooterLike(el: TextElement): boolean {
  return el.box.y >= 85 && el.box.h <= 12;
}

/**
 * Returns the high-confidence slot kind for an element, or `undefined` when the
 * element is genuinely ambiguous (images, shapes, connectors) and should stay
 * free-form.
 *
 * Confidence sources:
 *  - `placeholder` → its declared `placeholderType` (already semantic).
 *  - `text` with `role: "title"` → title.
 *  - `text` in the bottom band → footer (tight heuristic).
 *  - other `text` and all `bullets` → body.
 *  - `visual` → visual.
 */
export function inferElementSlotKind(
  el: SlideElement,
): SlideSlotKind | undefined {
  switch (el.kind) {
    case "placeholder":
      return el.placeholderType;
    case "text":
      if (el.role === "title") return "title";
      if (isFooterLike(el)) return "footer";
      return "body";
    case "bullets":
      return "body";
    case "visual":
      return "visual";
    default:
      // image / shape / connector → uncertain, leave unbound.
      return undefined;
  }
}

/**
 * Returns a copy of `elements` with inferred `layoutSlot` bindings added to
 * unbound, high-confidence elements. Repeated same-kind slots receive
 * deterministic occurrence indices in document order (e.g. `body#0`, `body#1`).
 * Already-bound and ambiguous elements are returned unchanged.
 */
export function inferElementSlots(
  elements: readonly SlideElement[],
): SlideElement[] {
  const counts = new Map<SlideSlotKind, number>();
  return elements.map((el) => {
    if (el.layoutSlot !== undefined) return el;
    const kind = inferElementSlotKind(el);
    if (kind === undefined) return el;
    const occurrence = counts.get(kind) ?? 0;
    counts.set(kind, occurrence + 1);
    const binding: LayoutSlotBinding = {
      kind,
      ...(occurrence > 0 ? { index: occurrence } : {}),
    };
    return { ...el, layoutSlot: binding } as SlideElement;
  });
}

/**
 * Returns a copy of `slide` with inferred slot bindings applied to its
 * `elements`. Slides without an `elements` array are returned unchanged.
 */
export function inferSlideSlots(slide: Slide): Slide {
  if (!slide.elements) return slide;
  return { ...slide, elements: inferElementSlots(slide.elements) };
}
