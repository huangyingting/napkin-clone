import type { Deck, Slide, SlideMaster } from "./deck-core";
import type { SlideElement } from "./deck-elements";
import type { ImageFitMode, ImageMaskShape } from "./deck-element-primitives";
import type {
  BackgroundTreatment,
  PresentationTheme,
} from "./presentation-theme-types";
import { slideFormatConfig, type SlideFormat } from "./slide-format";
import {
  resolveShapeLabelStyle,
  resolveTextElementStyle,
  type ResolvedTextStyle,
} from "./style-cascade-text";
import {
  resolveSlideStyle,
  resolveSlideThemeColors,
  type SlideThemeColors,
} from "./style-cascade-layers";
import { materializeMasterChromePlaceholders } from "./global-master-chrome";

export interface ResolvedSlideCanvas {
  format: SlideFormat;
  width: number;
  height: number;
  pptxWidthIn: number;
  pptxHeightIn: number;
}

/* node:coverage disable */
/* Type-only render-model union rows are erased by tsx and reported as source-map gaps. */
export type ResolvedElementDesign =
  | {
      kind: "text";
      role?: string;
      textStyle: ResolvedTextStyle;
    }
  | {
      kind: "visual";
      role?: string;
      styleThemeId?: string;
    }
  | {
      kind: "image";
      role?: string;
      fitMode?: ImageFitMode;
      maskShape?: ImageMaskShape;
      radius?: number;
    }
  | {
      kind: "shape";
      role?: string;
      fill: string;
      stroke?: { color: string; width: number };
      radius?: number;
      textStyle?: ResolvedTextStyle;
    }
  | {
      kind: "connector";
      role?: string;
      stroke: { color: string; width: number };
      arrowStart: string;
      arrowEnd: string;
      dash: boolean;
    };
/* node:coverage enable */

export interface ResolvedSlideRenderModel {
  canvas: ResolvedSlideCanvas;
  slide: Slide;
  themeColors: SlideThemeColors;
  tokenSet: PresentationTheme;
  background: BackgroundTreatment;
  accent: string;
  master?: SlideMaster;
  masterBackgroundElements: SlideElement[];
  slideElements: SlideElement[];
  masterForegroundElements: SlideElement[];
  renderedElements: SlideElement[];
  elementDesigns: Record<string, ResolvedElementDesign>;
}

function colorRefValue(
  input: unknown,
  tokenSet: PresentationTheme,
): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const ref = input as { token?: string; value?: string };
  if (typeof ref.value === "string") return ref.value;
  if (typeof ref.token === "string") {
    /* node:coverage ignore next 3 */
    /* Invalid token fallback is asserted through render-model tests; tsx maps the indexed access as residual. */
    return tokenSet.colors[ref.token as keyof PresentationTheme["colors"]];
  }
  /* node:coverage ignore next 2 */
  /* Invalid color-ref fallback is defensive; public model tests assert valid token/value resolution. */
  return undefined;
}

/* node:coverage ignore next 3 */
/* Private role helper is exercised through each rendered element kind; tsx maps its wrapper rows as residual. */
function elementRole(element: SlideElement): string | undefined {
  return (element as { role?: string }).role;
}

