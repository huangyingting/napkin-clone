import type { Visual, VisualKind } from "./schema";

/**
 * Read-only metadata derived from a {@link Visual} payload.
 * All fields are computed in one synchronous pass — no DOM access, no I/O.
 */
export interface VisualInfo {
  /** The visual's diagram kind (flowchart, mindmap, …). */
  kind: VisualKind;
  /** Total number of nodes in the visual. */
  nodeCount: number;
  /** Total number of edges/connections in the visual. */
  edgeCount: number;
  /** Visual title if set, otherwise undefined. */
  title: string | undefined;
  /** Source text the visual was generated from, if available. */
  sourceText: string | undefined;
  /** Number of active visual effects (shadow, sketch, …). */
  effectCount: number;
  /** Global font family name or empty string when using the default. */
  fontFamily: string;
}

/**
 * Derives read-only metadata from a {@link Visual} object.
 * Safe to call outside React (no hooks, no DOM), suitable for unit tests.
 */
export function computeVisualInfo(visual: Visual): VisualInfo {
  return {
    kind: visual.type,
    nodeCount: visual.nodes.length,
    edgeCount: visual.edges.length,
    title: visual.title?.trim() || undefined,
    sourceText: visual.sourceText?.trim() || undefined,
    effectCount: (visual.effects ?? []).length,
    fontFamily: visual.style.fontFamily,
  };
}
