import type { Visual } from "@/lib/visual/schema";
import {
  clearNodeIcon,
  resetNodeExtStyle,
  resetNodeStyle,
  setNodeIcon,
  setNodeLabel,
  setNodeStyle,
} from "@/lib/visual/transforms";
import type {
  VisualCommand,
  VisualCommandPayload,
} from "./visual-command-contracts";
import {
  applyNodeExtStyle,
  ensureNodeExists,
  executionSuccess,
  failure,
} from "./visual-command-executor-helpers";

export type VisualNodeFamilyCommand = VisualCommand;

export function executeVisualNodeFamily(
  visual: Visual,
  cmd: VisualNodeFamilyCommand,
) {
  const payload = cmd.payload as Extract<
    VisualCommandPayload,
    { nodeId: string }
  >;
  const nodeId = payload.nodeId;
  const error = ensureNodeExists(visual, nodeId);
  if (error) return failure(visual, error);
  let next = visual;
  switch (payload.op) {
    case "visual.set_node_style":
      next = setNodeStyle(visual, nodeId, payload.field, payload.value);
      break;
    case "visual.reset_node_style":
      next = resetNodeStyle(visual, nodeId);
      break;
    case "visual.set_node_ext_style":
      next = applyNodeExtStyle(visual, nodeId, payload.patch);
      break;
    case "visual.reset_node_ext_style":
      next = resetNodeExtStyle(visual, nodeId);
      break;
    case "visual.set_node_icon":
      next = setNodeIcon(visual, nodeId, payload.icon);
      break;
    case "visual.clear_node_icon":
      next = clearNodeIcon(visual, nodeId);
      break;
    case "visual.set_node_label":
      next = setNodeLabel(visual, nodeId, payload.label);
      break;
  }
  return executionSuccess(next, [nodeId], []);
}
