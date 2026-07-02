import type { ExportTableShapeOperation } from "../export-spec-types";
import type { VnextPptxTableOp } from "../pptx-export-types";
import { fillToHex, frameToInches, styleToTextOptions } from "./shared";
import type { PptxLowererContext } from "./shared";

export function lowerTableOpToPptx(
  op: ExportTableShapeOperation,
  ctx: PptxLowererContext,
): VnextPptxTableOp {
  const frame = frameToInches(op.frame, ctx);
  const tableStyle = op.style.table;
  const headerFill = tableStyle?.headerFill
    ? fillToHex(tableStyle.headerFill, ctx.dc, `op(table:${op.id}).headerFill`)
    : undefined;
  const rowFill = tableStyle?.rowFill
    ? fillToHex(tableStyle.rowFill, ctx.dc, `op(table:${op.id}).rowFill`)
    : undefined;
  return {
    type: "tableShape",
    id: op.id,
    ...frame,
    table: op.table,
    ...(headerFill !== undefined ? { headerFill } : {}),
    ...(rowFill !== undefined ? { rowFill } : {}),
    ...(tableStyle?.text
      ? { textStyle: styleToTextOptions({ text: tableStyle.text }) }
      : {}),
    zIndex: op.zIndex,
  };
}
