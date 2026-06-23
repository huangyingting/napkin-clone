import {
  CURRENT_COMMAND_SCHEMA_VERSION,
  adaptSlideCommandResult,
  makeAffectedIds,
  makeSideEffects,
  validateCommandEnvelope,
  type CommandEnvelope,
  type CommandTarget,
  type CrossSurfaceCommandResult,
} from "@/lib/commands/command-envelope";
import type { DeckPatch } from "@/lib/presentation/slide-commands";
import type {
  ArrowStyle,
  AspectRatioPreset,
  CanvasStyle,
  EffectKind,
  FillStyle,
  LineStyle,
  NodeShape,
  TextAlign,
  Visual,
  VisualEdge,
  VisualEffect,
  VisualKind,
  VisualNode,
  VisualStyle,
} from "@/lib/visual/schema";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  safeParseVisual,
} from "@/lib/visual/schema";
import { getKindEntry, isShapeAllowed } from "@/lib/visual/registry";
import {
  applyDisplayStyle,
  applyTheme,
  clearEffect,
  clearNodeIcon,
  mergeVisualContent,
  resetNodeExtStyle,
  resetNodeStyle,
  setAllEdgesStyle,
  setAspectRatio,
  setAutoLayout,
  setCanvasStyle,
  setEdgeArrowStyle,
  setEdgeLineStyle,
  setEdgeLineWidth,
  setEffect,
  setNodeBorderStyle,
  setNodeBorderWidth,
  setNodeFillStyle,
  setNodeFontFamily,
  setNodeIcon,
  setNodeLabel,
  setNodeStyle,
  setNodeTextAlign,
  setVisualKind,
  setVisualStyle,
  type NodeStyleField,
} from "@/lib/visual/transforms";

export interface EdgeStylePatch {
  arrowStyle?: ArrowStyle;
  lineStyle?: LineStyle;
  lineWidth?: number;
}

export type AllEdgesStylePatch = EdgeStylePatch;

export interface NodeExtStylePatch {
  fillStyle?: FillStyle;
  borderStyle?: LineStyle;
  borderWidth?: number;
  textAlign?: TextAlign;
  fontFamily?: string;
}

export type VisualCommandPayload =
  | { op: "visual.apply_theme"; themeId: string }
  | { op: "visual.set_style"; patch: Partial<VisualStyle> }
  | { op: "visual.apply_display_style"; styleId: string }
  | { op: "visual.set_kind"; kind: VisualKind }
  | { op: "visual.set_canvas_style"; canvasStyle: CanvasStyle }
  | { op: "visual.set_aspect_ratio"; preset: AspectRatioPreset }
  | { op: "visual.set_auto_layout"; enabled: boolean }
  | {
      op: "visual.set_node_style";
      nodeId: string;
      field: NodeStyleField;
      value: string;
    }
  | { op: "visual.reset_node_style"; nodeId: string }
  | {
      op: "visual.set_node_ext_style";
      nodeId: string;
      patch: NodeExtStylePatch;
    }
  | { op: "visual.reset_node_ext_style"; nodeId: string }
  | { op: "visual.set_node_icon"; nodeId: string; icon: string }
  | { op: "visual.clear_node_icon"; nodeId: string }
  | { op: "visual.set_node_label"; nodeId: string; label: string }
  | { op: "visual.set_edge_style"; edgeId: string; patch: EdgeStylePatch }
  | { op: "visual.set_all_edges_style"; patch: AllEdgesStylePatch }
  | { op: "visual.set_effect"; effect: VisualEffect }
  | { op: "visual.clear_effect"; kind: EffectKind }
  | { op: "visual.merge_content"; newVisual: Visual }
  // --- lifecycle operations (#446) ---
  | {
      op: "visual.add_node";
      node: Omit<VisualNode, "id"> & { id?: string };
    }
  | { op: "visual.delete_node"; nodeId: string }
  | {
      op: "visual.add_edge";
      edge: Omit<VisualEdge, "id"> & { id?: string };
    }
  | { op: "visual.delete_edge"; edgeId: string }
  | {
      op: "visual.reconnect_edge";
      edgeId: string;
      fromNodeId?: string;
      toNodeId?: string;
    }
  | { op: "visual.duplicate_node"; nodeId: string; newNodeId?: string }
  | { op: "visual.relayout_graph" };

