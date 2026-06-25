import type { Deck, DeckTheme } from "./deck";
import type { SlideFormat } from "./slide-format";

/**
 * Changes the deck theme id.
 *
 * The style cascade resolves deck tokens exclusively through the deck-level
 * theme resolver. Applying a built-in theme also clears a custom token set so
 * the built-in token set is visible immediately.
 */
export function setDeckTheme(deck: Deck, themeId: DeckTheme): Deck {
  const next: Deck = {
    ...deck,
    themeId,
  };
  delete next.customTokenSet;
  return next;
}

/** Changes the deck-wide slide format. */
export function setDeckSlideFormat(deck: Deck, slideFormat: SlideFormat): Deck {
  return deck.slideFormat === slideFormat ? deck : { ...deck, slideFormat };
}
