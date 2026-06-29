"use client";

import type { JSX } from "react";

import type {
  ConnectorContent,
  ShapeKind,
  SlideChildNode,
  TableContent,
  TextContent,
} from "@/lib/presentation-vnext/schema";
import { FOCUS_RING } from "@/components/ui/tokens";

export interface NodeContentPanelProps {
  node: SlideChildNode;
  onUpdateContent: (patch: Record<string, unknown>) => void;
}

const SHAPE_OPTIONS: ShapeKind[] = [
  "rect",
  "ellipse",
  "line",
  "triangle",
  "diamond",
  "circle",
  "square",
];

function textValue(content: TextContent): string {
  return content.paragraphs.map((paragraph) => paragraph.text).join("\n");
}

function textContentFromValue(value: string, idPrefix: string): TextContent {
  const lines = value.split("\n");
  return {
    paragraphs: lines.map((text, index) => ({
      id: `${idPrefix}-p-${index + 1}`,
      text,
    })),
  };
}

function updateTableCell(
  table: TableContent,
  rowIndex: number,
  cellIndex: number,
  text: string,
): TableContent {
  return {
    ...table,
    rows: table.rows.map((row, currentRowIndex) =>
      currentRowIndex === rowIndex
        ? {
            ...row,
            cells: row.cells.map((cell, currentCellIndex) =>
              currentCellIndex === cellIndex ? { ...cell, text } : cell,
            ),
          }
        : row,
    ),
  };
}

function updateConnectorPoint(
  content: ConnectorContent,
  side: "from" | "to",
  axis: "x" | "y",
  value: number,
): ConnectorContent {
  const endpoint = content[side];
  if (endpoint.kind !== "point") return content;
  return {
    ...content,
    [side]: {
      ...endpoint,
      point: { ...endpoint.point, [axis]: value },
    },
  };
}

export function NodeContentPanel({
  node,
  onUpdateContent,
}: NodeContentPanelProps): JSX.Element {
  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Content
      </h4>
      {node.type === "text" ? (
        <textarea
          value={textValue(node.content)}
          rows={5}
          onChange={(event) =>
            onUpdateContent(
              textContentFromValue(event.currentTarget.value, node.id),
            )
          }
          className={`min-h-24 w-full resize-y rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        />
      ) : null}
      {node.type === "shape" ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Shape
            <select
              value={node.content.shape}
              onChange={(event) =>
                onUpdateContent({
                  shape: event.currentTarget.value as ShapeKind,
                })
              }
              className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            >
              {SHAPE_OPTIONS.map((shape) => (
                <option key={shape} value={shape}>
                  {shape}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Label
            <textarea
              value={node.content.text ? textValue(node.content.text) : ""}
              rows={3}
              onChange={(event) =>
                onUpdateContent({
                  text: textContentFromValue(
                    event.currentTarget.value,
                    `${node.id}-label`,
                  ),
                })
              }
              className={`w-full resize-y rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
        </>
      ) : null}
      {node.type === "image" ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Asset id
            <input
              value={node.content.assetId}
              onChange={(event) =>
                onUpdateContent({ assetId: event.currentTarget.value })
              }
              className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 font-mono text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Alt text
            <input
              value={node.content.alt ?? ""}
              onChange={(event) =>
                onUpdateContent({ alt: event.currentTarget.value })
              }
              className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
        </>
      ) : null}
      {node.type === "visual" ? (
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Visual id
          <input
            value={node.content.visualId ?? ""}
            onChange={(event) =>
              onUpdateContent({ visualId: event.currentTarget.value })
            }
            className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 font-mono text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
          />
        </label>
      ) : null}
      {node.type === "table" ? (
        <div className="flex flex-col gap-2">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${node.content.columns.length}, minmax(0, 1fr))`,
            }}
          >
            {node.content.columns.map((column, columnIndex) => (
              <input
                key={column.id}
                value={column.label}
                aria-label={`Column ${columnIndex + 1} label`}
                onChange={(event) =>
                  onUpdateContent({
                    columns: node.content.columns.map(
                      (candidate, currentIndex) =>
                        currentIndex === columnIndex
                          ? { ...candidate, label: event.currentTarget.value }
                          : candidate,
                    ),
                  })
                }
                className={`min-w-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1.5 py-1 text-[11px] font-medium text-ds-text-primary outline-none ${FOCUS_RING}`}
              />
            ))}
          </div>
          {node.content.rows.map((row, rowIndex) => (
            <div
              key={row.id}
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${node.content.columns.length}, minmax(0, 1fr))`,
              }}
            >
              {row.cells.map((cell, cellIndex) => (
                <input
                  key={`${row.id}-${cellIndex}`}
                  value={cell.text}
                  aria-label={`Row ${rowIndex + 1} cell ${cellIndex + 1}`}
                  onChange={(event) =>
                    onUpdateContent(
                      updateTableCell(
                        node.content,
                        rowIndex,
                        cellIndex,
                        event.currentTarget.value,
                      ),
                    )
                  }
                  className={`min-w-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1.5 py-1 text-[11px] text-ds-text-primary outline-none ${FOCUS_RING}`}
                />
              ))}
            </div>
          ))}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateContent({
                  rows: [
                    ...node.content.rows,
                    {
                      id: `${node.id}-row-${node.content.rows.length + 1}`,
                      cells: node.content.columns.map(() => ({ text: "" })),
                    },
                  ],
                })
              }
              className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover"
            >
              Add row
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateContent({
                  columns: [
                    ...node.content.columns,
                    {
                      id: `${node.id}-col-${node.content.columns.length + 1}`,
                      label: `Column ${node.content.columns.length + 1}`,
                    },
                  ],
                  rows: node.content.rows.map((row) => ({
                    ...row,
                    cells: [...row.cells, { text: "" }],
                  })),
                })
              }
              className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover"
            >
              Add column
            </button>
          </div>
        </div>
      ) : null}
      {node.type === "connector" ? (
        <div className="grid grid-cols-2 gap-2">
          {(["from", "to"] as const).map((side) => {
            const endpoint = node.content[side];
            return endpoint.kind === "point" ? (
              <div key={side} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ds-text-secondary">
                  {side}
                </span>
                <input
                  type="number"
                  value={endpoint.point.x}
                  min={0}
                  max={100}
                  step={1}
                  aria-label={`${side} x`}
                  onChange={(event) =>
                    onUpdateContent(
                      updateConnectorPoint(
                        node.content,
                        side,
                        "x",
                        Number(event.currentTarget.value),
                      ),
                    )
                  }
                  className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
                />
                <input
                  type="number"
                  value={endpoint.point.y}
                  min={0}
                  max={100}
                  step={1}
                  aria-label={`${side} y`}
                  onChange={(event) =>
                    onUpdateContent(
                      updateConnectorPoint(
                        node.content,
                        side,
                        "y",
                        Number(event.currentTarget.value),
                      ),
                    )
                  }
                  className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
                />
              </div>
            ) : (
              <p key={side} className="text-xs text-ds-text-secondary">
                {side}: {endpoint.nodeId} / {endpoint.anchor}
              </p>
            );
          })}
        </div>
      ) : null}
      {node.type === "group" ? (
        <p className="text-xs text-ds-text-secondary">
          Group children are edited on the stage.
        </p>
      ) : null}
    </section>
  );
}
