/**
 * Conservative semantic-role inference for legacy deck elements (#616).
 *
 * Slides authored before the semantic text-role model (#603/#605) carry no
 * `textRole`. This module stamps a deterministic role onto legacy text,
 * bullets, and shape-label elements so they can participate in template
 * inheritance, while **preserving current visual output**.
 *
 * No visual drift: inference only adds the `textRole` identification field.
 * The concrete `style` / `textStyle` remains untouched and authoritative for
 * rendering during the transition (renderers consume it until the resolver
 * wiring in epic #598 lands), so migrated decks look identical until the user
 * intentionally changes or reapplies a template. Per #605, converting concrete
 * styles into `styleOverride` is owned by the render-wiring epic, not this
 * additive migration — keeping this step lossless and free of compatibility
 * shims for superseded shapes.
 *
 * Pure and DOM-free — fully testable under `node --test`.
 */

import type {
  BulletsElement,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
} from "./deck";
import type { DeckTextRole } from "./deck-theme-tokens";

/**
 * A text element is footer-like when it sits in the bottom band of the slide
 * and is short — the running footer / page-number signature. Tight thresholds
 * keep it from stealing genuine body copy.
 */
function isFooterLike(el: TextElement): boolean {
  return el.box.y >= 85 && el.box.h <= 12;
}

/**
 * Infers the semantic {@link DeckTextRole} for a legacy text element from its
 * binary `role`, position, and (when present) slide layout context.
 *
 * - `role: "title"` → `h1` (on a `title`/`section` slide it is the hero title).
 * - bottom-band short `body` text → `footer`.
 * - other `body` text → `body`.
 */
export function inferTextElementRole(
  el: TextElement,
  layout?: Slide["layout"],
): DeckTextRole {
  if (el.role === "title") return "h1";
  if (isFooterLike(el)) return "footer";
  // `layout` is accepted for future refinement (e.g. subtitle detection on a
  // title slide); body is the safe default for ordinary copy.
  void layout;
  return "body";
}

/** Bullets elements always map to the `bullet` role. */
export function inferBulletsRole(_el: BulletsElement): DeckTextRole {
  return "bullet";
}

/** A shape label maps to the `shapeLabel` role. */
export function inferShapeLabelRole(_el: ShapeElement): DeckTextRole {
  return "shapeLabel";
}

/**
 * Returns a copy of `elements` with `textRole` stamped on legacy text-bearing
 * elements that lack one. The concrete `style` / `textStyle` is preserved
 * verbatim, so rendered output is unchanged. Elements that already carry a
 * `textRole`, and shapes without a label, are returned unchanged.
 */
export function migrateElementRoles(
  elements: readonly SlideElement[],
  layout?: Slide["layout"],
): SlideElement[] {
  return elements.map((el) => {
    switch (el.kind) {
      case "text":
        if (el.textRole !== undefined) return el;
        return { ...el, textRole: inferTextElementRole(el, layout) };
      case "bullets":
        if (el.textRole !== undefined) return el;
        return { ...el, textRole: inferBulletsRole(el) };
      case "shape":
        // Only label-bearing shapes get a text role.
        if (el.textRole !== undefined || el.text === undefined) return el;
        return { ...el, textRole: inferShapeLabelRole(el) };
      default:
        return el;
    }
  });
}

/**
 * Returns a copy of `slide` with semantic roles stamped on its `elements`.
 * Slides without an `elements` array are returned unchanged.
 */
export function migrateSlideRoles(slide: Slide): Slide {
  if (!slide.elements) return slide;
  return {
    ...slide,
    elements: migrateElementRoles(slide.elements, slide.layout),
  };
}
