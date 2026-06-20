"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { resolveIconComponent } from "@/components/visual/icon-registry";
import {
  contentViewBox,
  edgeSegments,
  isPositionedKind,
  nodeBoxes,
  type EdgeSegment,
  type NodeBox,
} from "@/components/visual/layout";
import type { Visual, VisualEdge, VisualNode } from "@/lib/visual/schema";

/** Pointer travel (px) under which a press counts as a click, not a drag. */
const CLICK_THRESHOLD = 4;
const INPUT_HEIGHT = 34;
/** Edge toolbar (inline label input + flip / arrowhead / curve controls) size. */
const EDGE_TOOLBAR_WIDTH = 268;
const EDGE_TOOLBAR_HEIGHT = 40;
/** Stroke width of the invisible, clickable hit-area drawn over each edge. */
const EDGE_HIT_WIDTH = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function setNodeLabel(visual: Visual, id: string, label: string): Visual {
  return {
    ...visual,
    nodes: visual.nodes.map((node) =>
      node.id === id ? { ...node, label } : node,
    ),
  };
}

function setNodePosition(
  visual: Visual,
  id: string,
  x: number,
  y: number,
): Visual {
  return {
    ...visual,
    nodes: visual.nodes.map((node) =>
      node.id === id ? { ...node, x, y } : node,
    ),
  };
}

/** Removes a node and any edge that referenced it (criterion: edges update). */
function deleteNode(visual: Visual, id: string): Visual {
  return {
    ...visual,
    nodes: visual.nodes.filter((node) => node.id !== id),
    edges: visual.edges.filter((edge) => edge.from !== id && edge.to !== id),
  };
}

function setEdgeLabel(visual: Visual, id: string, label: string): Visual {
  return {
    ...visual,
    edges: visual.edges.map((edge) =>
      edge.id === id ? { ...edge, label } : edge,
    ),
  };
}

/** Flips a connector's direction by swapping its `from`/`to` endpoints. */
function flipEdge(visual: Visual, id: string): Visual {
  return {
    ...visual,
    edges: visual.edges.map((edge) =>
      edge.id === id ? { ...edge, from: edge.to, to: edge.from } : edge,
    ),
  };
}

/** Toggles a connector's arrowhead (the `directed` flag; default shown). */
function toggleEdgeDirected(visual: Visual, id: string): Visual {
  return {
    ...visual,
    edges: visual.edges.map((edge) =>
      edge.id === id ? { ...edge, directed: edge.directed === false } : edge,
    ),
  };
}

/** Toggles a connector between curved and straight (default straight). */
function toggleEdgeStyle(visual: Visual, id: string): Visual {
  return {
    ...visual,
    edges: visual.edges.map((edge) =>
      edge.id === id
        ? { ...edge, style: edge.style === "curved" ? "straight" : "curved" }
        : edge,
    ),
  };
}

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  startCenterX: number;
  startCenterY: number;
  positioned: boolean;
  moved: boolean;
}

/**
 * Interactive editing layer for a {@link Visual}. It renders the canonical
 * {@link VisualRenderer} as the visible base (so it always reflects the current
 * data and looks identical to read-only views) and overlays an SVG of
 * per-node hit-boxes in the same coordinate space. Nodes can be:
 *
 * - clicked to edit their label inline (a `<foreignObject>` input),
 * - dragged to a new position (positioned kinds: flowchart/mindmap/concept),
 * - deleted (which also drops connected edges).
 *
 * Every change is pushed up through `onChange` so the parent can persist it;
 * because the base re-renders from `visual`, edits appear immediately.
 */
