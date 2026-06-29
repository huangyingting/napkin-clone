import type { JSX } from "react";
import type * as React from "react";

import type { SlideElement } from "@/lib/presentation/deck";
import type {
  ResolvedSlideCanvas,
  ResolvedElementDesign,
  ResolvedSlideRenderModel,
} from "@/lib/presentation/slide-render-model";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";
import type { Visual } from "@/lib/visual/schema";
import { assertNever } from "@/lib/assert-never";

import { ConnectorElementView } from "./connector-elements";
import { ImageElementView } from "./media-elements";
import { ShapeElementView } from "./shape-elements";
import { TableElementView } from "./table-elements";
import { TextElementView } from "./text-elements";
import { VisualElementView } from "./visual-elements";

function radialBackgroundImage(
  background: Extract<
    ResolvedSlideRenderModel["background"],
    { type: "radialGradient" }
  >,
): string {
  const radius = background.r ?? 70;
  const stops = `${background.inner}, ${background.outer}`;
  return `radial-gradient(${radius}% ${radius}% at ${background.cx ?? 50}% ${background.cy ?? 50}%, ${stops})`;
}

function SlideElementView({
  element,
  elements,
  tc,
  accent,
  design,
  canvas,
  visuals,
  editable,
}: {
  element: SlideElement;
  elements: readonly SlideElement[];
  tc: SlideThemeColors;
  accent: string;
  design: ResolvedElementDesign | undefined;
  canvas: ResolvedSlideCanvas;
  visuals: ReadonlyMap<string, Visual>;
  editable?: boolean;
}): JSX.Element | null {
  switch (element.kind) {
    case "text":
      return (
        <TextElementView
          element={element}
          tc={tc}
          accent={accent}
          resolvedDesign={design?.kind === "text" ? design : undefined}
        />
      );
    case "visual":
      return (
        <VisualElementView
          element={element}
          visuals={visuals}
          resolvedDesign={design?.kind === "visual" ? design : undefined}
        />
      );
    case "image":
      return (
        <ImageElementView
          element={element}
          editable={editable}
          resolvedDesign={design?.kind === "image" ? design : undefined}
        />
      );
    case "shape":
      return (
        <ShapeElementView
          element={element}
          elements={elements}
          canvas={canvas}
          resolvedDesign={design?.kind === "shape" ? design : undefined}
        />
      );
    case "connector":
      return (
        <ConnectorElementView
          element={element}
          elements={elements}
          resolvedDesign={design?.kind === "connector" ? design : undefined}
        />
      );
    case "table":
      return (
        <TableElementView
          element={element}
          resolvedDesign={design?.kind === "table" ? design : undefined}
        />
      );
    default:
      return assertNever(element);
  }
}

export function ElementsSlideLayout({
  renderModel,
  visuals,
  hiddenElementIds,
  editable,
}: {
  renderModel: ResolvedSlideRenderModel;
  visuals: ReadonlyMap<string, Visual>;
  hiddenElementIds?: ReadonlySet<string>;
  editable?: boolean;
}): JSX.Element {
  const {
    background,
    masterBackgroundElements,
    masterForegroundElements,
    canvas,
    themeColors: tc,
    slideElements,
    elementDesigns,
  } = renderModel;
  const accent = renderModel.accent;
  const backgroundStyle: React.CSSProperties =
    background.type === "image"
      ? {
          backgroundColor: tc.bgColor,
          backgroundImage: `url(${background.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : background.type === "gradient"
        ? {
            backgroundImage: `linear-gradient(${background.angle ?? 135}deg, ${background.from}, ${background.to})`,
          }
        : background.type === "radialGradient"
          ? {
              backgroundImage: radialBackgroundImage(background),
            }
          : { backgroundColor: background.color };
  const ordered = slideElements
    .filter((element) => !element.hidden && !hiddenElementIds?.has(element.id))
    .sort((a, b) => a.zIndex - b.zIndex);
  const backgroundElements = masterBackgroundElements.filter(
    (element) => !element.hidden,
  );
  const foregroundElements = masterForegroundElements.filter(
    (element) => !element.hidden,
  );
  const allRenderedElements = [
    ...backgroundElements,
    ...ordered,
    ...foregroundElements,
  ];
  const renderElement = (element: SlideElement, layer: string) => (
    <SlideElementView
      key={`${layer}:${element.id}`}
      element={element}
      elements={allRenderedElements}
      tc={tc}
      accent={accent}
      design={elementDesigns[element.id]}
      canvas={canvas}
      visuals={visuals}
      editable={editable}
    />
  );
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
      {backgroundElements.map((element) => renderElement(element, "master-bg"))}
      {ordered.map((element) => renderElement(element, "slide"))}
      {foregroundElements.map((element) => renderElement(element, "master-fg"))}
    </div>
  );
}
