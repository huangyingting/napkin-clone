import type { Visual } from "@/lib/visual/schema";
import { clearEffect, setEffect } from "@/lib/visual/transforms";
import type { VisualCommand } from "./visual-command-contracts";
import {
  executionSuccess,
  failure,
  wholeVisualEdgeIds,
  wholeVisualNodeIds,
} from "./visual-command-executor-helpers";

export function executeVisualEffectFamily(visual: Visual, cmd: VisualCommand) {
  switch (cmd.payload.op) {
    case "visual.set_effect": {
      const next = setEffect(visual, cmd.payload.effect);
      return executionSuccess(
        next,
        wholeVisualNodeIds(visual, next),
        wholeVisualEdgeIds(visual, next),
      );
    }
    case "visual.clear_effect": {
      const next = clearEffect(visual, cmd.payload.kind);
      return executionSuccess(
        next,
        wholeVisualNodeIds(visual, next),
        wholeVisualEdgeIds(visual, next),
      );
    }
    default:
      return failure(visual, "Unsupported effect command.");
  }
}
