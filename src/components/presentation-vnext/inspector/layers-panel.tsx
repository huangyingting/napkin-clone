"use client";

import { Eye, EyeOff, GripVertical, Lock, Unlock } from "lucide-react";
import { useState, type DragEvent, type JSX } from "react";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";

export interface LayersPanelProps {
  nodes: readonly SlideChildNode[];
  selectedIds: readonly string[];
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (
    nodeId: string,
    patch: { locked?: boolean; hidden?: boolean },
  ) => void;
  onReorderNode?: (nodeId: string, targetIndex: number) => void;
}

export function layerLabel(node: SlideChildNode): string {
  if (node.name) return node.name;
  if (node.type === "text") {
    const text = node.content.paragraphs[0]?.text.trim();
    return text || "Text";
  }
  if (node.type === "shape") return `${node.content.shape} shape`;
  if (node.type === "image") return node.content.alt ?? "Image";
  if (node.type === "visual") return node.content.visualId ?? "Visual";
  if (node.type === "table") return "Table";
  if (node.type === "connector") return "Connector";
  return "Group";
}

export function flattenLayers(
  nodes: readonly SlideChildNode[],
  depth = 0,
): { node: SlideChildNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(node.type === "group" ? flattenLayers(node.children, depth + 1) : []),
  ]);
}

export function LayersPanel({
  nodes,
  selectedIds,
  onSelectNode,
  onUpdateNode,
  onReorderNode,
}: LayersPanelProps): JSX.Element | null {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const layers = flattenLayers(nodes).sort(
    (a, b) => (b.node.layout?.zIndex ?? 0) - (a.node.layout?.zIndex ?? 0),
  );
  if (layers.length === 0) return null;

  function handleDragStart(event: DragEvent<HTMLDivElement>, nodeId: string) {
    setDraggingId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId);
  }

  function handleDrop(index: number) {
    if (draggingId && onReorderNode) {
      onReorderNode(draggingId, index);
    }
    setDraggingId(null);
    setDropIndex(null);
  }

  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Layers
      </h4>
      <ul className="flex flex-col gap-1" role="list">
        {layers.map(({ node, depth }, index) => {
          const selected = selectedIds.includes(node.id);
          return (
            <li key={node.id}>
              <div
                draggable={onReorderNode !== undefined}
                onDragStart={(event) => handleDragStart(event, node.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropIndex(null);
                }}
                onDragOver={(event) => {
                  if (!draggingId || draggingId === node.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(index);
                }}
                className={`flex items-center gap-1 rounded-ds-sm border px-1.5 py-1 text-xs ${
                  selected
                    ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
                    : dropIndex === index
                      ? "border-ds-accent-border bg-ds-accent-surface/50 text-ds-text-secondary"
                      : "border-ds-border-subtle text-ds-text-secondary"
                }`}
                style={{ paddingLeft: `${6 + depth * 12}px` }}
              >
                <GripVertical
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-ds-text-muted"
                />
                <button
                  type="button"
                  onClick={() => onSelectNode(node.id)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {layerLabel(node)}
                </button>
                <button
                  type="button"
                  aria-label={node.hidden ? "Show layer" : "Hide layer"}
                  onClick={() =>
                    onUpdateNode(node.id, { hidden: !node.hidden })
                  }
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm hover:bg-ds-state-hover"
                >
                  {node.hidden ? (
                    <EyeOff size={12} aria-hidden="true" />
                  ) : (
                    <Eye size={12} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={node.locked ? "Unlock layer" : "Lock layer"}
                  onClick={() =>
                    onUpdateNode(node.id, { locked: !node.locked })
                  }
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm hover:bg-ds-state-hover"
                >
                  {node.locked ? (
                    <Lock size={12} aria-hidden="true" />
                  ) : (
                    <Unlock size={12} aria-hidden="true" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
