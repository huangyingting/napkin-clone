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
import { getSlideRenderLists } from "@/lib/presentation-vnext/render-tree";
import type { CanvasSpec } from "@/lib/presentation-vnext/types";
import type {
  ConnectorEndpoint,
  ImageCrop,
  LayoutBox,
} from "@/lib/presentation-vnext/schema";
import {
  STAGE_CHROME_Z_INDEX,
  selectionFrameChrome,
} from "@/lib/presentation-vnext/stage-chrome";

import { fillStyleToCss } from "./fill-style-css";
import {
  frameToCss,
  nodeLayoutTransformToCss,
  SlideNodeRenderer,
} from "./slide-node-renderer";
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

export interface SlideCanvasNodeGestureDraft {
  frame?: LayoutBox["frame"];
  rotation?: number;
  crop?: ImageCrop;
  connectorEndpoints?: Partial<
    Record<ConnectorEndpointHandle, ConnectorEndpoint>
  >;
}

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
const RESIZE_HANDLE_CURSORS: Record<ResizeHandlePosition, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};
const CROP_HANDLE_CURSORS: Record<CropHandlePosition, string> = {
  top: "ns-resize",
  right: "ew-resize",
  bottom: "ns-resize",
  left: "ew-resize",
};

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
   * ring; pointer-down on nodes starts selection/drag handling.
   */
  selection?: SelectionState;
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
  /** Transient, gesture-local node patches rendered before commit. */
  nodeGestureDrafts?: ReadonlyMap<string, SlideCanvasNodeGestureDraft>;
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
  /** True when the slide background is the current hover/preselection target. */
  slideHovered?: boolean;
  /** True when the slide itself is selected (no node selection). */
  slideSelected?: boolean;
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
  nodeGestureDrafts,
  activeGroupId,
  tableEditingNodeId,
  activeTableCell,
  onTableCellFocus,
  onTableCellCommit,
  onTableCellKeyDown,
  hiddenNodeIds,
  hoveredNodeId,
  slideHovered = false,
  slideSelected = false,
  focusedNodeId,
  preview = false,
  className,
}: SlideCanvasVNextProps): JSX.Element {
  const aspectRatio = canvas ? canvasAspectRatio(canvas) : 16 / 9;
  const backgroundFill = slide.background.fill;
  const backgroundFillStyle = fillStyleToCss(backgroundFill, assetResolver);
  const backgroundFillLayerStyle =
    backgroundFill?.type === "image" &&
    backgroundFillStyle.backgroundImage !== undefined
      ? {
          ...backgroundFillStyle,
          position: "absolute" as const,
          inset: 0,
          pointerEvents: "none" as const,
          ...(backgroundFill.opacity !== undefined
            ? { opacity: backgroundFill.opacity }
            : {}),
        }
      : undefined;

  const renderLists = getSlideRenderLists(slide);
  const decorationNodes = renderLists.decorations;
  const backgroundChromeNodes = renderLists.backgroundChrome;
  const foregroundChromeNodes = renderLists.foregroundChrome;
  const userNodes =
    nodeGestureDrafts && nodeGestureDrafts.size > 0
      ? renderLists.userNodes.map((node) =>
          applyNodeGestureDraft(node, nodeGestureDrafts),
        )
      : renderLists.userNodes;
  const isHiddenNode = (nodeId: string) => hiddenNodeIds?.has(nodeId) === true;
  const stageChromeUserNodes = userNodes.filter(
    (node) => !isHiddenNode(node.id),
  );
  const selectedUserNodes = selection
    ? stageChromeUserNodes.filter((node) => isSelected(selection, node.id))
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
      ? stageChromeUserNodes.find(
          (node) => node.id === activeGroupId && node.type === "group",
        )
      : undefined;
  const preselectedUserNodes = !preview
    ? stageChromeUserNodes.filter(
        (node) =>
          !selectedUserNodes.some(
            (selectedNode) => selectedNode.id === node.id,
          ) &&
          (hoveredNodeId === node.id || focusedNodeId === node.id),
      )
    : [];
  const multiSelectionFrame =
    selectedUserNodes.length > 1 ? boundsForNodes(selectedUserNodes) : null;

  const handleNodeDoubleClick = onNodeDoubleClick
    ? (nodeId: string, event: React.MouseEvent) => {
        onNodeDoubleClick(nodeId, event);
      }
    : undefined;

  return (
    <div
      data-slide-canvas-vnext="true"
      data-slide-hovered={slideHovered ? "true" : undefined}
      data-slide-selected={slideSelected ? "true" : undefined}
      className={`relative overflow-hidden${className ? ` ${className}` : ""}`}
      style={{
        aspectRatio: `${aspectRatio}`,
        width: "100%",
        ...(backgroundFillLayerStyle ? {} : backgroundFillStyle),
      }}
    >
      {backgroundFillLayerStyle ? (
        <div
          aria-hidden="true"
          data-slide-background-fill-layer="image"
          style={backgroundFillLayerStyle}
        />
      ) : null}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
        }}
      >
        {/* Decorations — rendered behind user nodes, aria-hidden */}
        {decorationNodes.map((node) => (
          <SlideNodeRenderer
            key={node.id}
            node={node}
            assetResolver={assetResolver}
            preview={preview}
            hidden={isHiddenNode(node.id)}
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
            hidden={isHiddenNode(node.id)}
          />
        ))}

        {/* User nodes */}
        {userNodes.map((node) =>
          (() => {
            const selected = selection ? isSelected(selection, node.id) : false;
            const interactive = !preview && onNodePointerDown !== undefined;
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
                hidden={isHiddenNode(node.id)}
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
            hidden={isHiddenNode(node.id)}
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
                data-node-chrome-overlay="resize"
                data-node-id={node.id}
                className="pointer-events-none absolute"
                style={nodeChromeOverlayFrameStyle(
                  node,
                  STAGE_CHROME_Z_INDEX.selectedFrame,
                )}
              >
                {RESIZE_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    data-resize-handle={handle}
                    className={`pointer-events-auto absolute h-2.5 w-2.5 rounded-full border shadow-ds-sm ${
                      activeResizeHandle?.nodeId === node.id &&
                      activeResizeHandle?.handle === handle
                        ? "border-ds-accent-fill bg-ds-accent-fill"
                        : "border-ds-accent-border bg-ds-surface"
                    }`}
                    style={{
                      ...resizeHandleStyle(handle),
                      cursor: RESIZE_HANDLE_CURSORS[handle],
                    }}
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
                data-node-chrome-overlay="rotation"
                data-node-id={node.id}
                className="pointer-events-none absolute"
                style={nodeChromeOverlayFrameStyle(
                  node,
                  STAGE_CHROME_Z_INDEX.selectedFrame + 1,
                )}
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
                    top: "calc(100% + 28px)",
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
                  className="absolute left-1/2 top-full h-7 w-px -translate-x-1/2 bg-ds-accent-border"
                />
              </div>
            ))
          : null}

        {!preview && onCropHandlePointerDown
          ? selectedCroppableNodes.map((node) => (
              <div
                key={`${node.id}-crop-overlay`}
                aria-hidden="true"
                data-node-chrome-overlay="crop"
                data-node-id={node.id}
                className="pointer-events-none absolute"
                style={nodeChromeOverlayFrameStyle(
                  node,
                  STAGE_CHROME_Z_INDEX.cropHandle,
                )}
              >
                {CROP_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    data-crop-handle={handle}
                    className={`pointer-events-auto absolute rounded-full border shadow-ds-sm ${
                      activeCropHandle?.nodeId === node.id &&
                      activeCropHandle?.handle === handle
                        ? "border-ds-accent-fill bg-ds-accent-fill"
                        : "border-ds-accent-border bg-ds-surface"
                    }`}
                    style={{
                      ...cropHandleStyle(handle),
                      cursor: CROP_HANDLE_CURSORS[handle],
                    }}
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
                  data-node-chrome-overlay="connector-endpoints"
                  data-node-id={node.id}
                  className="pointer-events-none absolute"
                  style={nodeChromeOverlayFrameStyle(
                    node,
                    STAGE_CHROME_Z_INDEX.selectedFrame + 2,
                  )}
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
                        activeConnectorEndpoint?.endpoint === endpoint
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
      : "var(--ds-accent-fill, #6366f1)";
  return (
    <div
      aria-hidden="true"
      data-node-chrome-frame={variant}
      data-node-id={node.id}
      className="pointer-events-none absolute box-border"
      style={{
        ...nodeChromeOverlayFrameStyle(node, chrome.zIndex),
        border: `${chrome.borderWidthPx}px ${isLocked ? "dashed" : "solid"} ${color}`,
        opacity: chrome.opacity,
      }}
    />
  );
}

function nodeChromeOverlayFrameStyle(
  node: ResolvedRenderNode,
  zIndex: number,
): React.CSSProperties {
  return {
    ...frameToCss(node.layout.frame),
    ...nodeLayoutTransformToCss(node.layout),
    zIndex,
  };
}

function applyNodeGestureDraft(
  node: ResolvedRenderNode,
  nodeGestureDrafts:
    | ReadonlyMap<string, SlideCanvasNodeGestureDraft>
    | undefined,
): ResolvedRenderNode {
  const draft = nodeGestureDrafts?.get(node.id);
  if (!draft) return node;
  let nextNode = node;
  if (draft.frame || draft.rotation !== undefined) {
    nextNode = {
      ...nextNode,
      layout: {
        ...nextNode.layout,
        ...(draft.frame ? { frame: draft.frame } : {}),
        ...(draft.rotation !== undefined ? { rotation: draft.rotation } : {}),
      },
    };
  }
  if (draft.crop && nextNode.content.type === "image") {
    nextNode = {
      ...nextNode,
      content: {
        ...nextNode.content,
        content: {
          ...nextNode.content.content,
          crop: draft.crop,
        },
      },
    };
  }
  if (
    draft.connectorEndpoints &&
    (draft.connectorEndpoints.from || draft.connectorEndpoints.to) &&
    nextNode.content.type === "connector"
  ) {
    nextNode = {
      ...nextNode,
      content: {
        ...nextNode.content,
        content: {
          ...nextNode.content.content,
          ...(draft.connectorEndpoints.from
            ? { from: draft.connectorEndpoints.from }
            : {}),
          ...(draft.connectorEndpoints.to
            ? { to: draft.connectorEndpoints.to }
            : {}),
        },
      },
    };
  }
  return nextNode;
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
  const transformedBounds = nodes.map(transformedNodeBounds);
  const left = Math.min(...transformedBounds.map((bounds) => bounds.left));
  const top = Math.min(...transformedBounds.map((bounds) => bounds.top));
  const right = Math.max(...transformedBounds.map((bounds) => bounds.right));
  const bottom = Math.max(...transformedBounds.map((bounds) => bounds.bottom));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function transformedNodeBounds(node: ResolvedRenderNode): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const { x, y, w, h } = node.layout.frame;
  const rotation = node.layout.rotation ?? 0;
  if (rotation % 360 === 0) {
    return { left: x, top: y, right: x + w, bottom: y + h };
  }
  const radians = (rotation * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const transformedCorners = corners.map(([cornerX, cornerY]) => {
    const localX = cornerX - centerX;
    const localY = cornerY - centerY;
    return {
      x: centerX + localX * cos - localY * sin,
      y: centerY + localX * sin + localY * cos,
    };
  });
  const xs = transformedCorners.map((corner) => corner.x);
  const ys = transformedCorners.map((corner) => corner.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
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
      onNodePointerDown={onNodePointerDown}
      onResizeHandlePointerDown={onResizeHandlePointerDown}
      preview={preview}
      className={className}
    />
  );
}
