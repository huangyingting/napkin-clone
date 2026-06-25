import type { Visual } from "@/lib/visual/schema";
import {
  applyDisplayStyle,
  applyTheme,
  setCanvasStyle,
  setVisualKind,
  setVisualStyle,
} from "@/lib/visual/transforms";
import type { VisualCommand } from "./visual-commands";
import {
  executionSuccess,
  wholeVisualEdgeIds,
  wholeVisualNodeIds,
} from "./visual-command-executor-helpers";

export type VisualStyleFamilyCommand = VisualCommand;

export function executeVisualStyleFamily(
  visual: Visual,
  cmd: VisualStyleFamilyCommand,
) {
  let next = visual;
  switch (cmd.payload.op) {
    case "visual.apply_theme":
      next = applyTheme(visual, cmd.payload.themeId);
      break;
    case "visual.set_style":
      next = setVisualStyle(visual, cmd.payload.patch);
      break;
    case "visual.apply_display_style":
      next = applyDisplayStyle(visual, cmd.payload.styleId);
      break;
    case "visual.set_kind":
      next = setVisualKind(visual, cmd.payload.kind);
      break;
    case "visual.set_canvas_style":
      next = setCanvasStyle(visual, cmd.payload.canvasStyle);
      break;
  }
  return executionSuccess(
    next,
    wholeVisualNodeIds(visual, next),
    wholeVisualEdgeIds(visual, next),
  );
}
