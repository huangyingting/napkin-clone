"use client";

/**
 * vNext slide canvas — renders a `ResolvedSlideRenderTree` or a single slide
 * from a `ResolvedDeckRenderTree` without any v6 materialization.
 *
 * Rendering order (spec §Render Tree):
 *   1. Slide background fill.
 *   2. Theme decoration nodes (behind user nodes) — not selectable in normal mode.
 *   3. Background deck chrome such as watermarks.
 *   4. User nodes ordered by ascending zIndex with stable tree-order ties.
 *   5. Foreground deck chrome such as logo/footer/page number/border.
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
import {
  STAGE_CHROME_Z_INDEX,
  selectionFrameChrome,
} from "@/lib/presentation-vnext/stage-chrome";

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

export type CropHandlePosition = "top" | "right" | "bottom" | "left";

export type ConnectorEndpointHandle = "from" | "to";

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
const CROP_HANDLES: readonly CropHandlePosition[] = [
  "top",
  "right",
  "bottom",
  "left",
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
  /** Called when the user double-clicks a node (used to enter inline edit mode). */
  onNodeDoubleClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** Called when the user starts dragging a node. */
  onNodePointerDown?: (nodeId: string, event: React.PointerEvent) => void;
  /** Called when a node receives keyboard focus. */
  onNodeFocus?: (nodeId: string, event: React.FocusEvent) => void;
  /** Called when pointer hover enters/leaves a node. */
  onNodeHoverChange?: (nodeId: string, hovering: boolean) => void;
  /** Called when the user starts resizing a selected node. */
  onResizeHandlePointerDown?: (
    nodeId: string,
    handle: ResizeHandlePosition,
    event: React.PointerEvent,
  ) => void;
  /** Called when the user starts cropping a selected image. */
  onCropHandlePointerDown?: (
    nodeId: string,
    handle: CropHandlePosition,
    event: React.PointerEvent,
  ) => void;
  /** Called when the user starts rotating a selected node. */
  onRotationHandlePointerDown?: (
    nodeId: string,
    event: React.PointerEvent,
  ) => void;
  /** Called when the user drags a connector endpoint. */
  onConnectorEndpointPointerDown?: (
    nodeId: string,
    endpoint: ConnectorEndpointHandle,
    event: React.PointerEvent,
  ) => void;
  /** Currently active resize handle, if any. */
  activeResizeHandle?: { nodeId: string; handle: ResizeHandlePosition } | null;
  /** Currently active crop handle, if any. */
  activeCropHandle?: { nodeId: string; handle: CropHandlePosition } | null;
  /** Currently active rotation handle, if any. */
  activeRotationNodeId?: string | null;
  /** Currently active connector endpoint, if any. */
  activeConnectorEndpoint?: {
    nodeId: string;
    endpoint: ConnectorEndpointHandle;
  } | null;
  /** Active group context id for group-member direct editing. */
  activeGroupId?: string | null;
  /** Active table direct-edit context. */
  tableEditingNodeId?: string | null;
  activeTableCell?: { rowIndex: number; colIndex: number } | null;
  onTableCellFocus?: (
    nodeId: string,
    rowIndex: number,
    colIndex: number,
  ) => void;
  onTableCellCommit?: (
    nodeId: string,
    rowIndex: number,
    colIndex: number,
    text: string,
  ) => void;
  onTableCellKeyDown?: (
    nodeId: string,
    rowIndex: number,
    colIndex: number,
    event: React.KeyboardEvent<HTMLElement>,
  ) => void;
  /**
   * Node ids to hide from the canvas (e.g., the node being inline-edited
   * is hidden while the overlay editor is active).
   */
  hiddenNodeIds?: ReadonlySet<string>;
  /** Node currently hovered by the pointer. */
  hoveredNodeId?: string | null;
  /** Roving-tabindex focus target. */
  focusedNodeId?: string | null;
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
  onNodeDoubleClick,
  onNodePointerDown,
  onNodeFocus,
  onNodeHoverChange,
  onResizeHandlePointerDown,
  onCropHandlePointerDown,
  onRotationHandlePointerDown,
  onConnectorEndpointPointerDown,
  activeResizeHandle,
  activeCropHandle,
  activeRotationNodeId,
  activeConnectorEndpoint,
  activeGroupId,
  tableEditingNodeId,
  activeTableCell,
  onTableCellFocus,
  onTableCellCommit,
  onTableCellKeyDown,
  hiddenNodeIds,
  hoveredNodeId,
  focusedNodeId,
  preview = false,
  className,
}: SlideCanvasVNextProps): JSX.Element {
  const aspectRatio = canvas ? canvasAspectRatio(canvas) : 16 / 9;
  const bgStyle = backgroundToCss(slide.background.fill, assetResolver);

  // Flatten groups for rendering (children positioned in slide-relative space)
  const decorationNodes = flattenNodes(slide.decorations);
  const chromeNodes = flattenNodes(slide.chrome);
  const backgroundChromeNodes = chromeNodes
    .filter((node) => (node.layout.zIndex ?? 0) < 0)
    .sort((a, b) => (a.layout.zIndex ?? 0) - (b.layout.zIndex ?? 0));
  const foregroundChromeNodes = chromeNodes
    .filter((node) => (node.layout.zIndex ?? 0) >= 0)
    .sort((a, b) => (a.layout.zIndex ?? 0) - (b.layout.zIndex ?? 0));
  const userNodes = flattenNodes(slide.nodes);
  const selectedUserNodes = selection
    ? userNodes.filter((node) => isSelected(selection, node.id))
    : [];
  const selectedResizableNodes = selectedUserNodes.filter(
    (node) => node.locked !== true,
  );
  const selectedCroppableNodes = selectedResizableNodes.filter(
    (node) => node.type === "image" && node.content.type === "image",
  );
  const selectedRotatableNodes = selectedResizableNodes.filter(
    (node) => node.type !== "connector",
  );
  const selectedConnectorNodes = selectedResizableNodes.filter(
    (node) => node.type === "connector" && node.content.type === "connector",
  );
  const activeGroupNode =
    activeGroupId && !preview
      ? userNodes.find(
          (node) => node.id === activeGroupId && node.type === "group",
        )
      : undefined;
  const preselectedUserNodes = !preview
    ? userNodes.filter(
        (node) =>
          !selectedUserNodes.some(
            (selectedNode) => selectedNode.id === node.id,
          ) &&
          (hoveredNodeId === node.id || focusedNodeId === node.id),
      )
    : [];
  const multiSelectionFrame =
    selectedUserNodes.length > 1 ? boundsForNodes(selectedUserNodes) : null;

  const handleNodeClick = onNodeClick
    ? (nodeId: string, event: React.MouseEvent) => {
        onNodeClick(nodeId, event);
      }
    : undefined;

  const handleNodeDoubleClick = onNodeDoubleClick
    ? (nodeId: string, event: React.MouseEvent) => {
        onNodeDoubleClick(nodeId, event);
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
          hidden={hiddenNodeIds?.has(node.id)}
          // Decorations are never interactive in the normal canvas
        />
      ))}

      {/* Background deck chrome — non-interactive outside layers mode */}
      {backgroundChromeNodes.map((node) => (
        <SlideNodeRenderer
          key={node.id}
          node={node}
          assetResolver={assetResolver}
          preview={preview}
          hidden={hiddenNodeIds?.has(node.id)}
        />
      ))}

      {/* User nodes */}
      {userNodes.map((node) =>
        (() => {
          const selected = selection ? isSelected(selection, node.id) : false;
          const interactive = !preview && onNodeClick !== undefined;
          return (
            <SlideNodeRenderer
              key={node.id}
              node={node}
              selected={selected}
              hovered={hoveredNodeId === node.id}
              focused={focusedNodeId === node.id}
              interactive={interactive}
              tabIndex={
                interactive
                  ? focusedNodeId === node.id ||
                    (focusedNodeId === undefined && selected)
                    ? 0
                    : -1
                  : undefined
              }
              onClick={handleNodeClick}
              onDoubleClick={handleNodeDoubleClick}
              onPointerDown={preview ? undefined : onNodePointerDown}
              onFocus={preview ? undefined : onNodeFocus}
              onHoverChange={preview ? undefined : onNodeHoverChange}
              tableEditing={tableEditingNodeId === node.id}
              activeTableCell={
                tableEditingNodeId === node.id ? activeTableCell : null
              }
              onTableCellFocus={onTableCellFocus}
              onTableCellCommit={onTableCellCommit}
              onTableCellKeyDown={onTableCellKeyDown}
              assetResolver={assetResolver}
              preview={preview}
              hidden={hiddenNodeIds?.has(node.id)}
            />
          );
        })(),
      )}

      {/* Foreground deck chrome — rendered above user nodes and aria-hidden */}
      {foregroundChromeNodes.map((node) => (
        <SlideNodeRenderer
          key={node.id}
          node={node}
          assetResolver={assetResolver}
          preview={preview}
          hidden={hiddenNodeIds?.has(node.id)}
        />
      ))}

      {!preview
        ? preselectedUserNodes.map((node) => (
            <NodeChromeFrame
              key={`${node.id}-preselected-frame`}
              node={node}
              variant="preselected"
            />
          ))
        : null}

      {!preview
        ? selectedUserNodes.map((node) => (
            <NodeChromeFrame
              key={`${node.id}-selected-frame`}
              node={node}
              variant="selected"
            />
          ))
        : null}

      {!preview && activeGroupNode ? (
        <NodeChromeFrame node={activeGroupNode} variant="activeGroup" />
      ) : null}

      {!preview && multiSelectionFrame ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border border-dashed border-ds-accent-border bg-ds-accent-surface/10"
          style={{
            left: `${multiSelectionFrame.x}%`,
            top: `${multiSelectionFrame.y}%`,
            width: `${multiSelectionFrame.w}%`,
            height: `${multiSelectionFrame.h}%`,
            zIndex: STAGE_CHROME_Z_INDEX.multiSelectionBounds,
          }}
        />
      ) : null}

      {!preview && onResizeHandlePointerDown
        ? selectedResizableNodes.map((node) => (
            <div
              key={`${node.id}-resize-overlay`}
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{
                left: `${node.layout.frame.x}%`,
                top: `${node.layout.frame.y}%`,
                width: `${node.layout.frame.w}%`,
                height: `${node.layout.frame.h}%`,
                zIndex: STAGE_CHROME_Z_INDEX.selectedFrame,
              }}
            >
              {RESIZE_HANDLES.map((handle) => (
                <span
                  key={handle}
                  data-resize-handle={handle}
                  className={`pointer-events-auto absolute h-2.5 w-2.5 rounded-full border shadow-ds-sm ${
                    activeResizeHandle?.nodeId === node.id &&
                    activeResizeHandle.handle === handle
                      ? "border-ds-accent-fill bg-ds-accent-fill"
                      : "border-ds-accent-border bg-ds-surface"
                  }`}
                  style={resizeHandleStyle(handle)}
                  onPointerDown={(event) =>
                    onResizeHandlePointerDown(node.id, handle, event)
                  }
                />
              ))}
            </div>
          ))
        : null}

      {!preview && onRotationHandlePointerDown
        ? selectedRotatableNodes.map((node) => (
            <div
              key={`${node.id}-rotation-overlay`}
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{
                left: `${node.layout.frame.x}%`,
                top: `${node.layout.frame.y}%`,
                width: `${node.layout.frame.w}%`,
                height: `${node.layout.frame.h}%`,
                zIndex: STAGE_CHROME_Z_INDEX.selectedFrame + 1,
              }}
            >
              <span
                data-rotation-handle="true"
                className={`pointer-events-auto absolute flex h-5 w-5 items-center justify-center rounded-full border bg-ds-surface text-[10px] leading-none shadow-ds-sm ${
                  activeRotationNodeId === node.id
                    ? "border-ds-accent-fill text-ds-accent-text"
                    : "border-ds-accent-border text-ds-text-secondary"
                }`}
                style={{
                  left: "50%",
                  top: -28,
                  transform: "translate(-50%, -50%)",
                  cursor: "grab",
                }}
                onPointerDown={(event) =>
                  onRotationHandlePointerDown(node.id, event)
                }
              >
                ↻
              </span>
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-0 h-7 w-px -translate-x-1/2 bg-ds-accent-border"
              />
            </div>
          ))
        : null}

      {!preview && onCropHandlePointerDown
        ? selectedCroppableNodes.map((node) => (
            <div
              key={`${node.id}-crop-overlay`}
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{
                left: `${node.layout.frame.x}%`,
                top: `${node.layout.frame.y}%`,
                width: `${node.layout.frame.w}%`,
                height: `${node.layout.frame.h}%`,
                zIndex: STAGE_CHROME_Z_INDEX.cropHandle,
              }}
            >
              {CROP_HANDLES.map((handle) => (
                <span
                  key={handle}
                  data-crop-handle={handle}
                  className={`pointer-events-auto absolute rounded-full border shadow-ds-sm ${
                    activeCropHandle?.nodeId === node.id &&
                    activeCropHandle.handle === handle
                      ? "border-ds-accent-fill bg-ds-accent-fill"
                      : "border-ds-accent-border bg-ds-surface"
                  }`}
                  style={cropHandleStyle(handle)}
                  onPointerDown={(event) =>
                    onCropHandlePointerDown(node.id, handle, event)
                  }
                />
              ))}
            </div>
          ))
        : null}

      {!preview && onConnectorEndpointPointerDown
        ? selectedConnectorNodes.map((node) => {
            if (node.content.type !== "connector") return null;
            const start = connectorEndpointPoint(node.content.content.from);
            const end = connectorEndpointPoint(node.content.content.to);
            return (
              <div
                key={`${node.id}-connector-endpoints`}
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  left: `${node.layout.frame.x}%`,
                  top: `${node.layout.frame.y}%`,
                  width: `${node.layout.frame.w}%`,
                  height: `${node.layout.frame.h}%`,
                  zIndex: STAGE_CHROME_Z_INDEX.selectedFrame + 2,
                }}
              >
                {(
                  [
                    ["from", start],
                    ["to", end],
                  ] as const
                ).map(([endpoint, point]) => (
                  <span
                    key={endpoint}
                    data-connector-endpoint={endpoint}
                    className={`pointer-events-auto absolute h-3 w-3 rounded-full border shadow-ds-sm ${
                      activeConnectorEndpoint?.nodeId === node.id &&
                      activeConnectorEndpoint.endpoint === endpoint
                        ? "border-ds-accent-fill bg-ds-accent-fill"
                        : "border-ds-accent-border bg-ds-surface"
                    }`}
                    style={{
                      left: `${point.x}%`,
                      top: `${point.y}%`,
                      transform: "translate(-50%, -50%)",
                      cursor: "crosshair",
                    }}
                    onPointerDown={(event) =>
                      onConnectorEndpointPointerDown(node.id, endpoint, event)
                    }
                  />
                ))}
              </div>
            );
          })
        : null}
    </div>
  );
});

