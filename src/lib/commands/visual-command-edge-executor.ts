import type { Visual } from "@/lib/visual/schema";
import {
  flipEdge,
  setAllEdgesStyle,
  setEdgeLabel,
  toggleEdgeDirected,
  toggleEdgeStyle,
} from "@/lib/visual/transforms";
import type { VisualCommand } from "./visual-command-contracts";
import {
  applyEdgeStyle,
  ensureEdgeExists,
  executionSuccess,
  failure,
  wholeVisualEdgeIds,
} from "./visual-command-executor-helpers";

export function executeVisualEdgeFamily(visual: Visual, cmd: VisualCommand) {
  switch (cmd.payload.op) {
    case "visual.set_edge_style": {
      const error = ensureEdgeExists(visual, cmd.payload.edgeId);
      if (error) return failure(visual, error);
      return executionSuccess(
        applyEdgeStyle(visual, cmd.payload.edgeId, cmd.payload.patch),
        [],
        [cmd.payload.edgeId],
      );
    }
    case "visual.set_edge_label": {
      const error = ensureEdgeExists(visual, cmd.payload.edgeId);
      if (error) return failure(visual, error);
      return executionSuccess(
        setEdgeLabel(visual, cmd.payload.edgeId, cmd.payload.label),
        [],
        [cmd.payload.edgeId],
      );
    }
    case "visual.flip_edge": {
      const error = ensureEdgeExists(visual, cmd.payload.edgeId);
      if (error) return failure(visual, error);
      return executionSuccess(
        flipEdge(visual, cmd.payload.edgeId),
        [],
        [cmd.payload.edgeId],
      );
    }
    case "visual.toggle_edge_directed": {
      const error = ensureEdgeExists(visual, cmd.payload.edgeId);
      if (error) return failure(visual, error);
      return executionSuccess(
        toggleEdgeDirected(visual, cmd.payload.edgeId),
        [],
        [cmd.payload.edgeId],
      );
    }
    case "visual.toggle_edge_style": {
      const error = ensureEdgeExists(visual, cmd.payload.edgeId);
      if (error) return failure(visual, error);
      return executionSuccess(
        toggleEdgeStyle(visual, cmd.payload.edgeId),
        [],
        [cmd.payload.edgeId],
      );
    }
    case "visual.set_all_edges_style": {
      const next = setAllEdgesStyle(visual, cmd.payload.patch);
      return executionSuccess(next, [], wholeVisualEdgeIds(visual, next));
    }
    default:
      return failure(visual, "Unsupported edge command.");
  }
}
