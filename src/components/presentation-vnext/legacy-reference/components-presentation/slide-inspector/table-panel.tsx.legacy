"use client";

import { Minus, Plus } from "lucide-react";

import { ColorPicker } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import type {
  Deck,
  Slide,
  TableCell,
  TableElement,
  TableElementStyle,
  TextElementStyle,
} from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { resolveSlideTokenSet } from "@/lib/presentation/style-cascade";

import { FIELD_CLASS, PanelSection, PropRow } from "./primitives";
import {
  HorizontalAlignControl,
  TextEmphasisControl,
  TextSizeColorControl,
} from "./text-style-controls";
import type { SlideInspectorProps } from "./types";

const MAX_COLUMNS = 8;
const MAX_ROWS = 20;

const DEFAULT_TEXT_STYLE: TextElementStyle = {
  fontSize: 2.2,
  bold: false,
  italic: false,
  align: "left",
};

const DEFAULT_HEADER_TEXT_STYLE: TextElementStyle = {
  fontSize: 2.2,
  bold: true,
  italic: false,
  align: "left",
};

function nextStableId(prefix: string, ids: readonly string[]): string {
  let index = 1;
  const used = new Set(ids);
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function colorRefValue(
  ref: { token: string } | { value: string } | undefined,
  colors: Record<string, string>,
  fallback: string,
): string {
  if (!ref) return fallback;
  if ("value" in ref) return ref.value;
  return colors[ref.token] ?? fallback;
}

function textStyleValue(
  style: Partial<TextElementStyle> | undefined,
  fallback: TextElementStyle,
): TextElementStyle {
  return { ...fallback, ...style };
}

export function TablePanel({
  element,
  deck,
  slide,
  onUpdateElement,
}: {
  element: TableElement;
  deck: Deck;
  slide: Slide;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const tokenSet = resolveSlideTokenSet(deck, slide);
  const table = element.content;
  const style = element.designOverrides?.tableStyle ?? {};

  function patchContent(content: TableElement["content"]) {
    onUpdateElement(element.id, { content } as ElementPatch);
  }

  function patchStyle(nextStyle: TableElementStyle) {
    onUpdateElement(element.id, {
      designOverrides: {
        ...element.designOverrides,
        tableStyle: nextStyle,
      },
    } as ElementPatch);
  }

  function updateCell(rowIndex: number, columnIndex: number, text: string) {
    patchContent({
      ...table,
      rows: table.rows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? {
              ...row,
              cells: row.cells.map((cell, currentColumnIndex) =>
                currentColumnIndex === columnIndex
                  ? ({ text } satisfies TableCell)
                  : cell,
              ),
            }
          : row,
      ),
    });
  }

  function addColumn() {
    if (table.columns.length >= MAX_COLUMNS) return;
    const nextId = nextStableId(
      "col",
      table.columns.map((column) => column.id),
    );
    patchContent({
      ...table,
      columns: [...table.columns, { id: nextId, label: "Column" }],
      rows: table.rows.map((row) => ({
        ...row,
        cells: [...row.cells, { text: "" }],
      })),
    });
  }

  function removeColumn(index: number) {
    if (table.columns.length <= 1) return;
    patchContent({
      ...table,
      columns: table.columns.filter(
        (_column, currentIndex) => currentIndex !== index,
      ),
      rows: table.rows.map((row) => ({
        ...row,
        cells: row.cells.filter(
          (_cell, currentIndex) => currentIndex !== index,
        ),
      })),
    });
  }

  function addRow() {
    if (table.rows.length >= MAX_ROWS) return;
    const nextId = nextStableId(
      "row",
      table.rows.map((row) => row.id),
    );
    patchContent({
      ...table,
      rows: [
        ...table.rows,
        {
          id: nextId,
          cells: table.columns.map(() => ({ text: "" })),
        },
      ],
    });
  }

  function removeRow(index: number) {
    if (table.rows.length <= 1) return;
    patchContent({
      ...table,
      rows: table.rows.filter((_row, currentIndex) => currentIndex !== index),
    });
  }

  const textStyle = textStyleValue(style.textStyle, DEFAULT_TEXT_STYLE);
  const headerTextStyle = textStyleValue(
    style.headerTextStyle,
    DEFAULT_HEADER_TEXT_STYLE,
  );
  const colors = tokenSet.colors as unknown as Record<string, string>;
  const headerFill = colorRefValue(
    style.headerFill,
    colors,
    tokenSet.colors.accent,
  );
  const rowFill = colorRefValue(style.rowFill, colors, tokenSet.colors.surface);
  const alternateRowFill = colorRefValue(
    style.alternateRowFill,
    colors,
    tokenSet.colors.slideBg,
  );

  return (
    <>
      <PanelSection title="Table content">
        <PropRow label="Caption">
          <input
            value={table.caption ?? ""}
            onChange={(event) =>
              patchContent({
                ...table,
                caption: event.target.value || undefined,
              })
            }
            className={`${FIELD_CLASS} ${FOCUS_RING}`}
            aria-label="Table caption"
          />
        </PropRow>
        <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
          <input
            type="checkbox"
            checked={table.header === true}
            onChange={(event) =>
              patchContent({
                ...table,
                header: event.target.checked ? true : undefined,
              })
            }
            className="accent-ds-accent"
          />
          Header row
        </label>
      </PanelSection>

      <PanelSection title="Columns">
        <div className="flex flex-col gap-1.5">
          {table.columns.map((column, index) => (
            <div
              key={column.id}
              className="grid grid-cols-[minmax(0,1fr)_2rem] gap-1.5"
            >
              <input
                value={column.label}
                onChange={(event) =>
                  patchContent({
                    ...table,
                    columns: table.columns.map((entry, currentIndex) =>
                      currentIndex === index
                        ? { ...entry, label: event.target.value }
                        : entry,
                    ),
                  })
                }
                className={`${FIELD_CLASS} ${FOCUS_RING}`}
                aria-label={`Column ${index + 1} label`}
              />
              <button
                type="button"
                disabled={table.columns.length <= 1}
                onClick={() => removeColumn(index)}
                className={`flex h-8 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
                aria-label={`Remove column ${index + 1}`}
              >
                <Minus size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={table.columns.length >= MAX_COLUMNS}
          onClick={addColumn}
          className={`inline-flex items-center justify-center gap-1 rounded-ds-md bg-ds-accent-surface px-2 py-1 text-xs font-semibold text-ds-accent-text ring-1 ring-ds-accent-border transition-colors hover:bg-ds-accent hover:text-ds-text-on-accent disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
        >
          <Plus size={13} aria-hidden="true" />
          Column
        </button>
      </PanelSection>

      <PanelSection title="Rows">
        <div className="flex max-h-72 flex-col gap-2 overflow-auto pr-1">
          {table.rows.map((row, rowIndex) => (
            <div
              key={row.id}
              className="rounded-ds-md bg-ds-surface-raised/60 p-2 ring-1 ring-ds-border-subtle"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
                  Row {rowIndex + 1}
                </span>
                <button
                  type="button"
                  disabled={table.rows.length <= 1}
                  onClick={() => removeRow(rowIndex)}
                  className={`flex h-6 w-6 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
                  aria-label={`Remove row ${rowIndex + 1}`}
                >
                  <Minus size={13} aria-hidden="true" />
                </button>
              </div>
              <div className="grid gap-1.5">
                {row.cells.map((cell, columnIndex) => (
                  <label
                    key={`${row.id}:${table.columns[columnIndex]?.id ?? columnIndex}`}
                    className="block"
                  >
                    <span className="mb-1 block text-[10px] font-medium text-ds-text-muted">
                      {table.columns[columnIndex]?.label ||
                        `Column ${columnIndex + 1}`}
                    </span>
                    <textarea
                      value={cell.text}
                      onChange={(event) =>
                        updateCell(rowIndex, columnIndex, event.target.value)
                      }
                      rows={2}
                      className={`${FIELD_CLASS} min-h-14 resize-y leading-5 ${FOCUS_RING}`}
                      aria-label={`Row ${rowIndex + 1} column ${columnIndex + 1}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={table.rows.length >= MAX_ROWS}
          onClick={addRow}
          className={`inline-flex items-center justify-center gap-1 rounded-ds-md bg-ds-accent-surface px-2 py-1 text-xs font-semibold text-ds-accent-text ring-1 ring-ds-accent-border transition-colors hover:bg-ds-accent hover:text-ds-text-on-accent disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
        >
          <Plus size={13} aria-hidden="true" />
          Row
        </button>
      </PanelSection>

      <PanelSection title="Table style">
        <PropRow label="Header">
          <ColorPicker
            color={headerFill}
            aria-label="Header fill"
            onChange={(hex) =>
              patchStyle({ ...style, headerFill: { value: hex } })
            }
          />
        </PropRow>
        <PropRow label="Rows">
          <ColorPicker
            color={rowFill}
            aria-label="Row fill"
            onChange={(hex) =>
              patchStyle({ ...style, rowFill: { value: hex } })
            }
          />
          <ColorPicker
            color={alternateRowFill}
            aria-label="Alternate row fill"
            onChange={(hex) =>
              patchStyle({ ...style, alternateRowFill: { value: hex } })
            }
          />
        </PropRow>
        <PropRow label="Border">
          <ColorPicker
            color={style.borderColor ?? tokenSet.colors.muted}
            aria-label="Table border color"
            onChange={(hex) => patchStyle({ ...style, borderColor: hex })}
          />
          <input
            type="number"
            min={0}
            step={0.05}
            value={style.borderWidth ?? 0.14}
            onChange={(event) =>
              patchStyle({
                ...style,
                borderWidth: Math.max(0, Number(event.target.value)),
              })
            }
            className={`w-16 text-right ${FIELD_CLASS} ${FOCUS_RING}`}
            aria-label="Table border width"
          />
        </PropRow>
      </PanelSection>

      <PanelSection title="Body text">
        <TextEmphasisControl
          style={textStyle}
          onChange={(next) => patchStyle({ ...style, textStyle: next })}
        />
        <TextSizeColorControl
          style={textStyle}
          inheritedColor={tokenSet.colors.onSurface}
          onChange={(next) => patchStyle({ ...style, textStyle: next })}
        />
        <HorizontalAlignControl
          style={textStyle}
          onChange={(next) => patchStyle({ ...style, textStyle: next })}
        />
      </PanelSection>

      <PanelSection title="Header text">
        <TextEmphasisControl
          style={headerTextStyle}
          onChange={(next) => patchStyle({ ...style, headerTextStyle: next })}
        />
        <TextSizeColorControl
          style={headerTextStyle}
          inheritedColor={tokenSet.colors.onAccent}
          onChange={(next) => patchStyle({ ...style, headerTextStyle: next })}
        />
        <HorizontalAlignControl
          style={headerTextStyle}
          onChange={(next) => patchStyle({ ...style, headerTextStyle: next })}
        />
      </PanelSection>
    </>
  );
}
