"use client";

import { Sparkles } from "lucide-react";

import { PanelSection, PropRow } from "./primitives";
import type { SlideInspectorProps } from "./types";
import type { SlideElement } from "@/lib/presentation/deck";

export function EffectsPanel({
  element,
  onUpdateElement,
}: {
  element: SlideElement | null;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  if (!element) {
    return (
      <PanelSection>
        <p className="text-xs text-ds-text-muted">
          Select an element to edit effects.
        </p>
      </PanelSection>
    );
  }
  return (
    <PanelSection
      title="Effects"
      icon={<Sparkles size={12} aria-hidden="true" />}
    >
      <ElementOpacityControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
      <ElementEffectsControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
    </PanelSection>
  );
}

/**
 * Shared drop-shadow toggle for any selected element. Lock is not a visual
 * effect; it lives in the Layers panel.
 */
function ElementEffectsControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  return (
    <PropRow label="Shadow">
      <input
        type="checkbox"
        checked={Boolean(element.shadow)}
        onChange={(event) =>
          onUpdateElement(element.id, {
            shadow: event.target.checked ? true : undefined,
          })
        }
        className="h-4 w-4 accent-ds-accent"
        aria-label="Drop shadow"
      />
    </PropRow>
  );
}

/**
 * Shared opacity slider shown for any selected element. Stores `opacity` on the
 * element (cleared to `undefined` at 100% so fully-opaque elements stay clean).
 */
function ElementOpacityControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const value = element.opacity ?? 1;
  const pct = Math.round(value * 100);
  return (
    <PropRow label="Opacity">
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(event) => {
          const next = Number(event.target.value) / 100;
          onUpdateElement(element.id, {
            opacity: next >= 1 ? undefined : next,
          });
        }}
        className="min-w-0 flex-1 accent-ds-accent"
        aria-label="Element opacity"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ds-text-muted">
        {pct}%
      </span>
    </PropRow>
  );
}
