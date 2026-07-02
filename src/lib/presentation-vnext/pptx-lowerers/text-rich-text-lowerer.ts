import type { ExportTextOperation } from "../export-spec-types";
import type { VnextPptxTextOp } from "../pptx-export-types";
import { checkEffect, frameToInches, styleToTextOptions } from "./shared";
import type { PptxLowererContext } from "./shared";

export function lowerTextOpToPptx(
  op: ExportTextOperation,
  ctx: PptxLowererContext,
): VnextPptxTextOp {
  const frame = frameToInches(op.frame, ctx);
  checkEffect(op.style, ctx.dc, `op(text:${op.id})`);
  return {
    type: "text",
    id: op.id,
    ...frame,
    content: op.content,
    textStyle: styleToTextOptions(op.style),
    ...(op.rotation !== undefined ? { rotation: op.rotation } : {}),
    zIndex: op.zIndex,
  };
}
