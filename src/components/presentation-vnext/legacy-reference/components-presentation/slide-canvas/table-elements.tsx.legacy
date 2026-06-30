import type { JSX } from "react";

import type { TableElement, TextRun } from "@/lib/presentation/deck";
import type { ResolvedElementDesign } from "@/lib/presentation/slide-render-model";

import { boxStyle, renderRuns } from "./primitives";

type ResolvedTableDesign = Extract<ResolvedElementDesign, { kind: "table" }>;

function CellText({
  runs,
  text,
}: {
  runs?: TextRun[];
  text: string;
}): JSX.Element {
  if (runs && runs.length > 0) {
    return <>{renderRuns(runs)}</>;
  }
  return <>{text || "\u00a0"}</>;
}

export function TableElementView({
  element,
  resolvedDesign,
}: {
  element: TableElement;
  resolvedDesign?: ResolvedTableDesign;
}): JSX.Element {
  const style = resolvedDesign?.tableStyle;
  const headerFill = style?.headerFill ?? "#111827";
  const rowFill = style?.rowFill ?? "#ffffff";
  const alternateRowFill = style?.alternateRowFill ?? "#f8fafc";
  const borderColor = style?.borderColor ?? "#cbd5e1";
  const borderWidth = style?.borderWidth ?? 0.14;
  const textStyle = style?.textStyle;
  const headerTextStyle = style?.headerTextStyle;
  const columns = element.content.columns;
  const totalWidth = columns.reduce(
    (sum, column) => sum + (column.width ?? 1),
    0,
  );
  const templateColumns = columns
    .map((column) => `${((column.width ?? 1) / totalWidth).toFixed(4)}fr`)
    .join(" ");

  return (
    <figure
      aria-label={
        element.content.caption ? `Table: ${element.content.caption}` : "Table"
      }
      style={{
        ...boxStyle(element),
        display: "flex",
        flexDirection: "column",
        margin: 0,
        overflow: "hidden",
        color: textStyle?.color ?? "#111827",
        fontFamily: textStyle?.fontFamily,
        fontSize: `${textStyle?.fontSize ?? 10}cqh`,
        lineHeight: textStyle?.lineHeight ?? 1.18,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: templateColumns,
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
          border: `${borderWidth}cqmin solid ${borderColor}`,
          borderRadius: "0.5cqmin",
          backgroundColor: rowFill,
        }}
      >
        {element.content.header
          ? columns.map((column, columnIndex) => (
              <div
                key={`header:${column.id}`}
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  padding: "0.7cqh 0.8cqw",
                  backgroundColor: headerFill,
                  color: headerTextStyle?.color ?? "#ffffff",
                  fontFamily:
                    headerTextStyle?.fontFamily ?? textStyle?.fontFamily,
                  fontSize: `${headerTextStyle?.fontSize ?? textStyle?.fontSize ?? 10}cqh`,
                  fontWeight: headerTextStyle ? headerTextStyle.weight : 700,
                  fontStyle: headerTextStyle?.italic ? "italic" : "normal",
                  textDecoration: headerTextStyle?.underline
                    ? "underline"
                    : undefined,
                  textAlign:
                    headerTextStyle?.align ?? textStyle?.align ?? "left",
                  borderRight:
                    columnIndex < columns.length - 1
                      ? `${borderWidth}cqmin solid ${borderColor}`
                      : undefined,
                  borderBottom: `${borderWidth}cqmin solid ${borderColor}`,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
                title={column.label}
              >
                {column.label || "\u00a0"}
              </div>
            ))
          : null}
        {element.content.rows.flatMap((row, rowIndex) =>
          row.cells.map((cell, columnIndex) => (
            <div
              key={`${row.id}:${columns[columnIndex]?.id ?? columnIndex}`}
              style={{
                minWidth: 0,
                overflow: "hidden",
                padding: "0.65cqh 0.8cqw",
                backgroundColor:
                  rowIndex % 2 === 1 ? alternateRowFill : rowFill,
                color: textStyle?.color ?? "#111827",
                fontWeight: textStyle?.weight ?? 400,
                fontStyle: textStyle?.italic ? "italic" : "normal",
                textDecoration: textStyle?.underline ? "underline" : undefined,
                textAlign: textStyle?.align ?? "left",
                borderRight:
                  columnIndex < columns.length - 1
                    ? `${borderWidth}cqmin solid ${borderColor}`
                    : undefined,
                borderBottom:
                  rowIndex < element.content.rows.length - 1
                    ? `${borderWidth}cqmin solid ${borderColor}`
                    : undefined,
                whiteSpace: "normal",
                overflowWrap: "break-word",
              }}
              title={cell.text}
            >
              <CellText runs={cell.runs} text={cell.text} />
            </div>
          )),
        )}
      </div>
      {element.content.caption ? (
        <figcaption
          style={{
            flex: "0 0 auto",
            marginTop: "0.55cqh",
            color: textStyle?.color ?? "#475569",
            fontSize: `${Math.max(0.8, (textStyle?.fontSize ?? 10) * 0.8)}cqh`,
            fontFamily: textStyle?.fontFamily,
            lineHeight: 1.15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {element.content.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
