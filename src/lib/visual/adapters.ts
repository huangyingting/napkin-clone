/**
 * Per-kind adapter interface for layout, validation, and migration (Epic #442,
 * issue #445).
 *
 * An adapter is a lightweight, pure-function overlay on top of the generic
 * Visual schema. It expresses semantic invariants that the generic validator
 * cannot check — e.g. "every chart node must have a numeric value" — and
 * translates legacy payloads into the current expected shape.
 *
 * Adapters are:
 *  - Pure (no side-effects, no DOM, no I/O)
 *  - Optional per kind — kinds without special semantics use the
 *    {@link defaultAdapter}
 *  - Additive overlays — they do not replace or remove the generic
 *    `validateVisual` check in schema.ts
 *
 * The adapter boundary is intentionally small so simple kinds stay simple.
 * Future kinds with richer semantics (e.g. an ER diagram with typed columns)
 * can extend this interface without affecting existing adapters.
 *
 * @example
 *   const adapter = getAdapter("chart");
 *   const result = adapter.validate(visual);
 *   if (!result.ok) console.error(result.errors);
 */

import type { Visual, VisualKind, VisualNode } from "@/lib/visual/schema";
import { VISUAL_KINDS, VISUAL_SCHEMA_VERSION } from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/** A semantic validation error surfaced by an adapter. */
export interface AdapterValidationError {
  /** Stable machine-readable code (for tests and UI localisation). */
  code: string;
  /** Human-readable message for debugging and AI repair. */
  message: string;
  /** Affected node id, when applicable. */
  nodeId?: string;
  /** Affected edge id, when applicable. */
  edgeId?: string;
}

/** Result of {@link VisualKindAdapter.validate}. */
export type AdapterValidationResult =
  | { ok: true }
  | { ok: false; errors: AdapterValidationError[] };

/**
 * Result of {@link VisualKindAdapter.migrate}.
 * When `migrated` is `true`, the returned `visual` has been transformed from
 * a legacy payload shape into the current expected form for this kind.
 */
export interface AdapterMigrationResult {
  visual: Visual;
  migrated: boolean;
  /** Human-readable description of any migrations applied. */
  changes: string[];
}

/**
 * Per-kind adapter that provides semantic validation and migration on top
 * of the generic schema layer.
 *
 * The generic {@link validateVisual} / {@link safeParseVisual} in schema.ts
 * runs first; adapters run after and add kind-specific invariant checks.
 *
 * All methods receive a structurally-valid Visual (i.e. one that already
 * passed generic schema validation) — adapters do not need to re-check
 * structural fields.
 */
export interface VisualKindAdapter {
  /** The kind this adapter handles. */
  readonly kind: VisualKind;

  /**
   * Validates kind-specific semantic invariants.
   *
   * Examples:
   *  - chart: every node must have a numeric `value`
   *  - funnel: node values should be non-increasing top to bottom
   *  - venn: requires exactly 2–3 nodes
   *
   * Returns `{ ok: true }` when all invariants pass.
   * Returns `{ ok: false, errors }` describing every failing invariant.
   */
  validate(visual: Visual): AdapterValidationResult;

  /**
   * Migrates a (potentially legacy) Visual payload into the current expected
   * shape for this kind.
   *
   * Migrations must be non-destructive: content (labels, colors, icons) is
   * always preserved. Only structural fields are normalised.
   *
   * Returns the (possibly mutated) visual plus a `migrated` flag and list
   * of applied changes for audit/debugging.
   */
  migrate(visual: Visual): AdapterMigrationResult;

  /**
   * Returns the ordered list of node fields that a UI editor should expose as
   * editable for this kind.
   *
   * Allows UI surfaces to omit fields that are meaningless for a given kind
   * (e.g. `value` on a flowchart node).
   */
  editableNodeFields(): readonly string[];
}

// ---------------------------------------------------------------------------
// Default adapter (no-op)
// ---------------------------------------------------------------------------

/**
 * The default adapter used for kinds that have no special semantics.
 * All validation passes; migration is a no-op.
 */
class DefaultAdapter implements VisualKindAdapter {
  constructor(readonly kind: VisualKind) {}

  validate(_visual: Visual): AdapterValidationResult {
    return { ok: true };
  }

  migrate(visual: Visual): AdapterMigrationResult {
    return { visual, migrated: false, changes: [] };
  }

  editableNodeFields(): readonly string[] {
    return ["label", "icon", "shape", "color", "stroke", "textColor"];
  }
}

