"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import {
  isPositionedKind,
  nodeBoxes,
  type NodeBox,
} from "@/components/visual/layout";
import type { Visual, VisualNode } from "@/lib/visual/schema";

/** Pointer travel (px) under which a press counts as a click, not a drag. */
const CLICK_THRESHOLD = 4;
const INPUT_HEIGHT = 34;

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
  const dragRef = useRef<DragState | null>(null);
  const editStartLabel = useRef<string>("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The node explicitly picked for styling (US-014). Distinct from `activeId`
  // (which also tracks hover) so the style panel targets a stable selection.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const positioned = isPositionedKind(visual.type);
  const boxes = useMemo(() => nodeBoxes(visual), [visual]);
  const nodeById = useMemo(
    () => new Map(visual.nodes.map((node) => [node.id, node])),
    [visual],
  );
  const canDelete = visual.nodes.length > 1;

  // Stale ids (after a regeneration swaps the visual) resolve to nothing.
  const editingNode = editingId ? nodeById.get(editingId) : undefined;
  const deletableId = !editingId && canDelete ? (hoverId ?? activeId) : null;

  // Report the current selection so the parent's style panel can target it.
  // A stale id (after a regeneration) reports as no selection.
  useEffect(() => {
    onSelectNode?.(selectedId && nodeById.has(selectedId) ? selectedId : null);
  }, [selectedId, nodeById, onSelectNode]);

  useEffect(() => {
    if (editingNode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingNode]);

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
      setActiveId(id);
      setEditingId(id);
    },
    [canEdit, nodeById],
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
      if (drag && !drag.moved) {
        beginEdit(drag.id);
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

  // Clicking the empty canvas commits any inline edit and clears selection.
  const onBackgroundPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.target === event.currentTarget) {
      setActiveId(null);
      setEditingId(null);
      setSelectedId(null);
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
    const fy = clamp(box.y - INPUT_HEIGHT / 2, 0, visual.height - INPUT_HEIGHT);
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
          className="h-full w-full rounded-md border border-zinc-900/50 bg-white px-2 text-center text-sm text-zinc-900 shadow-sm outline-none dark:border-white/50 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </foreignObject>
    );
  }

  return (
    <div className="relative w-full max-w-3xl">
      <VisualRenderer
        ref={rendererRef}
        visual={visual}
        className="block h-auto w-full select-none"
      />
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${visual.width} ${visual.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
      >
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
            <rect
              key={node.id}
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
                setHoverId((current) => (current === node.id ? null : current))
              }
              onKeyDown={(event) => onNodeKeyDown(event, node)}
            />
          );
        })}

        {deletableId ? renderDeleteButton(deletableId) : null}

        {editingNode && boxes.get(editingNode.id)
          ? renderEditingInput(editingNode, boxes.get(editingNode.id)!)
          : null}
      </svg>
    </div>
  );
}
