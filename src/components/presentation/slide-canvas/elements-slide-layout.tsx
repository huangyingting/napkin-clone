import type { JSX } from "react";
import type * as React from "react";

import type { Slide, SlideElement } from "@/lib/presentation/deck";
import type { DeckThemeTokenSet } from "@/lib/presentation/deck-theme-tokens";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";
import type { Visual } from "@/lib/visual/schema";
import { assertNever } from "@/lib/assert-never";

import { ConnectorElementView } from "./connector-elements";
import { ImageElementView } from "./media-elements";
import { ShapeElementView } from "./shape-elements";
import { TextElementView } from "./text-elements";
import { VisualElementView } from "./visual-elements";
import { colorRefValue, slideDesignOverrides } from "./v6-model";

function SlideElementView({
  element,
  elements,
  tc,
  accent,
  tokenSet,
  visuals,
  editable,
}: {
  element: SlideElement;
  elements: readonly SlideElement[];
  tc: SlideThemeColors;
  accent: string;
  tokenSet: DeckThemeTokenSet;
  visuals: ReadonlyMap<string, Visual>;
  editable?: boolean;
}): JSX.Element | null {
  switch (element.kind) {
    case "text":
      return (
        <TextElementView
          element={element}
          tc={tc}
          accent={tokenSet.bullet?.markerColor ?? accent}
          tokenSet={tokenSet}
        />
      );
    case "visual":
      return (
        <VisualElementView
          element={element}
          visuals={visuals}
          defaultStyleThemeId={tokenSet.visual?.styleThemeId}
        />
      );
    case "image":
      return (
        <ImageElementView
          element={element}
          editable={editable}
          defaults={tokenSet.image}
        />
      );
    case "shape":
      return (
        <ShapeElementView
          element={element}
          elements={elements}
          tokenSet={tokenSet}
          defaults={tokenSet.shape}
        />
      );
    case "connector":
      return (
        <ConnectorElementView
          element={element}
          elements={elements}
          defaults={tokenSet.connector}
        />
      );
    default:
      return assertNever(element);
  }
}

export function ElementsSlideLayout({
  slide,
  tc,
  tokenSet,
  visuals,
  hiddenElementIds,
  editable,
}: {
  slide: Slide;
  tc: SlideThemeColors;
  tokenSet: DeckThemeTokenSet;
  visuals: ReadonlyMap<string, Visual>;
  hiddenElementIds?: ReadonlySet<string>;
  editable?: boolean;
}): JSX.Element {
  const slideDesign = slideDesignOverrides(slide);
  const backgroundDesign =
    slideDesign.background && typeof slideDesign.background === "object"
      ? (slideDesign.background as Record<string, unknown>)
      : undefined;
  const background =
    backgroundDesign?.type === "solid"
      ? (colorRefValue(backgroundDesign.color, tokenSet) ?? tc.bgColor)
      : tc.bgColor;
  const accent = colorRefValue(slideDesign.accent, tokenSet) ?? tc.accentColor;
  // Background precedence: image > gradient > solid color.
  const backgroundStyle: React.CSSProperties =
    backgroundDesign?.type === "image" &&
    typeof backgroundDesign.url === "string"
      ? {
          backgroundColor: background,
          backgroundImage: `url(${backgroundDesign.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : backgroundDesign?.type === "gradient"
        ? {
            backgroundImage: `linear-gradient(${
              typeof backgroundDesign.angle === "number"
                ? backgroundDesign.angle
                : 135
            }deg, ${
              colorRefValue(backgroundDesign.from, tokenSet) ?? tc.bgColor
            }, ${colorRefValue(backgroundDesign.to, tokenSet) ?? tc.bgColor})`,
          }
        : { backgroundColor: background };
  const ordered = [...(slide.elements ?? [])]
    .filter((element) => !element.hidden && !hiddenElementIds?.has(element.id))
    .sort((a, b) => a.zIndex - b.zIndex);
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        ...backgroundStyle,
        containerType: "size",
      }}
    >
      {ordered.map((element) => (
        <SlideElementView
          key={element.id}
          element={element}
          elements={ordered}
          tc={tc}
          accent={accent}
          tokenSet={tokenSet}
          visuals={visuals}
          editable={editable}
        />
      ))}
    </div>
  );
}
