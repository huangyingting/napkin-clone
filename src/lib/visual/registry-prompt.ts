/** AI prompt guidance and generation constraints for each visual kind. */

import type { VisualKind } from "@/lib/visual/schema";
import type { KindPromptConstraints } from "./registry-types";

export const KIND_PROMPT_CONSTRAINTS = {
  flowchart: {
    guidance:
      "flowchart: a directed process with edges; use shapes ellipse (start/end), diamond (decision), rounded (step); set node x/y to lay it out top-to-bottom.",
    requiresNodeValue: false,
    requiresNodePosition: true,
    edgesRelevant: true,
  },

  mindmap: {
    guidance:
      "mindmap: one central node with branches radiating out; use edges from the center; set x/y around the center.",
    requiresNodeValue: false,
    requiresNodePosition: true,
    edgesRelevant: true,
  },

  list: {
    guidance:
      "list/scene: an ordered set of points; order nodes meaningfully; x/y may be omitted (layout is derived from order).",
    requiresNodeValue: false,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  chart: {
    guidance:
      "chart: a bar chart; every node needs a numeric `value`; x/y may be omitted (bars are laid out from value + index).",
    requiresNodeValue: true,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  concept: {
    guidance:
      "concept: a non-linear graph of related ideas connected by labeled edges; set x/y to spread nodes out.",
    requiresNodeValue: false,
    requiresNodePosition: true,
    edgesRelevant: true,
  },

  timeline: {
    guidance:
      "timeline: an ordered sequence of steps along a horizontal axis; order nodes chronologically; x/y may be omitted (steps are laid out from order).",
    requiresNodeValue: false,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  cycle: {
    guidance:
      "cycle: a repeating loop of stages; order nodes in the direction of the cycle; x/y and edges may be omitted (nodes are arranged around a ring with directed arrows).",
    requiresNodeValue: false,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  comparison: {
    guidance:
      "comparison: side-by-side columns of grouped items; set each node's `value` to its column index (0, 1, 2, \u2026) to group nodes into columns; the FIRST node in each column is the column title and the rest are its items; x/y and edges may be omitted.",
    requiresNodeValue: true,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  funnel: {
    guidance:
      "funnel: stacked stages that narrow downward; order nodes from widest (top) to narrowest (bottom) and give each a decreasing numeric `value` that drives its band width; x/y and edges may be omitted.",
    requiresNodeValue: true,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  venn: {
    guidance:
      "venn: 2\u20133 overlapping sets; set x/y to the center of each circle and `width` to its diameter (circles should partially overlap); no edges needed; 2 circles for simple overlap, 3 for triple overlap.",
    requiresNodeValue: false,
    requiresNodePosition: true,
    edgesRelevant: false,
  },

  pyramid: {
    guidance:
      "pyramid: stacked hierarchy levels \u2014 apex (top, narrowest) to base (bottom, widest); order nodes from apex to base (first node = top level, last = base level); no x/y or edges needed (widths are derived from position).",
    requiresNodeValue: false,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  matrix: {
    guidance:
      "matrix: 2\xd72 quadrant grid; set each node's `value` to its quadrant index (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right); multiple nodes can share a quadrant; x/y and edges may be omitted.",
    requiresNodeValue: true,
    requiresNodePosition: false,
    edgesRelevant: false,
  },

  orgchart: {
    guidance:
      "orgchart: hierarchical tree of roles or entities; set node x/y to lay it out top-to-bottom (root at top, leaves at bottom); add edges from each parent to its direct reports; use shape `rounded` for all nodes.",
    requiresNodeValue: false,
    requiresNodePosition: true,
    edgesRelevant: true,
  },
} satisfies Record<VisualKind, KindPromptConstraints>;