function NodeChromeFrame({
  node,
  variant,
}: {
  node: ResolvedRenderNode;
  variant: "selected" | "preselected" | "activeGroup";
}) {
  const chrome = selectionFrameChrome(variant);
  const isLocked = node.locked === true;
  const color =
    variant === "activeGroup"
      ? "var(--ds-warning-border, #f59e0b)"
      : variant === "selected"
        ? isLocked
          ? "var(--ds-border, #9ca3af)"
          : "var(--ds-accent-fill, #6366f1)"
        : "var(--ds-border, #cbd5e1)";
  return (
    <div
      aria-hidden="true"
      data-node-chrome-frame={variant}
      data-node-id={node.id}
      className="pointer-events-none absolute box-border"
      style={{
        left: `${node.layout.frame.x}%`,
        top: `${node.layout.frame.y}%`,
        width: `${node.layout.frame.w}%`,
        height: `${node.layout.frame.h}%`,
        border: `${chrome.borderWidthPx}px ${isLocked ? "dashed" : "solid"} ${color}`,
        opacity: chrome.opacity,
        zIndex: chrome.zIndex,
      }}
    />
  );
}

function connectorEndpointPoint(
  endpoint: Extract<
    ResolvedRenderNode["content"],
    { type: "connector" }
  >["content"]["from"],
): { x: number; y: number } {
  if (endpoint.kind === "point") return endpoint.point;
  switch (endpoint.anchor) {
    case "top":
      return { x: 50, y: 0 };
    case "right":
      return { x: 100, y: 50 };
    case "bottom":
      return { x: 50, y: 100 };
    case "left":
      return { x: 0, y: 50 };
    case "center":
    default:
      return { x: 50, y: 50 };
  }
}

