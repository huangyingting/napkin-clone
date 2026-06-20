/**
 * Pure, immutable mutation helpers for an edited {@link Deck}.
 *
 * Every function returns a brand-new `Deck` (and new `Slide` objects) — the
 * input is never mutated. After any reorder/add/remove the slides are
 * re-indexed so `slide.index === array position`. No DOM, no React — fully
 * testable under `node --test`.
 */

import type { Deck, DeckTheme, Slide } from "./deck";

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
