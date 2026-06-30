import type { JSX } from "react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import type { VisualElement } from "@/lib/presentation/deck";
import type { ResolvedElementDesign } from "@/lib/presentation/slide-render-model";
import type { Visual } from "@/lib/visual/schema";
import { applyTheme } from "@/lib/visual/transforms";

import { boxStyle } from "./primitives";
import { visualContent } from "./v6-model";

type ResolvedVisualDesign = Extract<ResolvedElementDesign, { kind: "visual" }>;

export function VisualElementView({
  element,
  visuals,
  resolvedDesign,
}: {
  element: VisualElement;
  visuals: ReadonlyMap<string, Visual>;
  resolvedDesign?: ResolvedVisualDesign;
}): JSX.Element | null {
  const content = visualContent(element);
  const visual = visuals.get(content.visualId);
  if (!visual) {
    return null;
  }
  const styleThemeId = resolvedDesign?.styleThemeId;
  const styled = styleThemeId ? applyTheme(visual, styleThemeId) : visual;
  return (
    <div
      style={{
        ...boxStyle(element),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <VisualRenderer
        visual={styled}
        title={content.alt}
        className="h-full w-full object-contain"
        transparentBackground
      />
    </div>
  );
}
