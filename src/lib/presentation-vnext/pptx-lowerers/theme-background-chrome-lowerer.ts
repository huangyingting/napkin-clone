import type {
  ExportBackgroundOperation,
  ExportSlideSpec,
} from "../export-spec-types";
import type { DiagnosticCollector } from "../diagnostics";
import type { VnextPptxBackgroundOp } from "../pptx-export-types";
import { fillToHex } from "./shared";

export function lowerBackgroundOperationToPptx(
  slideId: ExportSlideSpec["id"],
  background: ExportBackgroundOperation,
  dc: DiagnosticCollector,
): VnextPptxBackgroundOp {
  const bgFill = background.fill
    ? fillToHex(background.fill, dc, `slide(${slideId}).background`)
    : undefined;

  return {
    type: "background",
    ...(bgFill !== undefined ? { fill: bgFill } : {}),
  };
}
