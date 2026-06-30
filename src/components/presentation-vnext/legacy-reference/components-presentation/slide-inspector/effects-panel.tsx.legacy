"use client";

import { Sparkles } from "lucide-react";

import { ColorPicker } from "@/components/ui";
import { PanelSection, PropRow } from "./primitives";
import type { SlideInspectorProps } from "./types";
import type { ElementShadow, SlideElement } from "@/lib/presentation/deck";

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
  const shadowObject =
    element.shadow && element.shadow !== true
      ? (element.shadow as ElementShadow)
      : undefined;
  const defaultShadow: ElementShadow = {
    x: 0,
    y: 0.6,
    blur: 1.2,
    color: "#000000",
    opacity: 0.28,
  };
  const setShadow = (shadow: ElementShadow) =>
    onUpdateElement(element.id, { shadow });
  return (
    <>
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
        {element.shadow ? (
          <button
            type="button"
            onClick={() => setShadow(shadowObject ?? defaultShadow)}
            className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover"
          >
            Custom
          </button>
        ) : null}
      </PropRow>
      {shadowObject ? (
        <>
          <PropRow label="Shadow color">
            <ColorPicker
              color={shadowObject.color}
              fallback="#000000"
              aria-label="Shadow color"
              onChange={(hex) => setShadow({ ...shadowObject, color: hex })}
            />
          </PropRow>
          <PropRow label="Shadow blur">
            <input
              type="range"
              min={0}
              max={8}
              step={0.1}
              value={shadowObject.blur}
              onChange={(event) =>
                setShadow({ ...shadowObject, blur: Number(event.target.value) })
              }
              className="min-w-0 flex-1 accent-ds-accent"
              aria-label="Shadow blur"
            />
          </PropRow>
          <PropRow label="Offset">
            <input
              type="number"
              value={shadowObject.x}
              onChange={(event) =>
                setShadow({ ...shadowObject, x: Number(event.target.value) })
              }
              className="w-16 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-right text-xs text-ds-text-primary outline-none"
              aria-label="Shadow x offset"
            />
            <input
              type="number"
              value={shadowObject.y}
              onChange={(event) =>
                setShadow({ ...shadowObject, y: Number(event.target.value) })
              }
              className="w-16 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-right text-xs text-ds-text-primary outline-none"
              aria-label="Shadow y offset"
            />
          </PropRow>
          <PropRow label="Shadow alpha">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((shadowObject.opacity ?? 1) * 100)}
              onChange={(event) =>
                setShadow({
                  ...shadowObject,
                  opacity: Number(event.target.value) / 100,
                })
              }
              className="min-w-0 flex-1 accent-ds-accent"
              aria-label="Shadow opacity"
            />
          </PropRow>
        </>
      ) : null}
    </>
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
