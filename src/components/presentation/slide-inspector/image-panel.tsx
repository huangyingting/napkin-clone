"use client";

import { useState } from "react";

import { ImageAdjustControls, ImageContentControls } from "./controls";
import { PanelSection } from "./primitives";
import type { SlideInspectorProps } from "./types";
import { Tabs } from "@/components/ui";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import type { Deck, ImageElement } from "@/lib/presentation/deck";

type ImageInspectorTab = "image" | "adjust";

export function ImagePanel({
  element,
  deck,
  showAdvanced,
  onUpdateElement,
  documentId,
  slideAssetPort,
}: {
  element: ImageElement;
  deck: Deck;
  showAdvanced: boolean;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
  documentId?: string;
  slideAssetPort?: SlideAssetActionPort;
}) {
  const [activeTab, setActiveTab] = useState<ImageInspectorTab>("image");

  return (
    <PanelSection className="gap-1">
      <Tabs
        aria-label="Image settings"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: "image", label: "Image" },
          { value: "adjust", label: "Adjust" },
        ]}
      />

      {activeTab === "image" ? (
        <div className="flex flex-col gap-2 rounded-ds-md bg-ds-surface-raised/60 p-2 ring-1 ring-ds-border-subtle">
          <ImageContentControls
            element={element}
            deck={deck}
            onUpdateElement={onUpdateElement}
            documentId={documentId}
            slideAssetPort={slideAssetPort}
          />
        </div>
      ) : null}

      {activeTab === "adjust" ? (
        <div className="flex flex-col gap-2 rounded-ds-md bg-ds-surface-raised/60 p-2 ring-1 ring-ds-border-subtle">
          <ImageAdjustControls
            element={element}
            showAdvanced={showAdvanced}
            onUpdateElement={onUpdateElement}
          />
        </div>
      ) : null}
    </PanelSection>
  );
}
