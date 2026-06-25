import type { JSX } from "react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import type { VisualElement } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import { applyTheme } from "@/lib/visual/transforms";

import { boxStyle } from "./primitives";

export function VisualElementView({
  element,
  visuals,
  defaultStyleThemeId,
}: {
  element: VisualElement;
  visuals: ReadonlyMap<string, Visual>;
  /** Deck-template default restyle theme applied when the element sets none (#607). */
  defaultStyleThemeId?: string;
}): JSX.Element | null {
  const visual = visuals.get(element.visualId);
  if (!visual) {
    return null;
  }
  // Apply the optional per-element restyle here, in the one shared renderer, so
  // editor / present / public viewer all draw the visual identically. Falls back
  // to the deck-template default styleThemeId when the element sets none (#607).
  const styleThemeId = element.styleThemeId ?? defaultStyleThemeId;
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
        title={element.alt}
        className="h-full w-full object-contain"
        transparentBackground
      />
    </div>
  );
}
