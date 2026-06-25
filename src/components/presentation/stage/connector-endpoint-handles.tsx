"use client";

import type React from "react";

import type {
  ConnectorElement,
  ElementBox,
  SlideElement,
} from "@/lib/presentation/deck";
import { resolveConnectorElementPoints } from "@/lib/presentation/connector-geometry";

type EndpointHandle = "w" | "e";

/**
 * Endpoint drag handles for a selected {@link ConnectorElement} (issue #325).
 *
 * Renders two touchable dots positioned at the actual start/end screen
 * coordinates (as %-of-element-box offsets) rather than the element's
 * bounding-box edges. Bound endpoints receive a blue filled ring; free
 * endpoints use the default grey dot.
 */
export function ConnectorEndpointHandles({
  element,
  elements,
  fittedBoxes,
  onBeginDrag,
}: {
  element: ConnectorElement;
  elements: readonly SlideElement[];
  fittedBoxes: ReadonlyMap<string, ElementBox>;
  onBeginDrag: (event: React.PointerEvent, mode: EndpointHandle) => void;
}) {
  const cbox = fittedBoxes.get(element.id) ?? element.box;
  const { start: startPt, end: endPt } = resolveConnectorElementPoints(
    element,
    elements,
    (el) => fittedBoxes.get(el.id) ?? el.box,
  );
  // Convert slide-% coordinates to % relative to the element's bounding box so
  // the <span> can be positioned with `left/top` inside the container div.
  const toRel = (ptX: number, ptY: number) => ({
    left: cbox.w > 0 ? ((ptX - cbox.x) / cbox.w) * 100 : 50,
    top: cbox.h > 0 ? ((ptY - cbox.y) / cbox.h) * 100 : 50,
  });
  const handles: {
    rel: { left: number; top: number };
    mode: EndpointHandle;
    bound: boolean;
    label: string;
  }[] = [
    {
      rel: toRel(startPt.x, startPt.y),
      mode: "w",
      bound: "elementId" in element.start,
      label: "Drag start endpoint",
    },
    {
      rel: toRel(endPt.x, endPt.y),
      mode: "e",
      bound: "elementId" in element.end,
      label: "Drag end endpoint",
    },
  ];
  return (
    <>
      {handles.map(({ rel, mode, bound, label }) => (
        <span
          key={mode}
          onPointerDown={(event) => onBeginDrag(event, mode)}
          aria-label={label}
          className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
          style={{
            left: `${rel.left}%`,
            top: `${rel.top}%`,
            cursor: "crosshair",
          }}
        >
          {/* Filled = bound to a shape; outlined = free floating. */}
          <span
            className={`h-3 w-3 rounded-full shadow transition-colors ${
              bound
                ? "bg-ds-accent"
                : "border border-ds-accent bg-ds-accent-surface"
            }`}
          />
        </span>
      ))}
    </>
  );
}
