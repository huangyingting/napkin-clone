import {
  DEFAULT_STYLE,
  VISUAL_SCHEMA_VERSION,
  type Visual,
  type VisualEdge,
  type VisualKind,
  type VisualNode,
  type VisualStyle,
} from "@/lib/visual/schema";

export function buildVisualNode(
  overrides: Partial<VisualNode> = {},
): VisualNode {
  return {
    id: overrides.id ?? "node-1",
    label: overrides.label ?? "Start",
    x: overrides.x ?? 120,
    y: overrides.y ?? 120,
    width: overrides.width ?? 140,
    height: overrides.height ?? 56,
    shape: overrides.shape ?? "rounded",
    ...(overrides.icon !== undefined ? { icon: overrides.icon } : {}),
    ...(overrides.value !== undefined ? { value: overrides.value } : {}),
  };
}

export function buildVisualEdge(
  overrides: Partial<VisualEdge> = {},
): VisualEdge {
  return {
    id: overrides.id ?? "edge-1",
    from: overrides.from ?? "node-1",
    to: overrides.to ?? "node-2",
    ...(overrides.label !== undefined ? { label: overrides.label } : {}),
    ...(overrides.directed !== undefined
      ? { directed: overrides.directed }
      : {}),
    ...(overrides.style !== undefined ? { style: overrides.style } : {}),
  };
}

export function buildVisualStyle(
  overrides: Partial<VisualStyle> = {},
): VisualStyle {
  return { ...DEFAULT_STYLE, ...overrides };
}

export function buildVisual(
  overrides: Partial<Visual> & { type?: VisualKind } = {},
): Visual {
  const type = overrides.type ?? "flowchart";
  const nodes = overrides.nodes ?? [
    buildVisualNode({ id: "node-1", label: "Start" }),
    buildVisualNode({ id: "node-2", label: "Finish", x: 360 }),
  ];

  return {
    version: overrides.version ?? VISUAL_SCHEMA_VERSION,
    type,
    title: overrides.title ?? "Fixture visual",
    width: overrides.width ?? 640,
    height: overrides.height ?? 360,
    style: buildVisualStyle(overrides.style),
    nodes,
    edges: overrides.edges ?? [buildVisualEdge()],
    ...(overrides.aspectRatio !== undefined
      ? { aspectRatio: overrides.aspectRatio }
      : {}),
    ...(overrides.canvasStyle !== undefined
      ? { canvasStyle: overrides.canvasStyle }
      : {}),
    ...(overrides.sourceText !== undefined
      ? { sourceText: overrides.sourceText }
      : {}),
    ...(overrides.sourceTextHash !== undefined
      ? { sourceTextHash: overrides.sourceTextHash }
      : {}),
    ...(overrides.autoLayout !== undefined
      ? { autoLayout: overrides.autoLayout }
      : {}),
    ...(overrides.effects !== undefined ? { effects: overrides.effects } : {}),
  };
}

export function buildVisualMap(
  ...visuals: Array<[string, Visual]>
): ReadonlyMap<string, Visual> {
  return new Map(visuals);
}
