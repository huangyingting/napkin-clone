import type { JSX } from "react";
import type * as React from "react";

import type { Slide, SlideElement } from "@/lib/presentation/deck";
import type { DeckThemeTokenSet } from "@/lib/presentation/deck-theme-tokens";
import type { Visual } from "@/lib/visual/schema";

import { ConnectorElementView } from "./connector-elements";
import { ImageElementView } from "./media-elements";
import { PlaceholderElementView } from "./placeholder-elements";
import type { ThemeConfig } from "./primitives";
import { ShapeElementView } from "./shape-elements";
import { BulletsElementView, TextElementView } from "./text-elements";
import { VisualElementView } from "./visual-elements";

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
  tc: ThemeConfig;
  accent: string;
  tokenSet: DeckThemeTokenSet;
  visuals: ReadonlyMap<string, Visual>;
  editable?: boolean;
}): JSX.Element | null {
  switch (element.kind) {
    case "placeholder":
      return (
        <PlaceholderElementView
          element={element}
          tc={tc}
          accent={accent}
          editable={editable}
        />
      );
    case "text":
      return <TextElementView element={element} tc={tc} tokenSet={tokenSet} />;
    case "bullets":
      return (
        <BulletsElementView
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
      return null;
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
  tc: ThemeConfig;
  tokenSet: DeckThemeTokenSet;
  visuals: ReadonlyMap<string, Visual>;
  hiddenElementIds?: ReadonlySet<string>;
  editable?: boolean;
}): JSX.Element {
  const background = slide.background ?? tc.bgColor;
  const accent = slide.accent ?? tc.accentColor;
  // Background precedence: image > gradient > solid color.
  const backgroundStyle: React.CSSProperties = slide.backgroundImage
    ? {
        backgroundColor: background,
        backgroundImage: `url(${slide.backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : slide.backgroundGradient
      ? {
          backgroundImage: `linear-gradient(${
            slide.backgroundGradient.angle ?? 135
          }deg, ${slide.backgroundGradient.from}, ${slide.backgroundGradient.to})`,
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
