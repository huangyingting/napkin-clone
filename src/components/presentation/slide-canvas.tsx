"use client";

/**
 * Shared slide rendering primitives used by both the in-app {@link PresentMode}
 * and the public {@link PublicPresentViewer}.
 *
 * Exported from this module so that the two presentation surfaces can stay in
 * sync without duplicating layout code.
 */

import { memo, type JSX } from "react";

import type { Deck, Slide } from "@/lib/presentation/deck";
import {
  resolveSlideThemeColors,
  resolveSlideTokenSet,
} from "@/lib/presentation/style-cascade";
import type { Visual } from "@/lib/visual/schema";

import { ElementsSlideLayout } from "./slide-canvas/elements-slide-layout";

// ---------------------------------------------------------------------------
// SlideCanvas — selects the right layout renderer for a slide
// ---------------------------------------------------------------------------

export interface SlideCanvasProps {
  slide: Slide;
  /**
    * Deck context for cascade resolution (themeId, custom token set, masters)
    * for background, accent colours, and non-text template defaults.
   */
    deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  /** True when rendered at reduced size (e.g. presenter next-slide preview). */
  preview?: boolean;
  /**
   * Element ids to skip rendering. Used by the editor to hide an element while
   * it is being inline-edited (the editable overlay renders it instead). Never
   * set by Present / public surfaces.
   */
  hiddenElementIds?: ReadonlySet<string>;
  /**
   * True only on the interactive editing stage. Lets empty-source image
   * elements render an "Add image" dropzone affordance; Present / public /
   * preview surfaces leave this off so an unfilled image is a neutral box
   * rather than an editing prompt or a broken `<img>` (#226).
   */
  editable?: boolean;
}

/**
 * Renders a single slide from its positioned elements.
 *
 * Shared between the in-app {@link PresentMode} and the public
 * {@link PublicPresentViewer} so both surfaces stay in sync.
 *
 * Wrapped with `React.memo` so the thumbnail rail skips re-rendering canvases
 * whose props (slide identity, visuals map) did not change — a drag that only
 * mutates the active slide will not re-render every thumbnail.
 */
export const SlideCanvas = memo(function SlideCanvas({
  slide,
  deck,
  visuals,
  preview: _preview = false,
  hiddenElementIds,
  editable = false,
}: SlideCanvasProps): JSX.Element {
  // Resolve colours from the deck token cascade on every surface (#609).
  const tc = resolveSlideThemeColors(deck, slide);
  // Token set drives optional non-text template defaults (#607): bullet marker,
  // image fit/radius/mask/shadow, connector stroke/arrows, shape stroke, visual
  // restyle. Built-in themes set none of these, so absent → existing defaults.
  const tokenSet = resolveSlideTokenSet(deck, slide);

  return (
    <ElementsSlideLayout
      slide={slide}
      tc={tc}
      tokenSet={tokenSet}
      visuals={visuals}
      hiddenElementIds={hiddenElementIds}
      editable={editable}
    />
  );
});
