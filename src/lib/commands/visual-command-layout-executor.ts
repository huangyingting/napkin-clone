import type { Visual } from "@/lib/visual/schema";
import { getKindRuntimeDescriptor } from "@/lib/visual/registry";
import { setAspectRatio, setAutoLayout } from "@/lib/visual/transforms";
import type { VisualCommand } from "./visual-command-contracts";
import {
  executionSuccess,
  failure,
  wholeVisualEdgeIds,
  wholeVisualNodeIds,
} from "./visual-command-executor-helpers";

export type VisualLayoutFamilyCommand = VisualCommand;

export function executeVisualLayoutFamily(
  visual: Visual,
  cmd: VisualLayoutFamilyCommand,
) {
  let next = visual;
  switch (cmd.payload.op) {
    case "visual.set_aspect_ratio":
      next = setAspectRatio(visual, cmd.payload.preset);
      break;
    case "visual.set_auto_layout": {
      const runtime = getKindRuntimeDescriptor(visual.type);
      if (cmd.payload.enabled && !runtime.transform.autoLayoutSupported) {
        return failure(
          visual,
          `Kind "${visual.type}" does not support auto-layout.`,
        );
      }
      next = setAutoLayout(visual, cmd.payload.enabled);
      break;
    }
    case "visual.relayout_graph": {
      const runtime = getKindRuntimeDescriptor(visual.type);
      if (!runtime.transform.autoLayoutSupported) {
        return failure(
          visual,
          `Kind "${visual.type}" does not support auto-layout.`,
        );
      }
      next = setAutoLayout(visual, true);
      break;
    }
  }
  return executionSuccess(
    next,
    wholeVisualNodeIds(visual, next),
    wholeVisualEdgeIds(visual, next),
  );
}