// ---------------------------------------------------------------------------
// Chart adapter (value-driven kind)
// ---------------------------------------------------------------------------

/**
 * Adapter for the `chart` kind.
 *
 * Invariants:
 *  - Every node must have a numeric `value` (used as bar height).
 *  - Value should be a finite number ≥ 0.
 *
 * Migration:
 *  - Nodes missing `value` receive `value: 0` and the migration is flagged.
 */
class ChartAdapter implements VisualKindAdapter {
  readonly kind = "chart" as const;

  validate(visual: Visual): AdapterValidationResult {
    const errors: AdapterValidationError[] = [];
    for (const node of visual.nodes) {
      if (typeof node.value !== "number" || !isFinite(node.value)) {
        errors.push({
          code: "chart.missing-value",
          message: `Chart node "${node.id}" is missing a numeric value (required for bar height).`,
          nodeId: node.id,
        });
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  migrate(visual: Visual): AdapterMigrationResult {
    const changes: string[] = [];
    const nodes = visual.nodes.map((node) => {
      if (typeof node.value !== "number" || !isFinite(node.value)) {
        changes.push(`Assigned value=0 to chart node "${node.id}"`);
        return { ...node, value: 0 };
      }
      return node;
    });
    if (changes.length === 0) {
      return { visual, migrated: false, changes: [] };
    }
    return {
      visual: { ...visual, nodes },
      migrated: true,
      changes,
    };
  }

  editableNodeFields(): readonly string[] {
    return ["label", "value", "icon", "color", "stroke", "textColor"];
  }
}

// ---------------------------------------------------------------------------
// Flowchart adapter (graph-like positioned kind)
// ---------------------------------------------------------------------------

/**
 * Adapter for the `flowchart` kind.
 *
 * Invariants:
 *  - Every edge must reference nodes that exist in the visual.
 *  - The visual should have at least one node.
 *
 * Migration:
 *  - Dangling edges (referencing missing node ids) are removed.
 *  - `version` is normalised to the current schema version if it differs.
 */
class FlowchartAdapter implements VisualKindAdapter {
  readonly kind = "flowchart" as const;

  validate(visual: Visual): AdapterValidationResult {
    const errors: AdapterValidationError[] = [];
    const nodeIds = new Set(visual.nodes.map((n) => n.id));
    for (const edge of visual.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push({
          code: "flowchart.dangling-edge-from",
          message: `Edge "${edge.id}" references missing source node "${edge.from}".`,
          edgeId: edge.id,
        });
      }
      if (!nodeIds.has(edge.to)) {
        errors.push({
          code: "flowchart.dangling-edge-to",
          message: `Edge "${edge.id}" references missing target node "${edge.to}".`,
          edgeId: edge.id,
        });
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  migrate(visual: Visual): AdapterMigrationResult {
    const changes: string[] = [];
    const nodeIds = new Set(visual.nodes.map((n) => n.id));
    const edges = visual.edges.filter((edge) => {
      const keep = nodeIds.has(edge.from) && nodeIds.has(edge.to);
      if (!keep) {
        changes.push(`Removed dangling edge "${edge.id}"`);
      }
      return keep;
    });

    let { version } = visual;
    if (version !== VISUAL_SCHEMA_VERSION) {
      changes.push(
        `Normalised version from ${String(version)} to ${VISUAL_SCHEMA_VERSION}`,
      );
      version = VISUAL_SCHEMA_VERSION;
    }

    if (changes.length === 0) {
      return { visual, migrated: false, changes: [] };
    }
    return {
      visual: { ...visual, version, edges },
      migrated: true,
      changes,
    };
  }

  editableNodeFields(): readonly string[] {
    return ["label", "shape", "icon", "color", "stroke", "textColor"];
  }
}

// ---------------------------------------------------------------------------
// Venn adapter (geometry-constrained kind)
// ---------------------------------------------------------------------------

/**
 * Adapter for the `venn` kind.
 *
 * Invariants:
 *  - Requires 2–3 nodes (circles).
 *  - Each node should have explicit x/y (circle center) and width (diameter).
 */
class VennAdapter implements VisualKindAdapter {
  readonly kind = "venn" as const;

  validate(visual: Visual): AdapterValidationResult {
    const errors: AdapterValidationError[] = [];
    if (visual.nodes.length < 2 || visual.nodes.length > 3) {
      errors.push({
        code: "venn.invalid-node-count",
        message: `Venn diagrams require 2 or 3 nodes (circles); got ${visual.nodes.length}.`,
      });
    }
    for (const node of visual.nodes) {
      if (typeof node.x !== "number" || typeof node.y !== "number") {
        errors.push({
          code: "venn.missing-position",
          message: `Venn node "${node.id}" is missing x/y (circle center position).`,
          nodeId: node.id,
        });
      }
      if (typeof node.width !== "number" || node.width <= 0) {
        errors.push({
          code: "venn.missing-diameter",
          message: `Venn node "${node.id}" is missing a positive width (circle diameter).`,
          nodeId: node.id,
        });
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  migrate(visual: Visual): AdapterMigrationResult {
    const changes: string[] = [];
    // Assign default positions/sizes for any nodes missing geometry
    const cx = visual.width / 2;
    const cy = visual.height / 2;
    const defaultDiameter = Math.min(visual.width, visual.height) * 0.45;
    const offsets = [
      { dx: -defaultDiameter * 0.3, dy: 0 },
      { dx: defaultDiameter * 0.3, dy: 0 },
      { dx: 0, dy: defaultDiameter * 0.4 },
    ];
    const nodes: VisualNode[] = visual.nodes.map((node, i) => {
      const off = offsets[i] ?? { dx: 0, dy: 0 };
      let updated = node;
      if (typeof node.x !== "number" || typeof node.y !== "number") {
        updated = { ...updated, x: cx + off.dx, y: cy + off.dy };
        changes.push(`Assigned position to venn node "${node.id}"`);
      }
      if (typeof node.width !== "number" || node.width <= 0) {
        updated = {
          ...updated,
          width: defaultDiameter,
          height: defaultDiameter,
        };
        changes.push(`Assigned diameter to venn node "${node.id}"`);
      }
      return updated;
    });
    if (changes.length === 0) {
      return { visual, migrated: false, changes: [] };
    }
    return { visual: { ...visual, nodes }, migrated: true, changes };
  }

  editableNodeFields(): readonly string[] {
    return ["label", "color", "stroke", "textColor"];
  }
}

// ---------------------------------------------------------------------------
// Comparison adapter (value-driven column layout)
// ---------------------------------------------------------------------------

/**
 * Adapter for the `comparison` kind.
 *
 * Invariants:
 *  - Each node's `value` field must be a non-negative integer (column index).
 *
 * Migration:
 *  - Nodes missing `value` are assigned column index 0.
 */
class ComparisonAdapter implements VisualKindAdapter {
  readonly kind = "comparison" as const;

  validate(visual: Visual): AdapterValidationResult {
    const errors: AdapterValidationError[] = [];
    for (const node of visual.nodes) {
      if (
        typeof node.value !== "number" ||
        !Number.isInteger(node.value) ||
        node.value < 0
      ) {
        errors.push({
          code: "comparison.invalid-column-index",
          message: `Comparison node "${node.id}" has invalid value "${String(node.value)}" — must be a non-negative integer column index.`,
          nodeId: node.id,
        });
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  migrate(visual: Visual): AdapterMigrationResult {
    const changes: string[] = [];
    const nodes = visual.nodes.map((node) => {
      if (
        typeof node.value !== "number" ||
        !Number.isInteger(node.value) ||
        node.value < 0
      ) {
        changes.push(`Assigned column index 0 to comparison node "${node.id}"`);
        return { ...node, value: 0 };
      }
      return node;
    });
    if (changes.length === 0) {
      return { visual, migrated: false, changes: [] };
    }
    return { visual: { ...visual, nodes }, migrated: true, changes };
  }

  editableNodeFields(): readonly string[] {
    return ["label", "value", "icon", "color", "stroke", "textColor"];
  }
}

// ---------------------------------------------------------------------------
// Matrix adapter (quadrant-value kind)
// ---------------------------------------------------------------------------

/**
 * Adapter for the `matrix` kind.
 *
 * Invariants:
 *  - Each node's `value` must be a quadrant index: 0, 1, 2, or 3.
 */
class MatrixAdapter implements VisualKindAdapter {
  readonly kind = "matrix" as const;

  validate(visual: Visual): AdapterValidationResult {
    const errors: AdapterValidationError[] = [];
    for (const node of visual.nodes) {
      if (![0, 1, 2, 3].includes(node.value as number)) {
        errors.push({
          code: "matrix.invalid-quadrant",
          message: `Matrix node "${node.id}" has invalid quadrant value "${String(node.value)}" — must be 0, 1, 2, or 3.`,
          nodeId: node.id,
        });
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  migrate(visual: Visual): AdapterMigrationResult {
    const changes: string[] = [];
    const nodes = visual.nodes.map((node) => {
      if (![0, 1, 2, 3].includes(node.value as number)) {
        changes.push(`Assigned quadrant 0 to matrix node "${node.id}"`);
        return { ...node, value: 0 };
      }
      return node;
    });
    if (changes.length === 0) {
      return { visual, migrated: false, changes: [] };
    }
    return { visual: { ...visual, nodes }, migrated: true, changes };
  }

  editableNodeFields(): readonly string[] {
    return ["label", "value", "icon", "color", "stroke", "textColor"];
  }
}

// ---------------------------------------------------------------------------
// Funnel adapter (ordered, decreasing values)
// ---------------------------------------------------------------------------

/**
 * Adapter for the `funnel` kind.
 *
 * Invariants:
 *  - Every node should have a numeric value ≥ 0.
 */
class FunnelAdapter implements VisualKindAdapter {
  readonly kind = "funnel" as const;

  validate(visual: Visual): AdapterValidationResult {
    const errors: AdapterValidationError[] = [];
    for (const node of visual.nodes) {
      if (typeof node.value !== "number" || node.value < 0) {
        errors.push({
          code: "funnel.invalid-value",
          message: `Funnel node "${node.id}" needs a non-negative numeric value (band width).`,
          nodeId: node.id,
        });
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  migrate(visual: Visual): AdapterMigrationResult {
    const changes: string[] = [];
    const total = visual.nodes.length;
    const nodes = visual.nodes.map((node, i) => {
      if (typeof node.value !== "number" || node.value < 0) {
        const defaultValue = total > 1 ? total - i : 1;
        changes.push(
          `Assigned value=${defaultValue} to funnel node "${node.id}"`,
        );
        return { ...node, value: defaultValue };
      }
      return node;
    });
    if (changes.length === 0) {
      return { visual, migrated: false, changes: [] };
    }
    return { visual: { ...visual, nodes }, migrated: true, changes };
  }

  editableNodeFields(): readonly string[] {
    return ["label", "value", "color", "stroke", "textColor"];
  }
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const ADAPTERS: Record<VisualKind, VisualKindAdapter> = {
  flowchart: new FlowchartAdapter(),
  mindmap: new DefaultAdapter("mindmap"),
  list: new DefaultAdapter("list"),
  chart: new ChartAdapter(),
  concept: new DefaultAdapter("concept"),
  timeline: new DefaultAdapter("timeline"),
  cycle: new DefaultAdapter("cycle"),
  comparison: new ComparisonAdapter(),
  funnel: new FunnelAdapter(),
  venn: new VennAdapter(),
  pyramid: new DefaultAdapter("pyramid"),
  matrix: new MatrixAdapter(),
  orgchart: new DefaultAdapter("orgchart"),
} satisfies Record<VisualKind, VisualKindAdapter>;

/**
 * Returns the {@link VisualKindAdapter} for the given kind.
 * Always returns a valid adapter — kinds without special semantics use the
 * {@link DefaultAdapter}.
 */
export function getAdapter(kind: VisualKind): VisualKindAdapter {
  return ADAPTERS[kind];
}

/**
 * Convenience: validates a visual using both the schema layer (assumed already
 * run) and the kind-specific adapter.
 *
 * Returns `{ ok: true }` when all invariants pass, or a merged error list.
 */
export function validateWithAdapter(visual: Visual): AdapterValidationResult {
  return getAdapter(visual.type).validate(visual);
}

/**
 * Convenience: migrates a visual through its kind-specific adapter.
 */
export function migrateWithAdapter(visual: Visual): AdapterMigrationResult {
  return getAdapter(visual.type).migrate(visual);
}

/**
 * Asserts that every {@link VisualKind} has an adapter registered.
 * Called from tests to detect drift.
 */
export function assertAdapterCompleteness(): void {
  for (const kind of VISUAL_KINDS) {
    const adapter = ADAPTERS[kind];
    if (!adapter) {
      throw new Error(`[adapters] Missing adapter for kind: ${kind}`);
    }
    if (adapter.kind !== kind) {
      throw new Error(
        `[adapters] Adapter kind mismatch: expected "${kind}", got "${adapter.kind}"`,
      );
    }
  }
}