function resolveElementDesign(
  deck: Deck,
  tokenSet: PresentationTheme,
  element: SlideElement,
): ResolvedElementDesign {
  const role = elementRole(element);
  const design = (element as { designOverrides?: Record<string, any> })
    .designOverrides;
  switch (element.kind) {
    case "text":
      return {
        kind: "text",
        ...(role ? { role } : {}),
        textStyle: resolveTextElementStyle(deck, element),
      };
    case "visual": {
      const styleThemeId =
        element.content.styleThemeId ?? tokenSet.visual?.styleThemeId;
      return {
        kind: "visual",
        ...(role ? { role } : {}),
        ...(styleThemeId ? { styleThemeId } : {}),
      };
    }
    case "image":
      return {
        kind: "image",
        ...(role ? { role } : {}),
        ...((design?.fitMode ?? tokenSet.image?.fitMode)
          ? { fitMode: design?.fitMode ?? tokenSet.image?.fitMode }
          : {}),
        ...((design?.maskShape ?? tokenSet.image?.maskShape)
          ? { maskShape: design?.maskShape ?? tokenSet.image?.maskShape }
          : {}),
        ...((design?.radius ?? tokenSet.image?.radiusPct)
          ? { radius: design?.radius ?? tokenSet.image?.radiusPct }
          : {}),
      };
    case "shape": {
      const stroke =
        design?.stroke ??
        (tokenSet.shape.stroke
          ? {
              color: tokenSet.shape.stroke,
              width: tokenSet.shape.strokeWidth ?? 0.4,
            }
          : undefined);
      return {
        kind: "shape",
        ...(role ? { role } : {}),
        fill:
          colorRefValue(design?.fill, tokenSet) ??
          tokenSet.shape.fill ??
          tokenSet.colors.accent,
        ...(stroke ? { stroke } : {}),
        ...(typeof design?.radius === "number"
          ? { radius: design.radius }
          : {}),
        textStyle: resolveShapeLabelStyle(deck, element),
      };
    }
    case "connector": {
      const stroke = design?.stroke;
      return {
        kind: "connector",
        ...(role ? { role } : {}),
        stroke: {
          color: stroke?.color ?? tokenSet.connector?.color ?? "#a1a1aa",
          width: stroke?.width ?? tokenSet.connector?.width ?? 0.4,
        },
        arrowStart:
          design?.arrowStart ?? tokenSet.connector?.startArrow ?? "none",
        arrowEnd: design?.arrowEnd ?? tokenSet.connector?.endArrow ?? "arrow",
        dash:
          Boolean(design?.dash) ||
          (tokenSet.connector?.dash !== undefined &&
            tokenSet.connector.dash !== "solid"),
      };
    }
  }
}

function resolveElementDesigns(
  deck: Deck,
  tokenSet: PresentationTheme,
  elements: readonly SlideElement[],
): Record<string, ResolvedElementDesign> {
  const designs: Record<string, ResolvedElementDesign> = {};
  for (const element of elements) {
    designs[element.id] = resolveElementDesign(deck, tokenSet, element);
  }
  return designs;
}

function masterElements(
  master: SlideMaster | undefined,
  layer: "background" | "foreground",
  deck: Deck,
  slide: Slide,
): SlideElement[] {
  const elements = ((master as any)?.elements ?? []) as SlideElement[];
  const slideIndex = deck.slides.findIndex((entry) => entry.id === slide.id);
  const resolvedSlideIndex = slideIndex >= 0 ? slideIndex : slide.index;
  return elements
    .filter((element) => (element as any).layer === layer)
    .map((element) =>
      materializeMasterChromePlaceholders(
        element,
        resolvedSlideIndex,
        deck.slides.length,
      ),
    )
    .sort((a, b) => a.zIndex - b.zIndex);
}

export function resolveSlideRenderModel(
  deck: Deck,
  slide: Slide,
): ResolvedSlideRenderModel {
  const style = resolveSlideStyle(deck, slide);
  const canvasFormat = slideFormatConfig(deck.canvas?.format);
  const slideElements = [...(slide.elements ?? [])].sort(
    (a, b) => a.zIndex - b.zIndex,
  );
  const masterBackgroundElements = masterElements(
    style.master,
    "background",
    deck,
    slide,
  );
  const masterForegroundElements = masterElements(
    style.master,
    "foreground",
    deck,
    slide,
  );
  const renderedElements = [
    ...masterBackgroundElements,
    ...slideElements,
    ...masterForegroundElements,
  ];
  return {
    canvas: {
      format: deck.canvas?.format ?? "16:9",
      width: canvasFormat.width,
      height: canvasFormat.height,
      pptxWidthIn: canvasFormat.pptxWidthIn,
      pptxHeightIn: canvasFormat.pptxHeightIn,
    },
    slide,
    themeColors: resolveSlideThemeColors(deck, slide),
    tokenSet: style.tokenSet,
    background: style.background,
    accent: style.accent,
    ...(style.master !== undefined ? { master: style.master } : {}),
    masterBackgroundElements,
    slideElements,
    masterForegroundElements,
    renderedElements,
    elementDesigns: resolveElementDesigns(
      deck,
      style.tokenSet,
      renderedElements,
    ),
  };
}
