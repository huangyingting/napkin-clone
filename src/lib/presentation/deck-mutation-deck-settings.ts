import type { Deck, DeckTheme } from "./deck";
import type { SlideFormat } from "./slide-format";

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

/** Changes the deck-wide slide format. */
export function setDeckSlideFormat(deck: Deck, slideFormat: SlideFormat): Deck {
  return deck.slideFormat === slideFormat ? deck : { ...deck, slideFormat };
}
