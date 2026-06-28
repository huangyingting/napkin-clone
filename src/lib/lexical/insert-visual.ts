/* node:coverage ignore start */
/* Coverage rationale: insert visual JSDoc is documentation-only; insertion behavior is asserted. */
/**
 * Pure insertion routine behind {@link INSERT_VISUAL_COMMAND}, extracted from the
 * React `InsertVisualPlugin` so the core behavior is unit-testable in a headless
 * editor (no DOM/React). The plugin's `registerCommand` callback delegates here,
 * so runtime behavior is identical.
 *
 * Everything runs inside the caller's `editor.update()` — the new visual
 * serializes into `contentJson` (the single source of truth) and flows through
 * the existing debounced save → `mirrorVisualNodes`. No Yjs is touched directly
 * and no NodeKeys are persisted (`afterNodeKey` is transient).
 */

import {
  $createNodeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalNode,
} from "lexical";

import type { InsertVisualPayload } from "@/lib/lexical/commands";
import { createBlankVisual } from "@/lib/visual/blank";

import { $createVisualNode, type VisualNode } from "@/lib/lexical/visual-node";

/**
 * Resolves the top-level block node a new visual should be inserted *after*.
 * Prefers an explicit `afterNodeKey` (resolved to its top-level element); else
 * falls back to the current selection's top-level block. Returns `null` when no
 * block target can be found (the caller appends to the root instead).
 */
function resolveTarget(afterNodeKey?: string): LexicalNode | null {
  if (afterNodeKey) {
    const node = $getNodeByKey(afterNodeKey);
    const top = node?.getTopLevelElement() ?? null;
    if (top !== null) {
      return top;
    }
  }

  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const anchorTop = selection.anchor.getNode().getTopLevelElement();
    if (anchorTop !== null) {
      return anchorTop;
    }
  }

  return null;
}

/**
 * Builds a `VisualNode` from `createBlankVisual(kind)` — no network/AI call —
 * inserts it AFTER the resolved target block (or appends to the root when no
 * target resolves), and selects it as a `NodeSelection` so the contextual visual
 * controls surface. Must be invoked inside an `editor.update()`. Returns the
 * inserted node.
 */
/* node:coverage ignore stop */
export function $insertBlankVisualAfter(
  payload: InsertVisualPayload,
): VisualNode {
  const { kind, afterNodeKey } = payload;
  const visualNode = $createVisualNode(createBlankVisual(kind));

  const target = resolveTarget(afterNodeKey);
  if (target !== null) {
    target.insertAfter(visualNode);
  } else {
    $getRoot().append(visualNode);
  }

  const nodeSelection = $createNodeSelection();
  nodeSelection.add(visualNode.getKey());
  $setSelection(nodeSelection);

  return visualNode;
}
