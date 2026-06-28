"use client";

import { ConnectorElementEditor, ImageContentControls } from "./controls";
import { ShapeAppearancePanel } from "./shape-panel";
import type { SlideInspectorProps } from "./types";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import { assertNever } from "@/lib/assert-never";
import type { Deck, SlideElement } from "@/lib/presentation/deck";

export function ElementEditor({
  element,
  deck,
  showAdvanced,
  elements,
  onUpdateElement,
  documentId,
  slideAssetPort,
}: {
  element: SlideElement;
  deck: Deck;
  showAdvanced: boolean;
  elements: readonly SlideElement[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
  documentId?: string;
  slideAssetPort?: SlideAssetActionPort;
}) {
  switch (element.kind) {
    case "text":
      return null;
    case "image":
      return (
        <ImageContentControls
          element={element}
          deck={deck}
          onUpdateElement={onUpdateElement}
          documentId={documentId}
          slideAssetPort={slideAssetPort}
        />
      );
    case "shape":
      return (
        <ShapeAppearancePanel
          element={element}
          showAdvanced={showAdvanced}
          onUpdateElement={onUpdateElement}
        />
      );
    case "visual":
      return null;
    case "connector":
      return (
        <ConnectorElementEditor
          element={element}
          elements={elements}
          onUpdateElement={onUpdateElement}
        />
      );
    default:
      return assertNever(element);
  }
}
