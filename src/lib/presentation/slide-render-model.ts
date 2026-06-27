import type { Deck, Slide } from "./deck-core";
import type { SlideElement } from "./deck-elements";
import type {
  BackgroundTreatment,
  PresentationTheme,
  MasterSlide,
} from "./presentation-theme-types";
import {
  resolveSlideStyle,
  resolveSlideThemeColors,
  type SlideThemeColors,
} from "./style-cascade-layers";

export interface ResolvedSlideRenderModel {
  slide: Slide;
  themeColors: SlideThemeColors;
  tokenSet: PresentationTheme;
  background: BackgroundTreatment;
  accent: string;
  master?: MasterSlide;
  masterBackgroundElements: SlideElement[];
  slideElements: SlideElement[];
  masterForegroundElements: SlideElement[];
}

function masterElements(
  master: MasterSlide | undefined,
  layer: "background" | "foreground",
): SlideElement[] {
  const elements = ((master as any)?.elements ?? []) as SlideElement[];
  return elements
    .filter((element) => (element as any).layer === layer)
    .sort((a, b) => a.zIndex - b.zIndex);
}

export function resolveSlideRenderModel(
  deck: Deck,
  slide: Slide,
): ResolvedSlideRenderModel {
  const style = resolveSlideStyle(deck, slide);
  const slideElements = [...(slide.elements ?? [])].sort(
    (a, b) => a.zIndex - b.zIndex,
  );
  return {
    slide,
    themeColors: resolveSlideThemeColors(deck, slide),
    tokenSet: style.tokenSet,
    background: style.background,
    accent: style.accent,
    ...(style.master !== undefined ? { master: style.master } : {}),
    masterBackgroundElements: masterElements(style.master, "background"),
    slideElements,
    masterForegroundElements: masterElements(style.master, "foreground"),
  };
}
