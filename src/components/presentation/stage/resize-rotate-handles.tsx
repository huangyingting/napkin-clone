"use client";

import type React from "react";
import { RotateCw } from "lucide-react";

import type { ElementBox } from "@/lib/presentation/deck";
import { STAGE_CHROME_Z_INDEX } from "@/lib/presentation/stage-chrome";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLE_EDGE = -22;

const HANDLES: {
  handle: Handle;
  cursor: string;
  style: React.CSSProperties;
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
