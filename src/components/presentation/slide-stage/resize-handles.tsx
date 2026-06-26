"use client";

import type { CSSProperties } from "react";
import { RotateCw } from "lucide-react";

import type {
  ConnectorElement,
  ElementBox,
  SlideElement,
} from "@/lib/presentation/deck";
import { resolveConnectorElementPoints } from "@/lib/presentation/connector-geometry";
import {
  selectionFrameChrome,
  STAGE_CHROME_Z_INDEX,
} from "@/lib/presentation/stage-chrome";
import type { Handle } from "@/lib/presentation/stage-resize";

// Each resize handle renders a ~44px transparent hit area (touch target, issue
// #209) centred on its edge/corner, with a small visible dot drawn at its
// centre. The −22 offsets are half of that 44px box so the box's centre lands
// exactly on the element's edge/corner regardless of the dot's visual size.
export const HANDLE_EDGE = -22;

export const HANDLES: {
  handle: Handle;
  cursor: string;
  style: CSSProperties;
}[] = [
  {
    handle: "nw",
    cursor: "nwse-resize",
    style: { left: HANDLE_EDGE, top: HANDLE_EDGE },
  },
  {
    handle: "n",
    cursor: "ns-resize",
    style: { left: "50%", top: HANDLE_EDGE, transform: "translateX(-50%)" },
  },
  {
    handle: "ne",
    cursor: "nesw-resize",
    style: { right: HANDLE_EDGE, top: HANDLE_EDGE },
  },
  {
    handle: "e",
    cursor: "ew-resize",
    style: { right: HANDLE_EDGE, top: "50%", transform: "translateY(-50%)" },
  },
  {
    handle: "se",
    cursor: "nwse-resize",
    style: { right: HANDLE_EDGE, bottom: HANDLE_EDGE },
  },
  {
    handle: "s",
    cursor: "ns-resize",
    style: { left: "50%", bottom: HANDLE_EDGE, transform: "translateX(-50%)" },
  },
  {
    handle: "sw",
    cursor: "nesw-resize",
    style: { left: HANDLE_EDGE, bottom: HANDLE_EDGE },
  },
  {
    handle: "w",
    cursor: "ew-resize",
    style: { left: HANDLE_EDGE, top: "50%", transform: "translateY(-50%)" },
  },
];

export const LINE_HANDLES = HANDLES.filter(
  ({ handle }) => handle === "w" || handle === "e",
);

/** Bottom-edge handles dimmed for auto-height text/bullets (#333). */
export const BOTTOM_HANDLES = new Set<Handle>(["s", "se", "sw"]);

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
  onBeginDrag: (
    event: React.PointerEvent,
    mode: Extract<Handle, "w" | "e">,
  ) => void;
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
    mode: Extract<Handle, "w" | "e">;
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

/**
 * Overlay rendered around the combined bounding box of a multi-selection
 * (issue #329).  Shows a dashed border frame with eight resize handles and one
 * rotation handle (matching the per-element single-select style so the UX is
 * consistent).
 *
 * The component is purely presentational — all pointer events are forwarded
 * upstream via `onBeginDrag`.
 */
export function MultiSelectBoundingBox({
  bbox,
  showAdvanced,
  onBeginDrag,
}: {
  bbox: ElementBox;
  showAdvanced: boolean;
  onBeginDrag: (
    event: React.PointerEvent,
    mode: Handle | "rotate",
    bbox: ElementBox,
  ) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: `${bbox.x}%`,
        top: `${bbox.y}%`,
        width: `${bbox.w}%`,
        height: `${bbox.h}%`,
        zIndex: STAGE_CHROME_Z_INDEX.multiSelectionBounds,
        // Dashed outline distinguishes the combined box from single-select rings.
        outline: "2px dashed var(--ds-accent)",
        outlineOffset: "1px",
      }}
    >
      {/* Eight resize handles — same positions and touch targets as HANDLES. */}
      {HANDLES.map(({ handle, cursor, style }) => (
        <span
          key={handle}
          onPointerDown={(event) => onBeginDrag(event, handle, bbox)}
          aria-hidden="true"
          className="pointer-events-auto absolute flex h-11 w-11 touch-none items-center justify-center"
          style={{ ...style, cursor }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-ds-accent shadow" />
        </span>
      ))}

      {/* Rotation handle — only in advanced mode, same style as single-select. */}
      {showAdvanced ? (
        <span
          onPointerDown={(event) => onBeginDrag(event, "rotate", bbox)}
          aria-hidden="true"
          className="pointer-events-auto absolute left-1/2 flex h-11 w-11 -translate-x-1/2 touch-none items-center justify-center"
          style={{ top: "calc(100% + 6px)", cursor: "grab" }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ds-accent text-ds-text-on-accent shadow">
            <RotateCw size={11} aria-hidden="true" />
          </span>
        </span>
      ) : null}
    </div>
  );
}

export function ElementFrameOverlay({
  box,
  rotation,
  variant,
}: {
  box: ElementBox;
  rotation?: number;
  variant: "selected" | "preselected";
}) {
  const chrome = selectionFrameChrome(variant);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute box-border rounded-xs"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        opacity: chrome.opacity,
        zIndex: chrome.zIndex,
        border: `${chrome.borderWidthPx}px solid var(--ds-accent)`,
        ...(rotation ? { transform: `rotate(${rotation}deg)` } : {}),
      }}
    />
  );
}