export interface VisualCommand extends CommandEnvelope<VisualCommandPayload> {
  type: VisualCommandPayload["op"];
  target: CommandTarget & { surface: "visual"; visualId: string };
}

export interface VisualPatch {
  schemaVersion: number;
  op: VisualCommandPayload["op"];
  visualId: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
}

export type VisualSideEffect =
  | { kind: "visual_mirror_rebuild"; visualId: string }
  | { kind: "source_staleness_recompute"; visualId: string }
  | { kind: "render_invalidation"; visualId: string };

export interface VisualCommandResult {
  ok: boolean;
  visual: Visual;
  error?: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  historyKey?: string;
  patches: VisualPatch[];
  sideEffects: VisualSideEffect[];
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function wholeVisualNodeIds(before: Visual, after: Visual): string[] {
  return uniqueIds([
    ...before.nodes.map((node) => node.id),
    ...after.nodes.map((node) => node.id),
  ]);
}

function wholeVisualEdgeIds(before: Visual, after: Visual): string[] {
  return uniqueIds([
    ...before.edges.map((edge) => edge.id),
    ...after.edges.map((edge) => edge.id),
  ]);
}

function failure(visual: Visual, error: string): VisualCommandResult {
  return {
    ok: false,
    visual,
    error,
    affectedNodeIds: [],
    affectedEdgeIds: [],
    patches: [],
    sideEffects: [],
  };
}

function makePatch(
  command: VisualCommand,
  affectedNodeIds: string[],
  affectedEdgeIds: string[],
): VisualPatch {
  return {
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    op: command.payload.op,
    visualId: command.target.visualId,
    affectedNodeIds,
    affectedEdgeIds,
  };
}

function success(
  visual: Visual,
  command: VisualCommand,
  affectedNodeIds: string[],
  affectedEdgeIds: string[],
  includeSourceRecompute = false,
): VisualCommandResult {
  return {
    ok: true,
    visual,
    affectedNodeIds,
    affectedEdgeIds,
    ...(command.coalesceKey ? { historyKey: command.coalesceKey } : {}),
    patches: [makePatch(command, affectedNodeIds, affectedEdgeIds)],
    sideEffects: makeSideEffects<VisualSideEffect>(
      { kind: "visual_mirror_rebuild", visualId: command.target.visualId },
      includeSourceRecompute
        ? {
            kind: "source_staleness_recompute",
            visualId: command.target.visualId,
          }
        : undefined,
      { kind: "render_invalidation", visualId: command.target.visualId },
    ),
  };
}

function ensureNodeExists(visual: Visual, nodeId: string): string | undefined {
  return visual.nodes.some((node) => node.id === nodeId)
    ? undefined
    : `Node ${nodeId} was not found.`;
}

function ensureEdgeExists(visual: Visual, edgeId: string): string | undefined {
  return visual.edges.some((edge) => edge.id === edgeId)
    ? undefined
    : `Edge ${edgeId} was not found.`;
}

function applyNodeExtStyle(
  visual: Visual,
  nodeId: string,
  patch: NodeExtStylePatch,
): Visual {
  let next = visual;
  if (patch.fillStyle !== undefined) {
    next = setNodeFillStyle(next, nodeId, patch.fillStyle);
  }
  if (patch.borderStyle !== undefined) {
    next = setNodeBorderStyle(next, nodeId, patch.borderStyle);
  }
  if (patch.borderWidth !== undefined) {
    next = setNodeBorderWidth(next, nodeId, patch.borderWidth);
  }
  if (patch.textAlign !== undefined) {
    next = setNodeTextAlign(next, nodeId, patch.textAlign);
  }
  if (patch.fontFamily !== undefined) {
    next = setNodeFontFamily(next, nodeId, patch.fontFamily);
  }
  return next;
}

function applyEdgeStyle(
  visual: Visual,
  edgeId: string,
  patch: EdgeStylePatch,
): Visual {
  let next = visual;
  if (patch.arrowStyle !== undefined) {
    next = setEdgeArrowStyle(next, edgeId, patch.arrowStyle);
  }
  if (patch.lineStyle !== undefined) {
    next = setEdgeLineStyle(next, edgeId, patch.lineStyle);
  }
  if (patch.lineWidth !== undefined) {
    next = setEdgeLineWidth(next, edgeId, patch.lineWidth);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Lifecycle operation helpers (#446)
// ---------------------------------------------------------------------------

/** Generates a simple sequential id for a new node or edge. */
function generateId(prefix: string, existing: string[]): string {
  const existingSet = new Set(existing);
  let counter = existing.length + 1;
  let candidate = `${prefix}-${counter}`;
  while (existingSet.has(candidate)) {
    counter += 1;
    candidate = `${prefix}-${counter}`;
  }
  return candidate;
}

/**
 * Adds a node to the visual, validating registry constraints.
 * Returns an error string if the kind does not support node addition or the
 * provided shape is not allowed for this kind.
 */
function addNode(
  visual: Visual,
  nodeSpec: Omit<VisualNode, "id"> & { id?: string },
): { next: Visual; nodeId: string } | { error: string } {
  const entry = getKindEntry(visual.type);
  if (!entry.editing.nodeAddable) {
    return { error: `Kind "${visual.type}" does not support adding nodes.` };
  }
  const shape: NodeShape = (nodeSpec.shape ?? entry.defaultShape) as NodeShape;
  if (!isShapeAllowed(visual.type, shape)) {
    return {
      error: `Shape "${shape}" is not allowed for kind "${visual.type}". Allowed: ${entry.allowedShapes.join(", ")}.`,
    };
  }
  const nodeId =
    nodeSpec.id ??
    generateId(
      "n",
      visual.nodes.map((n) => n.id),
    );
  const cx = visual.width / 2;
  const cy = visual.height / 2;
  const newNode: VisualNode = {
    id: nodeId,
    label: nodeSpec.label ?? "Node",
    width: nodeSpec.width ?? DEFAULT_NODE_WIDTH,
    height: nodeSpec.height ?? DEFAULT_NODE_HEIGHT,
    shape,
    ...(entry.layoutFamily === "positioned"
      ? { x: nodeSpec.x ?? cx, y: nodeSpec.y ?? cy }
      : {}),
    ...(nodeSpec.value !== undefined ? { value: nodeSpec.value } : {}),
    ...(nodeSpec.color ? { color: nodeSpec.color } : {}),
    ...(nodeSpec.stroke ? { stroke: nodeSpec.stroke } : {}),
    ...(nodeSpec.textColor ? { textColor: nodeSpec.textColor } : {}),
    ...(nodeSpec.icon ? { icon: nodeSpec.icon } : {}),
  };
  return {
    next: { ...visual, nodes: [...visual.nodes, newNode] },
    nodeId,
  };
}

/**
 * Deletes a node and all edges that reference it.
 */
function deleteNode(visual: Visual, nodeId: string): Visual {
  const nodes = visual.nodes.filter((n) => n.id !== nodeId);
  const edges = visual.edges.filter(
    (e) => e.from !== nodeId && e.to !== nodeId,
  );
  return { ...visual, nodes, edges };
}

/**
 * Adds an edge between two nodes, validating registry constraints.
 */
function addEdge(
  visual: Visual,
  edgeSpec: Omit<VisualEdge, "id"> & { id?: string },
): { next: Visual; edgeId: string } | { error: string } {
  const entry = getKindEntry(visual.type);
  if (!entry.editing.edgeAddable) {
    return { error: `Kind "${visual.type}" does not support adding edges.` };
  }
  const nodeIds = new Set(visual.nodes.map((n) => n.id));
  if (!nodeIds.has(edgeSpec.from)) {
    return { error: `Source node "${edgeSpec.from}" does not exist.` };
  }
  if (!nodeIds.has(edgeSpec.to)) {
    return { error: `Target node "${edgeSpec.to}" does not exist.` };
  }
  const edgeId =
    edgeSpec.id ??
    generateId(
      "e",
      visual.edges.map((e) => e.id),
    );
  const newEdge: VisualEdge = {
    id: edgeId,
    from: edgeSpec.from,
    to: edgeSpec.to,
    ...(edgeSpec.label !== undefined ? { label: edgeSpec.label } : {}),
    ...(edgeSpec.directed !== undefined ? { directed: edgeSpec.directed } : {}),
    ...(edgeSpec.style ? { style: edgeSpec.style } : {}),
  };
  return {
    next: { ...visual, edges: [...visual.edges, newEdge] },
    edgeId,
  };
}

/**
 * Reconnects an edge to different source/target nodes.
 */
function reconnectEdge(
  visual: Visual,
  edgeId: string,
  fromNodeId: string | undefined,
  toNodeId: string | undefined,
): { next: Visual } | { error: string } {
  const entry = getKindEntry(visual.type);
  if (!entry.editing.edgeReconnectable) {
    return {
      error: `Kind "${visual.type}" does not support edge reconnection.`,
    };
  }
  const edge = visual.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { error: `Edge "${edgeId}" does not exist.` };
  }
  const nodeIds = new Set(visual.nodes.map((n) => n.id));
  const newFrom = fromNodeId ?? edge.from;
  const newTo = toNodeId ?? edge.to;
  if (!nodeIds.has(newFrom)) {
    return { error: `Source node "${newFrom}" does not exist.` };
  }
  if (!nodeIds.has(newTo)) {
    return { error: `Target node "${newTo}" does not exist.` };
  }
  const edges = visual.edges.map((e) =>
    e.id === edgeId ? { ...e, from: newFrom, to: newTo } : e,
  );
  return { next: { ...visual, edges } };
}

/**
 * Duplicates a node with a new id, offset slightly to avoid overlap.
 */
function duplicateNode(
  visual: Visual,
  nodeId: string,
  newNodeId?: string,
): { next: Visual; newNodeId: string } | { error: string } {
  const entry = getKindEntry(visual.type);
  if (!entry.editing.nodeDuplicatable) {
    return {
      error: `Kind "${visual.type}" does not support node duplication.`,
    };
  }
  const source = visual.nodes.find((n) => n.id === nodeId);
  if (!source) {
    return { error: `Node "${nodeId}" does not exist.` };
  }
  const generatedId =
    newNodeId ??
    generateId(
      "n",
      visual.nodes.map((n) => n.id),
    );
  const offset = 20;
  const duplicate: VisualNode = {
    ...source,
    id: generatedId,
    ...(typeof source.x === "number" ? { x: source.x + offset } : {}),
    ...(typeof source.y === "number" ? { y: source.y + offset } : {}),
  };
  return {
    next: { ...visual, nodes: [...visual.nodes, duplicate] },
    newNodeId: generatedId,
  };
}

function validateOutput(
  visual: Visual,
  original: Visual,
): VisualCommandResult | null {
  const parsed = safeParseVisual(visual);
  if (parsed.success) {
    return null;
  }
  return failure(
    original,
    `Visual command produced an invalid visual: ${parsed.error}`,
  );
}

export function executeVisualCommand(
  visual: Visual,
  cmd: VisualCommand,
): VisualCommandResult {
  const validation = validateCommandEnvelope(cmd);
  if (!validation.valid) {
    return failure(visual, validation.errors.join(" "));
  }

  let next = visual;
  let affectedNodeIds: string[] = [];
  let affectedEdgeIds: string[] = [];
  let includeSourceRecompute = false;

  switch (cmd.payload.op) {
    case "visual.apply_theme":
      next = applyTheme(visual, cmd.payload.themeId);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.set_style":
      next = setVisualStyle(visual, cmd.payload.patch);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.apply_display_style":
      next = applyDisplayStyle(visual, cmd.payload.styleId);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.set_kind":
      next = setVisualKind(visual, cmd.payload.kind);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.set_canvas_style":
      next = setCanvasStyle(visual, cmd.payload.canvasStyle);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.set_aspect_ratio":
      next = setAspectRatio(visual, cmd.payload.preset);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.set_auto_layout":
      next = setAutoLayout(visual, cmd.payload.enabled);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.set_node_style": {
      const error = ensureNodeExists(visual, cmd.payload.nodeId);
      if (error) {
        return failure(visual, error);
      }
      next = setNodeStyle(
        visual,
        cmd.payload.nodeId,
        cmd.payload.field,
        cmd.payload.value,
      );
      affectedNodeIds = [cmd.payload.nodeId];
      break;
    }
    case "visual.reset_node_style": {
      const error = ensureNodeExists(visual, cmd.payload.nodeId);
      if (error) {
        return failure(visual, error);
      }
      next = resetNodeStyle(visual, cmd.payload.nodeId);
      affectedNodeIds = [cmd.payload.nodeId];
      break;
    }
    case "visual.set_node_ext_style": {
      const error = ensureNodeExists(visual, cmd.payload.nodeId);
      if (error) {
        return failure(visual, error);
      }
      next = applyNodeExtStyle(visual, cmd.payload.nodeId, cmd.payload.patch);
      affectedNodeIds = [cmd.payload.nodeId];
      break;
    }
    case "visual.reset_node_ext_style": {
      const error = ensureNodeExists(visual, cmd.payload.nodeId);
      if (error) {
        return failure(visual, error);
      }
      next = resetNodeExtStyle(visual, cmd.payload.nodeId);
      affectedNodeIds = [cmd.payload.nodeId];
      break;
    }
    case "visual.set_node_icon": {
      const error = ensureNodeExists(visual, cmd.payload.nodeId);
      if (error) {
        return failure(visual, error);
      }
      next = setNodeIcon(visual, cmd.payload.nodeId, cmd.payload.icon);
      affectedNodeIds = [cmd.payload.nodeId];
      break;
    }
    case "visual.clear_node_icon": {
      const error = ensureNodeExists(visual, cmd.payload.nodeId);
      if (error) {
        return failure(visual, error);
      }
      next = clearNodeIcon(visual, cmd.payload.nodeId);
      affectedNodeIds = [cmd.payload.nodeId];
      break;
    }
    case "visual.set_node_label": {
      const error = ensureNodeExists(visual, cmd.payload.nodeId);
      if (error) {
        return failure(visual, error);
      }
      next = setNodeLabel(visual, cmd.payload.nodeId, cmd.payload.label);
      affectedNodeIds = [cmd.payload.nodeId];
      break;
    }
    case "visual.set_edge_style": {
      const error = ensureEdgeExists(visual, cmd.payload.edgeId);
      if (error) {
        return failure(visual, error);
      }
      next = applyEdgeStyle(visual, cmd.payload.edgeId, cmd.payload.patch);
      affectedEdgeIds = [cmd.payload.edgeId];
      break;
    }
    case "visual.set_all_edges_style":
      next = setAllEdgesStyle(visual, cmd.payload.patch);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.set_effect":
      next = setEffect(visual, cmd.payload.effect);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.clear_effect":
      next = clearEffect(visual, cmd.payload.kind);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    case "visual.merge_content": {
      const parsed = safeParseVisual(cmd.payload.newVisual);
      if (!parsed.success) {
        return failure(visual, `Invalid merge visual: ${parsed.error}`);
      }
      next = mergeVisualContent(visual, parsed.data);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      includeSourceRecompute = true;
      break;
    }
    // --- lifecycle operations (#446) ---
    case "visual.add_node": {
      const result = addNode(visual, cmd.payload.node);
      if ("error" in result) {
        return failure(visual, result.error);
      }
      next = result.next;
      affectedNodeIds = [result.nodeId];
      break;
    }
    case "visual.delete_node": {
      const delError = ensureNodeExists(visual, cmd.payload.nodeId);
      if (delError) {
        return failure(visual, delError);
      }
      const kindEntry = getKindEntry(visual.type);
      if (!kindEntry.editing.nodeDeletable) {
        return failure(
          visual,
          `Kind "${visual.type}" does not support deleting nodes.`,
        );
      }
      next = deleteNode(visual, cmd.payload.nodeId);
      affectedNodeIds = [cmd.payload.nodeId];
      const deletedNodeId = cmd.payload.nodeId;
      affectedEdgeIds = visual.edges
        .filter((e) => e.from === deletedNodeId || e.to === deletedNodeId)
        .map((e) => e.id);
      break;
    }
    case "visual.add_edge": {
      const result = addEdge(visual, cmd.payload.edge);
      if ("error" in result) {
        return failure(visual, result.error);
      }
      next = result.next;
      affectedEdgeIds = [result.edgeId];
      break;
    }
    case "visual.delete_edge": {
      const delEdgeError = ensureEdgeExists(visual, cmd.payload.edgeId);
      if (delEdgeError) {
        return failure(visual, delEdgeError);
      }
      const kindEntryEdge = getKindEntry(visual.type);
      if (!kindEntryEdge.editing.edgeDeletable) {
        return failure(
          visual,
          `Kind "${visual.type}" does not support deleting edges.`,
        );
      }
      const deletedEdgeId = cmd.payload.edgeId;
      next = {
        ...visual,
        edges: visual.edges.filter((e) => e.id !== deletedEdgeId),
      };
      affectedEdgeIds = [deletedEdgeId];
      break;
    }
    case "visual.reconnect_edge": {
      const result = reconnectEdge(
        visual,
        cmd.payload.edgeId,
        cmd.payload.fromNodeId,
        cmd.payload.toNodeId,
      );
      if ("error" in result) {
        return failure(visual, result.error);
      }
      next = result.next;
      affectedEdgeIds = [cmd.payload.edgeId];
      break;
    }
    case "visual.duplicate_node": {
      const result = duplicateNode(
        visual,
        cmd.payload.nodeId,
        cmd.payload.newNodeId,
      );
      if ("error" in result) {
        return failure(visual, result.error);
      }
      next = result.next;
      affectedNodeIds = [cmd.payload.nodeId, result.newNodeId];
      break;
    }
    case "visual.relayout_graph": {
      const kindEntryLayout = getKindEntry(visual.type);
      if (!kindEntryLayout.editing.autoLayoutSupported) {
        return failure(
          visual,
          `Kind "${visual.type}" does not support auto-layout.`,
        );
      }
      next = setAutoLayout(visual, true);
      affectedNodeIds = wholeVisualNodeIds(visual, next);
      affectedEdgeIds = wholeVisualEdgeIds(visual, next);
      break;
    }
  }

  const invalid = validateOutput(next, visual);
  if (invalid) {
    return invalid;
  }

  return success(
    next,
    cmd,
    uniqueIds(affectedNodeIds),
    uniqueIds(affectedEdgeIds),
    includeSourceRecompute,
  );
}

export function adaptVisualCommandResult(
  command: VisualCommand,
  result: VisualCommandResult,
): CrossSurfaceCommandResult<VisualPatch, VisualSideEffect> {
  return {
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
    affectedIds: makeAffectedIds({
      ...(command.target.documentId
        ? { documentIds: [command.target.documentId] }
        : {}),
      visualIds: [command.target.visualId],
      nodeIds: result.affectedNodeIds,
      edgeIds: result.affectedEdgeIds,
    }),
    ...(result.historyKey ? { coalesceKey: result.historyKey } : {}),
    patches: result.patches,
    sideEffects: result.sideEffects,
  };
}

function canCoalesceVisualCommands(
  a: VisualCommand,
  b: VisualCommand,
): boolean {
  if (
    a.coalesceKey === undefined ||
    a.coalesceKey !== b.coalesceKey ||
    a.actor.id !== b.actor.id ||
    a.actor.sessionId !== b.actor.sessionId ||
    a.source !== b.source ||
    a.target.documentId !== b.target.documentId ||
    a.target.visualId !== b.target.visualId ||
    a.type !== b.type
  ) {
    return false;
  }

  switch (a.payload.op) {
    case "visual.set_style":
    case "visual.apply_theme":
    case "visual.apply_display_style":
    case "visual.set_kind":
    case "visual.set_canvas_style":
    case "visual.set_aspect_ratio":
    case "visual.set_auto_layout":
    case "visual.set_all_edges_style":
    case "visual.set_effect":
    case "visual.clear_effect":
    case "visual.merge_content":
      return true;
    case "visual.set_node_style":
      return (
        b.payload.op === "visual.set_node_style" &&
        a.payload.nodeId === b.payload.nodeId &&
        a.payload.field === b.payload.field
      );
    case "visual.reset_node_style":
    case "visual.reset_node_ext_style":
    case "visual.set_node_icon":
    case "visual.clear_node_icon":
    case "visual.set_node_label":
    case "visual.set_node_ext_style":
      return "nodeId" in b.payload && a.payload.nodeId === b.payload.nodeId;
    case "visual.set_edge_style":
      return (
        b.payload.op === "visual.set_edge_style" &&
        a.payload.edgeId === b.payload.edgeId
      );
    // Lifecycle operations are never coalesced — each is a discrete structural change.
    case "visual.add_node":
    case "visual.delete_node":
    case "visual.add_edge":
    case "visual.delete_edge":
    case "visual.reconnect_edge":
    case "visual.duplicate_node":
    case "visual.relayout_graph":
      return false;
  }
}

function mergeVisualCommandPayload(
  a: VisualCommandPayload,
  b: VisualCommandPayload,
): VisualCommandPayload {
  switch (a.op) {
    case "visual.set_style":
      return b.op === "visual.set_style"
        ? { ...a, patch: { ...a.patch, ...b.patch } }
        : b;
    case "visual.set_node_ext_style":
      return b.op === "visual.set_node_ext_style"
        ? {
            ...a,
            patch: { ...a.patch, ...b.patch },
          }
        : b;
    case "visual.set_edge_style":
      return b.op === "visual.set_edge_style"
        ? {
            ...a,
            patch: { ...a.patch, ...b.patch },
          }
        : b;
    case "visual.set_all_edges_style":
      return b.op === "visual.set_all_edges_style"
        ? {
            ...a,
            patch: { ...a.patch, ...b.patch },
          }
        : b;
    default:
      return b;
  }
}

function mergeVisualCommands(
  a: VisualCommand,
  b: VisualCommand,
): VisualCommand {
  return {
    ...a,
    timestamp: b.timestamp,
    source: b.source,
    payload: mergeVisualCommandPayload(a.payload, b.payload),
  };
}

export function coalesceVisualCommands(
  history: VisualCommand[],
): VisualCommand[] {
  if (history.length === 0) {
    return history;
  }

  const result: VisualCommand[] = [history[0]!];
  for (let index = 1; index < history.length; index += 1) {
    const previous = result[result.length - 1]!;
    const current = history[index]!;
    if (canCoalesceVisualCommands(previous, current)) {
      result[result.length - 1] = mergeVisualCommands(previous, current);
    } else {
      result.push(current);
    }
  }
  return result;
}

export type CrossSurfacePatch = DeckPatch | VisualPatch;
export const adaptDeckCommandResult = adaptSlideCommandResult;
