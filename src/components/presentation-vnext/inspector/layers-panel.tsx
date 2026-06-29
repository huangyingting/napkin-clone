"use client";

import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type { JSX } from "react";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";

export interface LayersPanelProps {
  nodes: readonly SlideChildNode[];
  selectedIds: readonly string[];
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (
    nodeId: string,
    patch: { locked?: boolean; hidden?: boolean },
  ) => void;
}

function layerLabel(node: SlideChildNode): string {
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

function flattenLayers(
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
}: LayersPanelProps): JSX.Element | null {
  const layers = flattenLayers(nodes).sort(
    (a, b) => (b.node.layout?.zIndex ?? 0) - (a.node.layout?.zIndex ?? 0),
  );
  if (layers.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Layers
      </h4>
      <ul className="flex flex-col gap-1" role="list">
        {layers.map(({ node, depth }) => {
          const selected = selectedIds.includes(node.id);
          return (
            <li key={node.id}>
              <div
                className={`flex items-center gap-1 rounded-ds-sm border px-1.5 py-1 text-xs ${
                  selected
                    ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
                    : "border-ds-border-subtle text-ds-text-secondary"
                }`}
                style={{ paddingLeft: `${6 + depth * 12}px` }}
              >
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