export function VisualEditor({
  visual,
  onChange,
  onSelectNode,
  rendererRef,
  canEdit = true,
}: {
  visual: Visual;
  onChange: (next: Visual) => void;
  onSelectNode?: (id: string | null) => void;
  /** Optional ref to the rendered SVG (for exports). */
  rendererRef?: React.RefObject<SVGSVGElement | null>;
  canEdit?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const edgeInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Tracks the last click-release for manual double-click detection (native
  // dblclick is unreliable here because the node uses pointer capture).
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const editStartLabel = useRef<string>("");
  const editStartEdgeLabel = useRef<string>("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The node explicitly picked for styling (US-014). Distinct from `activeId`
  // (which also tracks hover) so the style panel targets a stable selection.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The connector (edge) selected for inline label/direction editing (US-016).
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);

  const positioned = isPositionedKind(visual.type) && !visual.autoLayout;
  const boxes = useMemo(() => nodeBoxes(visual), [visual]);
  // Keep the interactive overlay's coordinate system identical to the renderer
  // (which expands the viewBox to enclose any nodes overflowing the canvas).
  const overlayViewBox = useMemo(() => contentViewBox(visual), [visual]);

  // While editing a node, blank its label in the read-only render so the live
  // text isn't drawn behind the inline input (node sizes are label-independent,
  // so positions/layout stay identical — only the text disappears).
  const displayVisual = useMemo(() => {
    if (!editingId) return visual;
    return {
      ...visual,
      nodes: visual.nodes.map((node) =>
        node.id === editingId ? { ...node, label: "" } : node,
      ),
    };
  }, [visual, editingId]);
  const segments = useMemo(() => edgeSegments(visual), [visual]);
  const nodeById = useMemo(
    () => new Map(visual.nodes.map((node) => [node.id, node])),
    [visual],
  );
  const edgeById = useMemo(
    () => new Map(visual.edges.map((edge) => [edge.id, edge])),
    [visual],
  );
  const canDelete = visual.nodes.length > 1;

  // Stale ids (after a regeneration swaps the visual) resolve to nothing.
  const editingNode = editingId ? nodeById.get(editingId) : undefined;
  const deletableId = !editingId && canDelete ? (hoverId ?? activeId) : null;
  // The selected connector resolves to nothing if its id went stale.
  const selectedEdge = selectedEdgeId
    ? edgeById.get(selectedEdgeId)
    : undefined;
  const selectedEdgeSeg = selectedEdgeId
    ? segments.get(selectedEdgeId)
    : undefined;

  // Report the current selection so the parent's style panel can target it.
  // A stale id (after a regeneration) reports as no selection.
  useEffect(() => {
    onSelectNode?.(selectedId && nodeById.has(selectedId) ? selectedId : null);
  }, [selectedId, nodeById, onSelectNode]);

  // Focus the node's label field when editing begins. Keyed on the id only, so
  // it doesn't re-`select()` on every keystroke — which selected all text and
  // made each typed character replace the previous one.
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Focus the connector's label field when an edge is freshly selected so it can
  // be typed immediately (mirrors the node inline-edit pattern). Keyed on the id
  // only, so it doesn't steal focus on every keystroke / control click.
  useEffect(() => {
    if (selectedEdgeId && edgeInputRef.current) {
      edgeInputRef.current.focus();
      edgeInputRef.current.select();
    }
  }, [selectedEdgeId]);

  const beginEdit = useCallback(
    (id: string) => {
      if (!canEdit) {
        return;
      }
      const node = nodeById.get(id);
      if (!node) {
        return;
      }
      editStartLabel.current = node.label;
      setSelectedEdgeId(null);
      setActiveId(id);
      setEditingId(id);
    },
    [canEdit, nodeById],
  );

  // Selecting a connector opens its inline toolbar and clears any node edit.
  const selectEdge = useCallback(
    (id: string) => {
      if (!canEdit) {
        return;
      }
      const edge = edgeById.get(id);
      if (!edge) {
        return;
      }
      editStartEdgeLabel.current = edge.label ?? "";
      setEditingId(null);
      setActiveId(null);
      setSelectedId(null);
      setSelectedEdgeId(id);
    },
    [canEdit, edgeById],
  );

  const removeNode = useCallback(
    (id: string) => {
      if (!canEdit || visual.nodes.length <= 1) {
        return;
      }
      setEditingId((current) => (current === id ? null : current));
      setActiveId((current) => (current === id ? null : current));
      setHoverId((current) => (current === id ? null : current));
      setSelectedId((current) => (current === id ? null : current));
      onChange(deleteNode(visual, id));
    },
    [canEdit, visual, onChange],
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    dragRef.current = null;
    svgRef.current?.releasePointerCapture?.(event.pointerId);
  }, []);

  const onNodePointerDown = useCallback(
    (event: React.PointerEvent, node: VisualNode) => {
      if (!canEdit || editingId) {
        return;
      }
      event.preventDefault();
      setActiveId(node.id);
      setSelectedId(node.id);
      setSelectedEdgeId(null);
      const box = boxes.get(node.id);
      if (!box) {
        return;
      }
      dragRef.current = {
        id: node.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startCenterX: box.x,
        startCenterY: box.y,
        positioned,
        moved: false,
      };
      svgRef.current?.setPointerCapture?.(event.pointerId);
    },
    [boxes, canEdit, editingId, positioned],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg) {
        return;
      }
      const dxClient = event.clientX - drag.startClientX;
      const dyClient = event.clientY - drag.startClientY;
      if (!drag.moved && Math.hypot(dxClient, dyClient) > CLICK_THRESHOLD) {
        drag.moved = true;
      }
      if (!drag.positioned || !drag.moved) {
        return;
      }
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const nextX = clamp(
        drag.startCenterX + dxClient * (visual.width / rect.width),
        0,
        visual.width,
      );
      const nextY = clamp(
        drag.startCenterY + dyClient * (visual.height / rect.height),
        0,
        visual.height,
      );
      onChange(setNodePosition(visual, drag.id, nextX, nextY));
    },
    [onChange, visual],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      endDrag(event);
      // A plain click only selects. A second click on the same node within the
      // double-click window opens inline editing.
      if (drag && !drag.moved) {
        const now = Date.now();
        const last = lastClickRef.current;
        if (last && last.id === drag.id && now - last.time < 350) {
          lastClickRef.current = null;
          beginEdit(drag.id);
        } else {
          lastClickRef.current = { id: drag.id, time: now };
        }
      }
    },
    [beginEdit, endDrag],
  );

  const onInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        setEditingId(null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (editingId) {
          onChange(setNodeLabel(visual, editingId, editStartLabel.current));
        }
        setEditingId(null);
      }
    },
    [editingId, onChange, visual],
  );

  const onNodeKeyDown = useCallback(
    (event: React.KeyboardEvent, node: VisualNode) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        beginEdit(node.id);
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        canDelete
      ) {
        event.preventDefault();
        removeNode(node.id);
      }
    },
    [beginEdit, canDelete, removeNode],
  );

  const onEdgeInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        setSelectedEdgeId(null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (selectedEdgeId) {
          onChange(
            setEdgeLabel(visual, selectedEdgeId, editStartEdgeLabel.current),
          );
        }
        setSelectedEdgeId(null);
      }
    },
    [onChange, selectedEdgeId, visual],
  );

  const onEdgeKeyDown = useCallback(
    (event: React.KeyboardEvent, id: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectEdge(id);
      }
    },
    [selectEdge],
  );

  // Clicking the empty canvas commits any inline edit and clears selection.
  const onBackgroundPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.target === event.currentTarget) {
      setActiveId(null);
      setEditingId(null);
      setSelectedId(null);
      setSelectedEdgeId(null);
    }
  }, []);

  function renderDeleteButton(id: string) {
    const box = boxes.get(id);
    const node = nodeById.get(id);
    if (!box || !node) {
      return null;
    }
    const cx = clamp(box.x + box.width / 2, 12, visual.width - 12);
    const cy = clamp(box.y - box.height / 2, 12, visual.height - 12);
    const r = 11;
    return (
      <g
        role="button"
        aria-label={`Delete ${node.label || "node"}`}
        tabIndex={0}
        className="cursor-pointer"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          removeNode(id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            removeNode(id);
          }
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="#ef4444"
          stroke="#ffffff"
          strokeWidth={1.5}
        />
        <line
          x1={cx - 4}
          y1={cy - 4}
          x2={cx + 4}
          y2={cy + 4}
          stroke="#ffffff"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <line
          x1={cx + 4}
          y1={cy - 4}
          x2={cx - 4}
          y2={cy + 4}
          stroke="#ffffff"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </g>
    );
  }

  function renderEditingInput(node: VisualNode, box: NodeBox) {
    const fx = clamp(box.x - box.width / 2, 0, visual.width);
    const fw = Math.max(40, Math.min(box.width, visual.width - fx));
    // Match the renderer's text centre. When the node has an icon, the label is
    // stacked below it (not centred on the node), so the input must sit there
    // too — otherwise the text jumps up when entering edit mode.
    const fontSize = visual.style.fontSize;
    const Icon = node.icon ? resolveIconComponent(node.icon) : null;
    const lineHeight = fontSize * 1.2;
    const iconSize = Icon
      ? clamp(Math.min(box.height * 0.4, fontSize * 1.6), 14, 30)
      : 0;
    const iconGap = Icon ? Math.max(2, fontSize * 0.2) : 0;
    const blockTop = box.y - (iconSize + iconGap + lineHeight) / 2;
    const textCy = Icon
      ? blockTop + iconSize + iconGap + lineHeight / 2
      : box.y;
    const fy = clamp(
      textCy - INPUT_HEIGHT / 2,
      0,
      visual.height - INPUT_HEIGHT,
    );
    return (
      <foreignObject x={fx} y={fy} width={fw} height={INPUT_HEIGHT}>
        <input
          ref={inputRef}
          aria-label="Node label"
          value={node.label}
          onChange={(event) =>
            onChange(setNodeLabel(visual, node.id, event.target.value))
          }
          onKeyDown={onInputKeyDown}
          onBlur={() => setEditingId(null)}
          onPointerDown={(event) => event.stopPropagation()}
          className="h-full w-full border-0 bg-transparent p-0 leading-none caret-current outline-none"
          style={{
            color: node.textColor ?? visual.style.nodeText,
            fontSize: visual.style.fontSize,
            fontWeight: visual.style.fontWeight,
            fontFamily: node.fontFamily ?? visual.style.fontFamily,
            textAlign: node.textAlign ?? "center",
          }}
        />
      </foreignObject>
    );
  }

  function renderEdgeHitAreas() {
    return visual.edges.map((edge) => {
      const seg = segments.get(edge.id);
      if (!seg) {
        return null;
      }
      const isActive = selectedEdgeId === edge.id || hoverEdgeId === edge.id;
      return (
        <g key={edge.id}>
          {isActive ? (
            <line
              x1={seg.start.x}
              y1={seg.start.y}
              x2={seg.end.x}
              y2={seg.end.y}
              stroke="#6366f1"
              strokeWidth={3}
              strokeLinecap="round"
              pointerEvents="none"
            />
          ) : null}
          <line
            data-edge-id={edge.id}
            role="button"
            aria-label={`Edit connector ${edge.label || "connector"}`}
            tabIndex={0}
            x1={seg.start.x}
            y1={seg.start.y}
            x2={seg.end.x}
            y2={seg.end.y}
            stroke="transparent"
            strokeWidth={EDGE_HIT_WIDTH}
            strokeLinecap="round"
            pointerEvents="stroke"
            className="cursor-pointer outline-none"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              selectEdge(edge.id);
            }}
            onPointerEnter={() => setHoverEdgeId(edge.id)}
            onPointerLeave={() =>
              setHoverEdgeId((current) =>
                current === edge.id ? null : current,
              )
            }
            onFocus={() => setHoverEdgeId(edge.id)}
            onBlur={() =>
              setHoverEdgeId((current) =>
                current === edge.id ? null : current,
              )
            }
            onKeyDown={(event) => onEdgeKeyDown(event, edge.id)}
          />
        </g>
      );
    });
  }

  function renderEdgeToolbar(edge: VisualEdge, seg: EdgeSegment) {
    const fx = clamp(
      seg.mid.x - EDGE_TOOLBAR_WIDTH / 2,
      4,
      Math.max(4, visual.width - EDGE_TOOLBAR_WIDTH - 4),
    );
    const fy = clamp(
      seg.mid.y - EDGE_TOOLBAR_HEIGHT / 2,
      4,
      Math.max(4, visual.height - EDGE_TOOLBAR_HEIGHT - 4),
    );
    const directedOn = edge.directed !== false;
    const curvedOn = edge.style === "curved";
    return (
      <foreignObject
        x={fx}
        y={fy}
        width={EDGE_TOOLBAR_WIDTH}
        height={EDGE_TOOLBAR_HEIGHT}
      >
        <div
          className="flex h-full w-full items-center gap-1 rounded-lg border border-ds-border-subtle bg-ds-surface-overlay px-1.5 shadow-ds-raised"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            ref={edgeInputRef}
            aria-label="Connector label"
            placeholder="Label"
            value={edge.label ?? ""}
            onChange={(event) =>
              onChange(setEdgeLabel(visual, edge.id, event.target.value))
            }
            onKeyDown={onEdgeInputKeyDown}
            className="h-7 min-w-0 flex-1 rounded-md border border-ds-border-strong bg-ds-surface-raised px-2 text-sm text-ds-text-primary outline-none"
          />
          <button
            type="button"
            aria-label="Flip connector direction"
            title="Flip direction"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onChange(flipEdge(visual, edge.id))}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ds-border-subtle text-base text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
          >
            ⇄
          </button>
          <button
            type="button"
            aria-label={directedOn ? "Hide arrowhead" : "Show arrowhead"}
            aria-pressed={directedOn}
            title={directedOn ? "Hide arrowhead" : "Show arrowhead"}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onChange(toggleEdgeDirected(visual, edge.id))}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-base hover:opacity-90 ${
              directedOn
                ? "border-ds-accent bg-ds-accent text-ds-accent-contrast"
                : "border-ds-border-subtle text-ds-text-secondary"
            }`}
          >
            →
          </button>
          <button
            type="button"
            aria-label={
              curvedOn ? "Use straight connector" : "Use curved connector"
            }
            aria-pressed={curvedOn}
            title={curvedOn ? "Straight line" : "Curved line"}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onChange(toggleEdgeStyle(visual, edge.id))}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-base hover:opacity-90 ${
              curvedOn
                ? "border-ds-accent bg-ds-accent text-ds-accent-contrast"
                : "border-ds-border-subtle text-ds-text-secondary"
            }`}
          >
            ⌒
          </button>
        </div>
      </foreignObject>
    );
  }

  return (
    <div className="relative w-full max-w-3xl">
      <VisualRenderer
        ref={rendererRef}
        visual={displayVisual}
        className="block h-auto w-full select-none"
      />
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${overlayViewBox.x} ${overlayViewBox.y} ${overlayViewBox.width} ${overlayViewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
      >
        {/* Edge hit-areas render first so node hit-boxes take pointer
            precedence wherever they overlap near a node boundary. */}
        {renderEdgeHitAreas()}

        {visual.nodes.map((node) => {
          const box = boxes.get(node.id);
          if (!box) {
            return null;
          }
          const isActive =
            activeId === node.id ||
            hoverId === node.id ||
            selectedId === node.id;
          const isEditing = editingId === node.id;
          return (
            <g key={node.id}>
              <rect
                data-node-id={node.id}
                role="button"
                aria-label={`Edit ${node.label || "node"}`}
                tabIndex={0}
                x={box.x - box.width / 2}
                y={box.y - box.height / 2}
                width={box.width}
                height={box.height}
                rx={10}
                fill="transparent"
                stroke={isActive && !isEditing ? "#6366f1" : "transparent"}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                pointerEvents="all"
                className={positioned ? "cursor-move" : "cursor-text"}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                onPointerEnter={() => {
                  setHoverId(node.id);
                  setActiveId(node.id);
                }}
                onFocus={() => {
                  setActiveId(node.id);
                  setSelectedId(node.id);
                }}
                onPointerLeave={() =>
                  setHoverId((current) =>
                    current === node.id ? null : current,
                  )
                }
                onKeyDown={(event) => onNodeKeyDown(event, node)}
              />
            </g>
          );
        })}

        {deletableId ? renderDeleteButton(deletableId) : null}

        {editingNode && boxes.get(editingNode.id)
          ? renderEditingInput(editingNode, boxes.get(editingNode.id)!)
          : null}

        {/* The selected connector's inline toolbar renders last so it sits
            above every hit-area and is fully clickable. */}
        {selectedEdge && selectedEdgeSeg
          ? renderEdgeToolbar(selectedEdge, selectedEdgeSeg)
          : null}
      </svg>
    </div>
  );
}