function boundsForNodes(
  nodes: readonly ResolvedRenderNode[],
): { x: number; y: number; w: number; h: number } | null {
  if (nodes.length === 0) return null;
  const left = Math.min(...nodes.map((node) => node.layout.frame.x));
  const top = Math.min(...nodes.map((node) => node.layout.frame.y));
  const right = Math.max(
    ...nodes.map((node) => node.layout.frame.x + node.layout.frame.w),
  );
  const bottom = Math.max(
    ...nodes.map((node) => node.layout.frame.y + node.layout.frame.h),
  );
  return { x: left, y: top, w: right - left, h: bottom - top };
}

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

function cropHandleStyle(handle: CropHandlePosition): React.CSSProperties {
  if (handle === "top" || handle === "bottom") {
    return {
      left: "50%",
      top: handle === "top" ? 0 : "100%",
      width: 34,
      height: 7,
      transform: "translate(-50%, -50%)",
      cursor: "ns-resize",
    };
  }
  return {
    left: handle === "left" ? 0 : "100%",
    top: "50%",
    width: 7,
    height: 34,
    transform: "translate(-50%, -50%)",
    cursor: "ew-resize",
  };
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
 * delegates to `SlideCanvasVNext`, which renders the resolved theme decoration,
 * user-node, and deck chrome layers.
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
