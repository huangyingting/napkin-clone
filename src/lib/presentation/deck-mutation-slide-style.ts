import type { Deck } from "./deck-core";
import { mapSlide } from "./deck-mutation-shared";

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

/**
 * Sets (or clears) a slide's background gradient. Setting it clears any
 * background image so the precedence (image > gradient > solid) stays clean.
 */
export function setSlideBackgroundGradient(
  deck: Deck,
  index: number,
  gradient: { from: string; to: string; angle?: number } | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (gradient === undefined) {
      delete next.backgroundGradient;
    } else {
      next.backgroundGradient = gradient;
      delete next.backgroundImage;
    }
    return next;
  });
}

/**
 * Sets (or clears) a slide's background image. Setting it clears any background
 * gradient so the precedence stays clean.
 */
export function setSlideBackgroundImage(
  deck: Deck,
  index: number,
  image: string | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (image === undefined) {
      delete next.backgroundImage;
    } else {
      next.backgroundImage = image;
      delete next.backgroundGradient;
    }
    return next;
  });
}

/**
 * Sets a slide's background to a server-stored asset, persisting both the
 * resolved URL (as `backgroundImage`) and the asset id (as `backgroundAssetId`)
 * so renderers can use the resolver.
 * Clears any background gradient.  Passing `undefined` for both clears the
 * background asset and image.
 */
export function setSlideBackgroundAsset(
  deck: Deck,
  index: number,
  opts: { url: string; assetId: string } | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (opts === undefined) {
      delete next.backgroundImage;
      delete next.backgroundAssetId;
    } else {
      next.backgroundImage = opts.url;
      next.backgroundAssetId = opts.assetId;
      delete next.backgroundGradient;
    }
    return next;
  });
}
