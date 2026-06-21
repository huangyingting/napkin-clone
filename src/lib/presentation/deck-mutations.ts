/**
 * Pure, immutable mutation helpers for an edited {@link Deck}.
 *
 * Every function returns a brand-new `Deck` (and new `Slide` objects) — the
 * input is never mutated. After any reorder/add/remove the slides are
 * re-indexed so `slide.index === array position`. No DOM, no React — fully
 * testable under `node --test`.
 */

import type { Deck, DeckTheme, Slide, SlideElement } from "./deck";
import { makeElementId, materializeSlideElements } from "./deck";

/**
 * `Omit` that distributes over a discriminated union, preserving each member's
 * own fields (the built-in `Omit` collapses a union to its common keys).
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A partial patch for a single element, distributing over the union. */
export type ElementPatch = Partial<
  DistributiveOmit<SlideElement, "id" | "kind">
>;

/** Re-stamps each slide's `index` to match its position in the array. */
function reindex(slides: Slide[]): Slide[] {
  return slides.map((slide, index) =>
    slide.index === index ? slide : { ...slide, index },
  );
}

/** Creates a blank slide. `index` is a placeholder; callers re-index. */
function freshBlankSlide(theme: DeckTheme): Slide {
  return {
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme,
  };
}

/** Reorders slides: moves the slide at `fromIndex` to `toIndex`. */
export function reorderSlides(
  deck: Deck,
  fromIndex: number,
  toIndex: number,
): Deck {
  const slides = [...deck.slides];
  if (
    fromIndex < 0 ||
    fromIndex >= slides.length ||
    toIndex < 0 ||
    toIndex >= slides.length ||
    fromIndex === toIndex
  ) {
    return deck;
  }

  const [moved] = slides.splice(fromIndex, 1);
  slides.splice(toIndex, 0, moved);

  return { ...deck, slides: reindex(slides) };
}

/** Adds a blank slide after `afterIndex` (`-1` prepends). */
export function addSlide(deck: Deck, afterIndex: number): Deck {
  const slides = [...deck.slides];
  const insertAt = Math.max(0, Math.min(afterIndex + 1, slides.length));
  slides.splice(insertAt, 0, freshBlankSlide(deck.theme));

  return { ...deck, slides: reindex(slides) };
}

/** Duplicates the slide at `index`, inserting the copy right after it. */
export function duplicateSlide(deck: Deck, index: number): Deck {
  if (index < 0 || index >= deck.slides.length) {
    return deck;
  }

  const original = deck.slides[index];
  const copy: Slide = {
    ...original,
    bullets: [...original.bullets],
    visualIds: [...original.visualIds],
    ...(original.elements
      ? { elements: original.elements.map((element) => ({ ...element })) }
      : {}),
  };

  const slides = [...deck.slides];
  slides.splice(index + 1, 0, copy);

  return { ...deck, slides: reindex(slides) };
}

/** Removes the slide at `index`, keeping at least one slide in the deck. */
export function removeSlide(deck: Deck, index: number): Deck {
  if (index < 0 || index >= deck.slides.length || deck.slides.length <= 1) {
    return deck;
  }

  const slides = [...deck.slides];
  slides.splice(index, 1);

  return { ...deck, slides: reindex(slides) };
}

/** Updates a slide's field(s) and re-indexes the deck. */
export function updateSlide(
  deck: Deck,
  index: number,
  patch: Partial<Omit<Slide, "index" | "theme">>,
): Deck {
  if (index < 0 || index >= deck.slides.length) {
    return deck;
  }

  const slides = deck.slides.map((slide, i) =>
    i === index
      ? { ...slide, ...patch, index: slide.index, theme: slide.theme }
      : slide,
  );

  return { ...deck, slides: reindex(slides) };
}

/** Changes the deck theme, copying it onto every slide. */
export function setDeckTheme(deck: Deck, theme: DeckTheme): Deck {
  return {
    ...deck,
    theme,
    slides: deck.slides.map((slide) =>
      slide.theme === theme ? slide : { ...slide, theme },
    ),
  };
}

// ---------------------------------------------------------------------------
// Free-form element mutations
// ---------------------------------------------------------------------------

/** Maps a single slide by index, leaving the rest of the deck untouched. */
function mapSlide(
  deck: Deck,
  index: number,
  fn: (slide: Slide) => Slide,
): Deck {
  if (index < 0 || index >= deck.slides.length) {
    return deck;
  }
  const slides = deck.slides.map((slide, i) =>
    i === index ? fn(slide) : slide,
  );
  return { ...deck, slides };
}

