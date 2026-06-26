import type { Deck } from "./deck-core";
import type { SlideLayout as DeckLayout } from "./deck-layouts-model";
import { layoutHintForReusableLayout } from "./deck-layouts-model";
import {
  applyLayoutPreservingContent,
  resetLayoutPositions,
} from "./layout-apply";
import { mapSlide } from "./deck-mutation-shared";

/**
 * Applies a layout to the slide at `index` while **preserving authored
 * content** (#630): slot-bound elements move into the matching placeholder
 * geometry, empty slots get fresh placeholders, and free-form elements are
 * left untouched. The slide stays authored (`elementsDerived: false`).
 */
export function applySlideLayoutPreservingContent(
  deck: Deck,
  index: number,
  layout: DeckLayout,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const { elements } = applyLayoutPreservingContent(
      slide.elements ?? [],
      layout,
    );
    const hint = layoutHintForReusableLayout(layout.name);
    return {
      ...slide,
      ...(hint ? { layout: hint } : {}),
      elements,
      elementsDerived: false,
    };
  });
}

/**
 * Resets only the *positions* of slot-bound elements on the slide at `index`
 * to the layout's slot geometry (#629), without inserting placeholders,
 * deleting content, or reordering. Free-form elements are untouched.
 */
export function resetSlideLayoutPositions(
  deck: Deck,
  index: number,
  layout: DeckLayout,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const { elements } = resetLayoutPositions(slide.elements ?? [], layout);
    return { ...slide, elements };
  });
}
