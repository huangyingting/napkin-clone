/**
 * Durable block-id helpers for Lexical content (issue #432).
 *
 * A "block id" (`bid`) is a short random opaque string stamped on each
 * block-level serialized Lexical node. It:
 *  - Is stable across save/reload and text edits inside the block.
 *  - Is unique within a document when generated via {@link generateBlockId}.
 *  - Must be regenerated when a block is cloned (duplicate doc, copy/paste).
 *
 * ## Stamping and upgrading
 *
 * - {@link stampBlockIds} walks a raw contentJson object and adds `bid` to
 *   every block-level node that does not already have one. Safe to call on
 *   existing content (idempotent for nodes that already carry a `bid`).
 *
 * - {@link regenerateBlockIds} always assigns fresh `bid` values to every
 *   block-level node and returns both the updated JSON and an old→new mapping.
 *   Use this when duplicating a document so the copy has its own identity
 *   space.
 */

import { customAlphabet } from "nanoid";

const alphabet = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates a unique block id using a short visually-unambiguous alphabet.
 */
export const generateBlockId = customAlphabet(alphabet, 12);

export const BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "quote",
  "horizontalrule",
  "listitem",
]);

type MutableJsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MutableJsonRecord {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function updateChildren(
  node: MutableJsonRecord,
  visit: (child: unknown) => unknown,
): { children: unknown[]; changed: boolean } | null {
  if (!Array.isArray(node.children)) {
    return null;
  }

  let changed = false;
  const children = (node.children as unknown[]).map((child) => {
    const next = visit(child);
    if (next !== child) {
      changed = true;
    }
    return next;
  });

  return { children, changed };
}

function stampNode(node: unknown): unknown {
  if (!isRecord(node)) {
    return node;
  }

  if (isRecord(node.root)) {
    const nextRoot = stampNode(node.root);
    return nextRoot === node.root ? node : { ...node, root: nextRoot };
  }

  let nextNode = node;
  let changed = false;

  const updatedChildren = updateChildren(node, stampNode);
  if (updatedChildren?.changed) {
    nextNode = { ...nextNode, children: updatedChildren.children };
    changed = true;
  }

  if (!BLOCK_NODE_TYPES.has(String(node.type))) {
    return changed ? nextNode : node;
  }

  if (nonEmptyString(node.bid)) {
    return changed ? nextNode : node;
  }

  return { ...nextNode, bid: generateBlockId() };
}

function regenerateNode(node: unknown, bidMap: Map<string, string>): unknown {
  if (!isRecord(node)) {
    return node;
  }

  if (isRecord(node.root)) {
    const nextRoot = regenerateNode(node.root, bidMap);
    return nextRoot === node.root ? node : { ...node, root: nextRoot };
  }

  let nextNode = node;
  let changed = false;

  const updatedChildren = updateChildren(node, (child) =>
    regenerateNode(child, bidMap),
  );
  if (updatedChildren?.changed) {
    nextNode = { ...nextNode, children: updatedChildren.children };
    changed = true;
  }

  if (!BLOCK_NODE_TYPES.has(String(node.type))) {
    return changed ? nextNode : node;
  }

  const nextBid = generateBlockId();
  const previousId = nonEmptyString(node.bid);
  if (previousId) {
    bidMap.set(previousId, nextBid);
  }
  return { ...nextNode, bid: nextBid };
}

export function stampBlockIds(contentJson: unknown): unknown {
  return stampNode(contentJson);
}

export function regenerateBlockIds(contentJson: unknown): {
  updated: unknown;
  bidMap: Map<string, string>;
} {
  const bidMap = new Map<string, string>();
  return {
    updated: regenerateNode(contentJson, bidMap),
    bidMap,
  };
}
