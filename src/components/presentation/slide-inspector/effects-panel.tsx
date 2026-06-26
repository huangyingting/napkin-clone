"use client";

import type { SlideInspectorProps } from "./types";
import { LABEL_CLASS } from "./primitives";
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
      <p className="text-xs text-ds-text-muted">
        Select an element to edit effects.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ElementOpacityControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
      <ElementEffectsControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
    </div>
  );
}

/**
 * Shared effects (drop shadow) and lock toggles for any selected element.
 */
export function ElementEffectsControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  return (
    <div className="mt-3 flex items-center gap-4">
      <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
        <input
          type="checkbox"
          checked={element.shadow ?? false}
          onChange={(event) =>
            onUpdateElement(element.id, {
              shadow: event.target.checked ? true : undefined,
            })
          }
          className="accent-ds-accent"
        />
        Shadow
      </label>
      <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
        <input
          type="checkbox"
          checked={element.locked ?? false}
          onChange={(event) =>
            onUpdateElement(element.id, {
              locked: event.target.checked ? true : undefined,
            })
          }
          className="accent-ds-accent"
        />
        Lock
      </label>
    </div>
  );
}

/**
 * Shared opacity slider shown for any selected element. Stores `opacity` on the
 * element (cleared to `undefined` at 100% so fully-opaque elements stay clean).
 */
export function ElementOpacityControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const value = element.opacity ?? 1;
  const pct = Math.round(value * 100);
  return (
    <label className="mt-3 block">
      <span className={`${LABEL_CLASS} flex items-center justify-between`}>
        <span>Opacity</span>
        <span className="tabular-nums text-ds-text-muted">{pct}%</span>
      </span>
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
        className="w-full accent-ds-accent"
        aria-label="Element opacity"
      />
    </label>
  );
}
