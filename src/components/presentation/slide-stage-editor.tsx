"use client";

/**
 * Interactive editing stage for a single slide.
 *
 * Renders the shared {@link SlideCanvas} (so the editor preview is pixel-identical
 * to Present / public viewer) and layers a transparent interaction surface on
 * top that lets the user select, drag, and resize free-form elements. All
 * geometry is expressed in percentage boxes so it stays resolution-independent.
 *
 * The component is controlled: it never mutates the deck. Box changes are
 * reported via `onElementChange` (live, during a drag) and selection via
 * `onSelectElement`.
 */

import { useCallback, useEffect, useRef } from "react";

import { SlideCanvas } from "@/components/presentation/slide-canvas";
import type { ElementBox, Slide } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";

type ResizeCorner = "nw" | "ne" | "sw" | "se";
type DragMode = "move" | ResizeCorner;

interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startBox: ElementBox;
}

const MIN_SIZE_PCT = 4;

function clampBox(box: ElementBox): ElementBox {
  const w = Math.max(MIN_SIZE_PCT, Math.min(100, box.w));
  const h = Math.max(MIN_SIZE_PCT, Math.min(100, box.h));
  const x = Math.max(0, Math.min(100 - w, box.x));
  const y = Math.max(0, Math.min(100 - h, box.y));
  return { x, y, w, h };
}

const CORNERS: {
  corner: ResizeCorner;
  cursor: string;
  style: React.CSSProperties;
}[] = [
  { corner: "nw", cursor: "nwse-resize", style: { left: "-5px", top: "-5px" } },
  {
    corner: "ne",
    cursor: "nesw-resize",
    style: { right: "-5px", top: "-5px" },
  },
  {
    corner: "sw",
    cursor: "nesw-resize",
    style: { left: "-5px", bottom: "-5px" },
  },
  {
    corner: "se",
    cursor: "nwse-resize",
    style: { right: "-5px", bottom: "-5px" },
  },
];

interface SlideStageEditorProps {
  slide: Slide;
  visuals: ReadonlyMap<string, Visual>;
  width: number;
  height: number;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onElementChange: (id: string, box: ElementBox) => void;
}

export function SlideStageEditor({
  slide,
  visuals,
  width,
  height,
  selectedElementId,
  onSelectElement,
  onElementChange,
}: SlideStageEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const elements = slide.elements ?? [];

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const dxPct = ((event.clientX - drag.startClientX) / rect.width) * 100;
      const dyPct = ((event.clientY - drag.startClientY) / rect.height) * 100;
      const b = drag.startBox;

      let next: ElementBox;
      if (drag.mode === "move") {
        next = { ...b, x: b.x + dxPct, y: b.y + dyPct };
      } else {
        let { x, y, w, h } = b;
        if (drag.mode === "nw") {
          x += dxPct;
          y += dyPct;
          w -= dxPct;
          h -= dyPct;
        } else if (drag.mode === "ne") {
          y += dyPct;
          w += dxPct;
          h -= dyPct;
        } else if (drag.mode === "sw") {
          x += dxPct;
          w -= dxPct;
          h += dyPct;
        } else {
          w += dxPct;
          h += dyPct;
        }
        next = { x, y, w, h };
      }
      onElementChange(drag.id, clampBox(next));
    },
    [onElementChange],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [handlePointerMove, endDrag]);

  const beginDrag = useCallback(
    (
      event: React.PointerEvent,
      id: string,
      mode: DragMode,
      box: ElementBox,
    ) => {
      event.stopPropagation();
      onSelectElement(id);
      dragRef.current = {
        id,
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBox: box,
      };
    },
    [onSelectElement],
  );

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ width, height }}
      onPointerDown={() => onSelectElement(null)}
    >
      <div className="pointer-events-none absolute inset-0">
        <SlideCanvas slide={slide} visuals={visuals} />
      </div>

      {/* Interaction layer */}
      <div className="absolute inset-0">
        {elements.map((element) => {
          const selected = element.id === selectedElementId;
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              aria-label={`${element.kind} element`}
              onPointerDown={(event) =>
                beginDrag(event, element.id, "move", element.box)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectElement(element.id);
                }
              }}
              className={`absolute cursor-move outline-none transition-colors ${
                selected
                  ? "ring-2 ring-ds-control"
                  : "ring-1 ring-transparent hover:ring-1 hover:ring-ds-control/40"
              }`}
              style={{
                left: `${element.box.x}%`,
                top: `${element.box.y}%`,
                width: `${element.box.w}%`,
                height: `${element.box.h}%`,
                zIndex: selected ? 1000 : element.zIndex + 1,
              }}
            >
              {selected
                ? CORNERS.map(({ corner, cursor, style }) => (
                    <span
                      key={corner}
                      onPointerDown={(event) =>
                        beginDrag(event, element.id, corner, element.box)
                      }
                      className="absolute h-2.5 w-2.5 rounded-full border border-white bg-ds-control"
                      style={{ ...style, cursor }}
                    />
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
