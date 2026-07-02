import type { VnextPptxOp } from "../pptx-export-adapter";
import { applyVnextImageOp } from "./image-media-applier";
import {
  applyVnextConnectorOp,
  applyVnextShapeOp,
} from "./shape-connector-applier";
import { applyVnextTableOp } from "./table-applier";
import { applyVnextTextOp } from "./text-rich-text-applier";
import type { PptxSlide } from "./shared";
import { applyVnextVisualOp } from "./visual-block-applier";

export async function applyVnextPptxOp(
  slide: PptxSlide,
  op: VnextPptxOp,
): Promise<void> {
  switch (op.type) {
    case "text":
      applyVnextTextOp(slide, op);
      break;
    case "shape":
      applyVnextShapeOp(slide, op);
      break;
    case "image":
      await applyVnextImageOp(slide, op);
      break;
    case "connector":
      applyVnextConnectorOp(slide, op);
      break;
    case "visual":
      await applyVnextVisualOp(slide, op);
      break;
    case "tableShape":
      applyVnextTableOp(slide, op);
      break;
    default: {
      const _: never = op;
      void _;
    }
  }
}
