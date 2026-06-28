import type { Visual } from "@/lib/visual/schema";
import { getKindEntry } from "@/lib/visual/registry";
import { mergeVisualContent } from "@/lib/visual/transforms";
import { safeParseVisual } from "@/lib/visual/schema";
import type { VisualCommand } from "./visual-command-contracts";
import {
  addEdge,
  addNode,
  deleteNode,
  duplicateNode,
  ensureEdgeExists,
  ensureNodeExists,
  executionSuccess,
  failure,
  reconnectEdge,
  wholeVisualEdgeIds,
  wholeVisualNodeIds,
} from "./visual-command-executor-helpers";

export function executeVisualLifecycleFamily(
  visual: Visual,
  cmd: VisualCommand,
) {
  switch (cmd.payload.op) {
    case "visual.merge_content": {
      const parsed = safeParseVisual(cmd.payload.newVisual);
      if (!parsed.success)
        return failure(visual, `Invalid merge visual: ${parsed.error}`);
      const next = mergeVisualContent(visual, parsed.data);
      if (parsed.data.sourceText) {
        next.sourceText = parsed.data.sourceText;
        next.sourceTextHash = parsed.data.sourceTextHash;
      }
      return executionSuccess(
        next,
        wholeVisualNodeIds(visual, next),
        wholeVisualEdgeIds(visual, next),
        true,
      );
    }
    case "visual.add_node": {
      const result = addNode(visual, cmd.payload.node);
      if ("error" in result) return failure(visual, result.error);
      return executionSuccess(result.next, [result.nodeId], []);
    }
    case "visual.delete_node": {
      const { nodeId } = cmd.payload;
      const delError = ensureNodeExists(visual, nodeId);
      if (delError) return failure(visual, delError);
      const kindEntry = getKindEntry(visual.type);
      if (!kindEntry.editing.nodeDeletable)
        return failure(
          visual,
          `Kind "${visual.type}" does not support deleting nodes.`,
        );
      const next = deleteNode(visual, nodeId);
      const affectedEdgeIds = visual.edges
        .filter((e) => e.from === nodeId || e.to === nodeId)
        .map((e) => e.id);
      return executionSuccess(next, [nodeId], affectedEdgeIds);
    }
    case "visual.add_edge": {
      const result = addEdge(visual, cmd.payload.edge);
      if ("error" in result) return failure(visual, result.error);
      return executionSuccess(result.next, [], [result.edgeId]);
    }
    case "visual.delete_edge": {
      const { edgeId } = cmd.payload;
      const delEdgeError = ensureEdgeExists(visual, edgeId);
      if (delEdgeError) return failure(visual, delEdgeError);
      const kindEntryEdge = getKindEntry(visual.type);
      if (!kindEntryEdge.editing.edgeDeletable)
        return failure(
          visual,
          `Kind "${visual.type}" does not support deleting edges.`,
        );
      /* node:coverage ignore next 4 -- Edge deletion output is asserted; tsx maps this object literal as uncovered. */
      const next = {
        ...visual,
        edges: visual.edges.filter((e) => e.id !== edgeId),
      };
      return executionSuccess(next, [], [edgeId]);
    }
    case "visual.reconnect_edge": {
      const result = reconnectEdge(
        visual,
        cmd.payload.edgeId,
        cmd.payload.fromNodeId,
        cmd.payload.toNodeId,
      );
      if ("error" in result) return failure(visual, result.error);
      return executionSuccess(result.next, [], [cmd.payload.edgeId]);
    }
    case "visual.duplicate_node": {
      const result = duplicateNode(
        visual,
        cmd.payload.nodeId,
        cmd.payload.newNodeId,
      );
      if ("error" in result) return failure(visual, result.error);
      return executionSuccess(
        result.next,
        [cmd.payload.nodeId, result.newNodeId],
        [],
      );
    }
    default:
      return failure(visual, "Unsupported lifecycle command.");
  }
}