/**
 * Materializes a slide's legacy content into free-form elements (no-op when the
 * slide already has elements). After this the slide is edited element-first.
 */
export function materializeSlide(deck: Deck, index: number): Deck {
  return mapSlide(deck, index, (slide) =>
    slide.elements && slide.elements.length > 0
      ? slide
      : { ...slide, elements: materializeSlideElements(slide) },
  );
}

/**
 * True when a slide still holds legacy content (title / bullets / visuals) that
 * has not yet been materialized into free-form `elements`. A blank slide with
 * no legacy content returns `false` — there is nothing to derive.
 *
 * Pure and deterministic: mirrors the element-producing branches of
 * {@link materializeSlideElements} without generating any ids, so it is safe to
 * call repeatedly (e.g. from the editor on open, or from tests).
 */
export function slideNeedsMaterialization(slide: Slide): boolean {
  if (slide.elements && slide.elements.length > 0) {
    return false;
  }
  return Boolean(
    slide.title ||
    (slide.bullets?.length ?? 0) > 0 ||
    (slide.visualIds?.length ?? 0) > 0,
  );
}

/**
 * Materializes every legacy slide in the deck so each one is directly editable
 * element-first. Slides that already have elements — or that are blank with no
 * legacy content — are left untouched.
 *
 * Returns the *same* deck reference when nothing needs materializing, so a
 * history `commit` of the result is a no-op (the snapshot reducer skips
 * reference-equal decks) and the editor can call this on open without polluting
 * undo history for already-materialized decks.
 */
export function materializeDeck(deck: Deck): Deck {
  let changed = false;
  const slides = deck.slides.map((slide) => {
    if (!slideNeedsMaterialization(slide)) {
      return slide;
    }
    changed = true;
    return { ...slide, elements: materializeSlideElements(slide) };
  });
  return changed ? { ...deck, slides } : deck;
}

/** Returns the next z-index above the current maximum on a slide. */
function nextZIndex(elements: readonly SlideElement[]): number {
  return (
    elements.reduce((max, element) => Math.max(max, element.zIndex), -1) + 1
  );
}

/** Appends a new element to a slide, materializing legacy content first. */
export function addElement(
  deck: Deck,
  index: number,
  element: DistributiveOmit<SlideElement, "id" | "zIndex"> & {
    id?: string;
    zIndex?: number;
  },
): Deck {
  return mapSlide(deck, index, (slide) => {
    const existing =
      slide.elements && slide.elements.length > 0
        ? slide.elements
        : materializeSlideElements(slide);
    const next: SlideElement = {
      ...element,
      id: element.id ?? makeElementId(),
      zIndex: element.zIndex ?? nextZIndex(existing),
    } as SlideElement;
    return { ...slide, elements: [...existing, next] };
  });
}

/** Patches a single element on a slide by id (cannot change `id`/`kind`). */
export function updateElement(
  deck: Deck,
  index: number,
  elementId: string,
  patch: ElementPatch,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    return {
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === elementId
          ? ({
              ...element,
              ...patch,
              id: element.id,
              kind: element.kind,
            } as SlideElement)
          : element,
      ),
    };
  });
}

/** Removes an element from a slide by id. */
export function removeElement(
  deck: Deck,
  index: number,
  elementId: string,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    return {
      ...slide,
      elements: slide.elements.filter((element) => element.id !== elementId),
    };
  });
}

/** Raises an element above all others on its slide. */
export function bringElementToFront(
  deck: Deck,
  index: number,
  elementId: string,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    const top = nextZIndex(slide.elements);
    return {
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === elementId ? { ...element, zIndex: top } : element,
      ),
    };
  });
}

/** Lowers an element beneath all others on its slide. */
export function sendElementToBack(
  deck: Deck,
  index: number,
  elementId: string,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    const bottom =
      slide.elements.reduce(
        (min, element) => Math.min(min, element.zIndex),
        Number.POSITIVE_INFINITY,
      ) - 1;
    return {
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === elementId ? { ...element, zIndex: bottom } : element,
      ),
    };
  });
}

/** Sets (or clears, with `undefined`) a slide's background color override. */
export function setSlideBackground(
  deck: Deck,
  index: number,
  background: string | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (background === undefined) {
      delete next.background;
    } else {
      next.background = background;
    }
    return next;
  });
}

/** Sets (or clears, with `undefined`) a slide's accent color override. */
export function setSlideAccent(
  deck: Deck,
  index: number,
  accent: string | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (accent === undefined) {
      delete next.accent;
    } else {
      next.accent = accent;
    }
    return next;
  });
}
