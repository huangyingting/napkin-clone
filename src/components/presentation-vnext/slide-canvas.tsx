"use client";

/**
 * vNext slide canvas — renders a `ResolvedSlideRenderTree` or a single slide
 * from a `ResolvedDeckRenderTree` without any v6 materialization.
 *
 * Rendering order (spec §Render Tree):
 *   1. Slide background fill.
 *   2. Theme decoration nodes (behind user nodes) — not selectable in normal mode.
 *   3. User nodes ordered by ascending zIndex with stable tree-order ties.
 *
 * The canvas is `position: relative` with an aspect ratio driven by the
 * `canvas` spec.  All children are positioned absolutely in canvas-percent
 * space so the layout is resolution-independent.
 */

import { memo, type JSX } from "react";

import type {
  ResolvedSlideRenderTree,
  ResolvedDeckRenderTree,
  ResolvedRenderNode,
} from "@/lib/presentation-vnext/render-tree";
import type { CanvasSpec } from "@/lib/presentation-vnext/types";
import type { FillStyle } from "@/lib/presentation-vnext/style-schema";

import { SlideNodeRenderer } from "./slide-node-renderer";
import type { SelectionState } from "./selection-model";
import { isSelected } from "./selection-model";

export type ResizeHandlePosition =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

const RESIZE_HANDLES: readonly ResizeHandlePosition[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

// ---------------------------------------------------------------------------
// Background helper
// ---------------------------------------------------------------------------

function backgroundToCss(
  fill: FillStyle | undefined,
  assetResolver?: (id: string) => string | undefined,
): React.CSSProperties {
  if (!fill) return {};
  const stopsToCss = (
    stops: readonly { color: unknown; offsetPct: number }[] | undefined,
  ) =>
    stops
      ?.map((stop) => {
        const color =
          typeof stop.color === "string" ? stop.color : "transparent";
        return `${color} ${stop.offsetPct}%`;
      })
      .join(", ");
  switch (fill.type) {
    case "solid":
      return typeof fill.color === "string"
        ? { backgroundColor: fill.color }
        : {};
    case "linearGradient": {
      const from = typeof fill.from === "string" ? fill.from : "transparent";
      const to = typeof fill.to === "string" ? fill.to : "transparent";
      const angle = fill.angle ?? 90;
      const stops = stopsToCss(fill.stops);
      return {
        background: `linear-gradient(${angle}deg, ${stops ?? `${from}, ${to}`})`,
      };
    }
    case "radialGradient": {
      const inner = typeof fill.inner === "string" ? fill.inner : "transparent";
      const outer = typeof fill.outer === "string" ? fill.outer : "transparent";
      const stops = stopsToCss(fill.stops);
      return {
        background: `radial-gradient(${fill.rx ?? fill.r ?? 70}% ${fill.ry ?? fill.r ?? 70}% at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${stops ?? `${inner}, ${outer}`})`,
      };
    }
    case "conicGradient": {
      const stops = stopsToCss(fill.stops) ?? "transparent, transparent";
      return {
        background: `conic-gradient(from ${fill.fromAngle ?? 0}deg at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${stops})`,
      };
    }
    case "repeatingLinearGradient": {
      const stops =
        stopsToCss(fill.stops) ?? "transparent 0%, transparent 100%";
      return {
        background: `repeating-linear-gradient(${fill.angle ?? 90}deg, ${stops})`,
      };
    }
    case "pattern": {
      const color =
        typeof fill.color === "string" ? fill.color : "currentColor";
      const background =
        typeof fill.background === "string" ? fill.background : undefined;
      const spacing = fill.spacingPct ?? 8;
      const width = fill.strokeWidthPct ?? 0.25;
      if (fill.kind === "grid") {
        return {
          ...(background ? { backgroundColor: background } : {}),
          backgroundImage: `linear-gradient(${color} ${width}%, transparent ${width}%), linear-gradient(90deg, ${color} ${width}%, transparent ${width}%)`,
          backgroundSize: `${spacing}% ${spacing}%`,
        };
      }
      if (fill.kind === "dots") {
        return {
          ...(background ? { backgroundColor: background } : {}),
          backgroundImage: `radial-gradient(circle, ${color} ${width}%, transparent ${width}%)`,
          backgroundSize: `${spacing}% ${spacing}%`,
        };
      }
      const angle = fill.kind === "scanlines" ? 0 : (fill.angle ?? 135);
      return {
        ...(background ? { backgroundColor: background } : {}),
        backgroundImage: `repeating-linear-gradient(${angle}deg, ${color} 0%, ${color} ${width}%, transparent ${width}%, transparent ${spacing}%)`,
      };
    }
    case "image": {
      const src = assetResolver?.(fill.assetId);
      if (!src) return {};
      return {
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: fill.opacity,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Canvas aspect ratio
// ---------------------------------------------------------------------------

function canvasAspectRatio(canvas: CanvasSpec): number {
  if (canvas.height > 0 && canvas.width > 0) {
    return canvas.width / canvas.height;
  }
  return 16 / 9;
}

// ---------------------------------------------------------------------------
// Node flat list (including group children for rendering)
// ---------------------------------------------------------------------------

function flattenNodes(nodes: ResolvedRenderNode[]): ResolvedRenderNode[] {
  const result: ResolvedRenderNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && node.children.length > 0) {
      result.push(...flattenNodes(node.children));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// SlideCanvas — single slide
// ---------------------------------------------------------------------------

export interface SlideCanvasVNextProps {
  /** The resolved render tree for the slide to display. */
  slide: ResolvedSlideRenderTree;
  /** Canvas spec for aspect ratio.  Defaults to 16:9 when omitted. */
  canvas?: CanvasSpec;
  /**
   * Resolves an asset id to its src URL.  Used for images, visuals, and
   * image-fill backgrounds.  Safe to omit when no media nodes are present.
   */
  assetResolver?: (id: string) => string | undefined;
  /**
   * Current selection state. When provided, selected nodes display a focus
   * ring; clicking nodes calls `onNodeClick`.
   */
  selection?: SelectionState;
  /** Called when the user clicks a node. */
  onNodeClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** Called when the user starts dragging a node. */
  onNodePointerDown?: (nodeId: string, event: React.PointerEvent) => void;
  /** Called when the user starts resizing a selected node. */
  onResizeHandlePointerDown?: (
    nodeId: string,
    handle: ResizeHandlePosition,
    event: React.PointerEvent,
  ) => void;
  /** True when rendered at reduced size (thumbnail rail, next-slide preview). */
  preview?: boolean;
  /** Optional extra CSS class applied to the outer canvas container. */
  className?: string;
}

/**
 * Renders a single resolved slide as a percentage-positioned canvas.
 *
 * Decorations are rendered first (behind) and are never selectable unless the
 * selection is in "layers" mode.
 *
 * Wrapped with `React.memo` so unchanged slides skip re-render when a sibling
 * slide is mutated.
 */
export const SlideCanvasVNext = memo(function SlideCanvasVNext({
  slide,
  canvas,
  assetResolver,
  selection,
  onNodeClick,
  onNodePointerDown,
  onResizeHandlePointerDown,
  preview = false,
  className,
}: SlideCanvasVNextProps): JSX.Element {
  const aspectRatio = canvas ? canvasAspectRatio(canvas) : 16 / 9;
  const bgStyle = backgroundToCss(slide.background.fill, assetResolver);

  // Flatten groups for rendering (children positioned in slide-relative space)
  const decorationNodes = flattenNodes(slide.decorations);
  const userNodes = flattenNodes(slide.nodes);
  const selectedUserNodes = selection
    ? userNodes.filter((node) => isSelected(selection, node.id))
    : [];

  const handleNodeClick = onNodeClick
    ? (nodeId: string, event: React.MouseEvent) => {
        onNodeClick(nodeId, event);
      }
    : undefined;

  return (
    <div
      data-slide-canvas-vnext="true"
      className={`relative overflow-hidden${className ? ` ${className}` : ""}`}
      style={{
        aspectRatio: `${aspectRatio}`,
        width: "100%",
        ...bgStyle,
      }}
    >
      {/* Decorations — rendered behind user nodes, aria-hidden */}
      {decorationNodes.map((node) => (
        <SlideNodeRenderer
          key={node.id}
          node={node}
          assetResolver={assetResolver}
          preview={preview}
          // Decorations are never interactive in the normal canvas
        />
      ))}

      {/* User nodes */}
      {userNodes.map((node) => (
        <SlideNodeRenderer
          key={node.id}
          node={node}
          selected={selection ? isSelected(selection, node.id) : false}
          onClick={handleNodeClick}
          onPointerDown={preview ? undefined : onNodePointerDown}
          assetResolver={assetResolver}
          preview={preview}
        />
      ))}

      {!preview && onResizeHandlePointerDown
        ? selectedUserNodes.map((node) => (
            <div
              key={`${node.id}-resize-overlay`}
              aria-hidden="true"
              className="pointer-events-none absolute z-raised"
              style={{
                left: `${node.layout.frame.x}%`,
                top: `${node.layout.frame.y}%`,
                width: `${node.layout.frame.w}%`,
                height: `${node.layout.frame.h}%`,
              }}
            >
              {RESIZE_HANDLES.map((handle) => (
                <span
                  key={handle}
                  data-resize-handle={handle}
                  className="pointer-events-auto absolute h-2.5 w-2.5 rounded-full border border-ds-accent-border bg-ds-surface shadow-ds-sm"
                  style={resizeHandleStyle(handle)}
                  onPointerDown={(event) =>
                    onResizeHandlePointerDown(node.id, handle, event)
                  }
                />
              ))}
            </div>
          ))
        : null}
    </div>
  );
});

function resizeHandleStyle(handle: ResizeHandlePosition): React.CSSProperties {
  const horizontal = handle.includes("w")
    ? { left: 0, transform: "translate(-50%, -50%)" }
    : handle.includes("e")
      ? { left: "100%", transform: "translate(-50%, -50%)" }
      : { left: "50%", transform: "translate(-50%, -50%)" };
  const vertical = handle.includes("n")
    ? { top: 0 }
    : handle.includes("s")
      ? { top: "100%" }
      : { top: "50%" };
  return { ...horizontal, ...vertical };
}

// ---------------------------------------------------------------------------
// DeckCanvasVNext — renders all slides in a deck tree
// ---------------------------------------------------------------------------

export interface DeckCanvasVNextProps {
  /** The fully resolved deck render tree. */
  deck: ResolvedDeckRenderTree;
  /** Index of the currently active slide. Defaults to 0. */
  activeSlideIndex?: number;
  /** Same semantics as `SlideCanvasVNextProps.assetResolver`. */
  assetResolver?: (id: string) => string | undefined;
  /** Same semantics as `SlideCanvasVNextProps.selection`. */
  selection?: SelectionState;
  /** Called when the user clicks a node on the active slide. */
  onNodeClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** Called when the user starts dragging a node on the active slide. */
  onNodePointerDown?: (nodeId: string, event: React.PointerEvent) => void;
  /** Called when the user starts resizing a selected node on the active slide. */
  onResizeHandlePointerDown?: SlideCanvasVNextProps["onResizeHandlePointerDown"];
  /** Called when the user clicks a slide in the thumbnail rail. */
  onSlideClick?: (slideIndex: number) => void;
  /** True when rendered at reduced size. */
  preview?: boolean;
  /** Extra CSS class for the outer wrapper. */
  className?: string;
}

/**
 * Renders the active slide from a `ResolvedDeckRenderTree`.
 *
 * This component is intentionally minimal: it selects the active slide and
 * delegates to `SlideCanvasVNext`.  Thumbnail rails and deck-level chrome are
 * left to the consuming layout so this canvas stays composable.
 */
export function DeckCanvasVNext({
  deck,
  activeSlideIndex = 0,
  assetResolver,
  selection,
  onNodeClick,
  onNodePointerDown,
  onResizeHandlePointerDown,
  preview = false,
  className,
}: DeckCanvasVNextProps): JSX.Element | null {
  const slide = deck.slides[activeSlideIndex];
  if (!slide) return null;

  return (
    <SlideCanvasVNext
      slide={slide}
      canvas={deck.canvas}
      assetResolver={assetResolver}
      selection={selection}
      onNodeClick={onNodeClick}
      onNodePointerDown={onNodePointerDown}
      onResizeHandlePointerDown={onResizeHandlePointerDown}
      preview={preview}
      className={className}
    />
  );
}
