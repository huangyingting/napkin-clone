import type { VnextPptxTableOp } from "../pptx-export-adapter";
import type { PptxSlide } from "./shared";

export function applyVnextTableOp(
  slide: PptxSlide,
  op: VnextPptxTableOp,
): void {
  const { x, y, w, h, table, headerFill, rowFill, textStyle } = op;

  type PptxTableCell = { text: string; options?: Record<string, unknown> };

  const headerRow: PptxTableCell[] = table.columns.map((col) => ({
    text: col.label,
    options: {
      bold: true,
      ...(headerFill !== undefined ? { fill: { color: headerFill } } : {}),
      ...(textStyle?.fontSize !== undefined
        ? { fontSize: textStyle.fontSize }
        : {}),
      ...(textStyle?.fontFace !== undefined
        ? { fontFace: textStyle.fontFace }
        : {}),
    },
  }));

  const dataRows: PptxTableCell[][] = table.rows.map((row) =>
    row.cells.map((cell) => ({
      text: cell.text,
      options: {
        ...(rowFill !== undefined ? { fill: { color: rowFill } } : {}),
        ...(textStyle?.fontSize !== undefined
          ? { fontSize: textStyle.fontSize }
          : {}),
        ...(textStyle?.fontFace !== undefined
          ? { fontFace: textStyle.fontFace }
          : {}),
      },
    })),
  );

  slide.addTable(
    [headerRow, ...dataRows] as Parameters<PptxSlide["addTable"]>[0],
    {
      x,
      y,
      w,
      h,
    },
  );
}
