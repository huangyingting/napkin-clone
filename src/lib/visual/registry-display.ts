/** Display, layout, and shape metadata for each visual kind. */

import { NODE_SHAPES, type VisualKind } from "@/lib/visual/schema";
import type { VisualKindDisplayMetadata } from "./registry-types";

export const KIND_DISPLAY_METADATA = {
  flowchart: {
    label: "Flowchart",
    description: "Steps & decisions",
    keywords: ["flow", "process", "steps", "diagram", "workflow"],
    iconName: "Workflow",
    layoutFamily: "positioned",
    allowedShapes: [...NODE_SHAPES],
    defaultShape: "rounded",
  },

  mindmap: {
    label: "Mind map",
    description: "Branching ideas",
    keywords: ["mind", "map", "brainstorm", "branches", "ideas"],
    iconName: "Network",
    layoutFamily: "positioned",
    allowedShapes: [...NODE_SHAPES],
    defaultShape: "pill",
  },

  list: {
    label: "List",
    description: "Itemized points",
    keywords: ["list", "items", "points", "checklist"],
    iconName: "ListChecks",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded", "pill"],
    defaultShape: "rounded",
  },

  chart: {
    label: "Chart",
    description: "Bars & values",
    keywords: ["chart", "bar", "graph", "data", "values"],
    iconName: "BarChart3",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rectangle",
  },

  concept: {
    label: "Concept",
    description: "Central idea map",
    keywords: ["concept", "idea", "relationship", "map"],
    iconName: "Lightbulb",
    layoutFamily: "positioned",
    allowedShapes: [...NODE_SHAPES],
    defaultShape: "ellipse",
  },

  timeline: {
    label: "Timeline",
    description: "Events over time",
    keywords: ["timeline", "time", "events", "history", "schedule"],
    iconName: "Milestone",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded", "ellipse"],
    defaultShape: "rounded",
  },

  cycle: {
    label: "Cycle",
    description: "Repeating loop",
    keywords: ["cycle", "loop", "circular", "process"],
    iconName: "RefreshCw",
    layoutFamily: "derived",
    allowedShapes: ["rounded", "pill", "ellipse"],
    defaultShape: "rounded",
  },

  comparison: {
    label: "Comparison",
    description: "Side by side",
    keywords: ["comparison", "compare", "versus", "vs", "columns"],
    iconName: "Columns2",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rounded",
  },

  funnel: {
    label: "Funnel",
    description: "Narrowing stages",
    keywords: ["funnel", "stages", "conversion", "pipeline"],
    iconName: "Filter",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rectangle",
  },

  venn: {
    label: "Venn",
    description: "Overlapping sets",
    keywords: ["venn", "overlap", "sets", "intersection"],
    iconName: "Combine",
    layoutFamily: "positioned",
    allowedShapes: ["ellipse"],
    defaultShape: "ellipse",
  },

  pyramid: {
    label: "Pyramid",
    description: "Stacked hierarchy",
    keywords: ["pyramid", "hierarchy", "levels", "stack"],
    iconName: "Triangle",
    layoutFamily: "derived",
    allowedShapes: ["rectangle"],
    defaultShape: "rectangle",
  },

  matrix: {
    label: "Matrix",
    description: "2\xd72 quadrant grid",
    keywords: ["matrix", "quadrant", "grid", "2x2"],
    iconName: "Grid2x2",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rounded",
  },

  orgchart: {
    label: "Org chart",
    description: "Team hierarchy",
    keywords: ["org", "orgchart", "hierarchy", "team", "tree"],
    iconName: "GitBranch",
    layoutFamily: "positioned",
    allowedShapes: ["rounded", "rectangle", "pill"],
    defaultShape: "rounded",
  },
} satisfies Record<VisualKind, VisualKindDisplayMetadata>;
