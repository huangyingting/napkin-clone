"use client";

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Unlock,
} from "lucide-react";
import { useState, type DragEvent, type JSX } from "react";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";
import type { ResolvedRenderNode } from "@/lib/presentation-vnext/render-tree";

export interface LayersPanelProps {
  nodes: readonly SlideChildNode[];
  decorations?: readonly ResolvedRenderNode[];
  chrome?: readonly ResolvedRenderNode[];
  selectedIds: readonly string[];
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (
    nodeId: string,
    patch: { locked?: boolean; hidden?: boolean },
  ) => void;
  onReorderNode?: (nodeId: string, targetIndex: number) => void;
}

type LayerItem = {
  id: string;
  label: string;
  depth: number;
  zIndex: number;
  source: "user" | "themeDecoration" | "deckChrome";
  editable: boolean;
  node?: SlideChildNode;
};

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

function generatedLayerLabel(node: ResolvedRenderNode): string {
  if (node.source === "deckChrome") {
    const kind = node.chromeKind ?? "deck chrome";
    return `Deck ${kind.replace(/([A-Z])/g, " $1").toLowerCase()}`;
  }
  if (node.content.type === "text") {
    const text = node.content.content.paragraphs[0]?.text.trim();
    return text ? `Theme decoration: ${text}` : "Theme decoration";
  }
  return `Theme ${node.content.type}`;
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

function flattenGeneratedLayers(
  nodes: readonly ResolvedRenderNode[],
  source: "themeDecoration" | "deckChrome",
  depth = 0,
): LayerItem[] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: generatedLayerLabel(node),
      depth,
      zIndex: node.layout.zIndex ?? 0,
      source,
      editable: false,
    },
    ...(node.children
      ? flattenGeneratedLayers(node.children, source, depth + 1)
      : []),
  ]);
}

function sourceBadge(source: LayerItem["source"]): string {
  if (source === "themeDecoration") return "Theme";
  if (source === "deckChrome") return "Chrome";
  return "User";
}

export function LayersPanel({
  nodes,
  decorations = [],
  chrome = [],
  selectedIds,
  onSelectNode,
  onUpdateNode,
  onReorderNode,
}: LayersPanelProps): JSX.Element | null {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const userLayers: LayerItem[] = flattenLayers(nodes).map(
    ({ node, depth }) => ({
      id: node.id,
      label: layerLabel(node),
      depth,
      zIndex: node.layout?.zIndex ?? 0,
      source: "user",
      editable: true,
      node,
    }),
  );
  const sortedUserLayers = [...userLayers].sort((a, b) => b.zIndex - a.zIndex);
  const userLayerIndexById = new Map(
    sortedUserLayers.map((item, index) => [item.id, index]),
  );
  const userLayersById = new Map(userLayers.map((item) => [item.id, item]));
  const layers = [
    ...userLayers,
    ...flattenGeneratedLayers(decorations, "themeDecoration"),
    ...flattenGeneratedLayers(chrome, "deckChrome"),
  ].sort((a, b) => b.zIndex - a.zIndex);
  if (layers.length === 0) return null;

  function handleReorder(nodeId: string, targetIndex: number) {
    if (!onReorderNode || sortedUserLayers.length === 0) return;
    const nextIndex = Math.max(
      0,
      Math.min(targetIndex, sortedUserLayers.length - 1),
    );
    onReorderNode(nodeId, nextIndex);
    const movedLayer = userLayersById.get(nodeId);
    const label = movedLayer?.label ?? "Layer";
    setStatusMessage(
      `Moved ${label} to position ${nextIndex + 1} of ${sortedUserLayers.length}.`,
    );
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, item: LayerItem) {
    if (!item.editable || !onReorderNode || item.node?.layout === undefined)
      return;
    setDraggingId(item.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  }

  function handleDrop(item: LayerItem) {
    const targetIndex = userLayerIndexById.get(item.id);
    if (
      draggingId &&
      draggingId !== item.id &&
      item.editable &&
      targetIndex !== undefined &&
      onReorderNode
    ) {
      handleReorder(draggingId, targetIndex);
    }
    setDraggingId(null);
    setDropIndex(null);
  }

  function handleMove(item: LayerItem, direction: "forward" | "backward") {
    const currentIndex = userLayerIndexById.get(item.id);
    if (currentIndex === undefined) return;
    const targetIndex =
      direction === "forward" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedUserLayers.length) return;
    handleReorder(item.id, targetIndex);
  }

  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </div>
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Layers
      </h4>
      <ul className="flex flex-col gap-1" role="list">
        {layers.map((item, index) => {
          const selected = selectedIds.includes(item.id);
          const node = item.node;
          const editable = item.editable && node !== undefined;
          const reorderable =
            editable &&
            onReorderNode !== undefined &&
            node.layout !== undefined;
          const currentUserIndex =
            editable && reorderable
              ? userLayerIndexById.get(item.id)
              : undefined;
          const canMoveForward =
            currentUserIndex !== undefined && currentUserIndex > 0;
          const canMoveBackward =
            currentUserIndex !== undefined &&
            currentUserIndex < sortedUserLayers.length - 1;
          return (
            <li key={`${item.source}-${item.id}`}>
              <div
                data-layer-source={item.source}
                draggable={reorderable}
                onDragStart={(event) => handleDragStart(event, item)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropIndex(null);
                }}
                onDragOver={(event) => {
                  if (!draggingId || draggingId === item.id || !editable)
                    return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(item);
                }}
                className={`flex items-center gap-1 rounded-ds-sm border px-1.5 py-1 text-xs ${
                  selected
                    ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
                    : dropIndex === index
                      ? "border-ds-accent-border bg-ds-accent-surface/50 text-ds-text-secondary"
                      : "border-ds-border-subtle text-ds-text-secondary"
                }`}
                style={{ paddingLeft: `${6 + item.depth * 12}px` }}
              >
                {editable ? (
                  <GripVertical
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-ds-text-muted"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full bg-ds-surface-2"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelectNode(item.id)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {item.label}
                </button>
                <span className="rounded-ds-sm bg-ds-surface-2 px-1.5 py-0.5 text-[10px] text-ds-text-muted">
                  {sourceBadge(item.source)}
                </span>
                {reorderable ? (
                  <>
                    <button
                      type="button"
                      aria-label="Move layer forward"
                      disabled={!canMoveForward}
                      onClick={() => handleMove(item, "forward")}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm hover:bg-ds-state-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronUp size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move layer backward"
                      disabled={!canMoveBackward}
                      onClick={() => handleMove(item, "backward")}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm hover:bg-ds-state-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronDown size={12} aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {editable ? (
                  <>
                    <button
                      type="button"
                      aria-label={node.hidden ? "Show layer" : "Hide layer"}
                      onClick={() =>
                        onUpdateNode(item.id, { hidden: !node.hidden })
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
                        onUpdateNode(item.id, { locked: !node.locked })
                      }
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm hover:bg-ds-state-hover"
                    >
                      {node.locked ? (
                        <Lock size={12} aria-hidden="true" />
                      ) : (
                        <Unlock size={12} aria-hidden="true" />
                      )}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
