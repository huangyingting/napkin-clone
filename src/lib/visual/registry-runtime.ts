/** Runtime descriptors that bind each visual kind to schema/layout/render/transform concerns. */

import type { VisualKind } from "@/lib/visual/schema";
import type { VisualRuntimeDescriptor } from "./registry-types";

const SCHEMA_VALIDATION = {
  core: "validateVisual",
  nodes: "validateNode",
  edges: "validateEdge",
  style: "normalizeStyle",
  effects: "parseEffects",
  exportOptions: "parseVisualExportOptions",
} as const;

/* node:coverage ignore next 10 -- Runtime checklist fields are asserted through descriptors; tsx maps this shared object as uncovered. @preserve */
const CHECKLIST = {
  schema: true,
  layout: true,
  render: true,
  edit: true,
  export: true,
  prompt: true,
  transforms: true,
  validation: true,
} as const;

export const KIND_RUNTIME_DESCRIPTORS = {
  flowchart: {
    schema: SCHEMA_VALIDATION,
    layout: {
      family: "positioned",
      algorithm: "explicit-position",
      elasticAlgorithm: "flowchart-column",
    },
    render: {
      family: "positioned-graph",
      component: "Flowchart",
      primitives: ["canvas", "effects", "nodes", "edges", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "stack-vertical",
      defaultShape: "rounded",
      preservesEdges: true,
      autoLayoutSupported: true,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
    checklist: CHECKLIST,
  },
  mindmap: {
    schema: SCHEMA_VALIDATION,
    layout: {
      family: "positioned",
      algorithm: "explicit-position",
      elasticAlgorithm: "radial",
    },
    render: {
      family: "positioned-graph",
      component: "MindMap",
      primitives: ["canvas", "effects", "nodes", "edges", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "radial",
      defaultShape: "pill",
      preservesEdges: true,
      autoLayoutSupported: true,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
    checklist: CHECKLIST,
  },
  list: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "list-stack" },
    render: {
      family: "ordered-list",
      component: "ListScene",
      primitives: ["canvas", "effects", "nodes", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rounded",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  chart: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "bar-chart" },
    render: {
      family: "bar-chart",
      component: "BarChart",
      primitives: ["canvas", "effects", "nodes", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rectangle",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  concept: {
    schema: SCHEMA_VALIDATION,
    layout: {
      family: "positioned",
      algorithm: "explicit-position",
      elasticAlgorithm: "radial",
    },
    render: {
      family: "positioned-graph",
      component: "ConceptMap",
      primitives: ["canvas", "effects", "nodes", "edges", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "radial",
      defaultShape: "ellipse",
      preservesEdges: true,
      autoLayoutSupported: true,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
    checklist: CHECKLIST,
  },
  timeline: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "timeline-axis" },
    render: {
      family: "timeline",
      component: "Timeline",
      primitives: ["canvas", "effects", "nodes", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rounded",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  cycle: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "cycle-ring" },
    render: {
      family: "cycle",
      component: "CycleScene",
      primitives: ["canvas", "effects", "nodes", "edges", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rounded",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  comparison: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "comparison-columns" },
    render: {
      family: "comparison",
      component: "Comparison",
      primitives: ["canvas", "effects", "nodes", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rounded",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  funnel: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "funnel-bands" },
    render: {
      family: "funnel",
      component: "Funnel",
      primitives: ["canvas", "effects", "nodes", "labels"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rectangle",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  venn: {
    schema: SCHEMA_VALIDATION,
    layout: {
      family: "positioned",
      algorithm: "venn-circles",
      elasticAlgorithm: "radial",
    },
    render: {
      family: "venn",
      component: "VennDiagram",
      primitives: ["canvas", "effects", "nodes", "labels"],
    },
    transform: {
      kindSwitchLayout: "radial",
      defaultShape: "ellipse",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  pyramid: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "pyramid-bands" },
    render: {
      family: "pyramid",
      component: "Pyramid",
      primitives: ["canvas", "effects", "nodes", "labels"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rectangle",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  matrix: {
    schema: SCHEMA_VALIDATION,
    layout: { family: "derived", algorithm: "matrix-quadrants" },
    render: {
      family: "matrix",
      component: "MatrixScene",
      primitives: ["canvas", "effects", "nodes", "labels"],
    },
    transform: {
      kindSwitchLayout: "strip-position",
      defaultShape: "rounded",
      preservesEdges: true,
      autoLayoutSupported: false,
    },
    validation: {
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
    checklist: CHECKLIST,
  },
  orgchart: {
    schema: SCHEMA_VALIDATION,
    layout: {
      family: "positioned",
      algorithm: "orgchart-tree",
      elasticAlgorithm: "orgchart-tree",
    },
    render: {
      family: "orgchart",
      component: "OrgChart",
      primitives: ["canvas", "effects", "nodes", "edges", "labels", "icons"],
    },
    transform: {
      kindSwitchLayout: "stack-vertical",
      defaultShape: "rounded",
      preservesEdges: true,
      autoLayoutSupported: true,
    },
    validation: {
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
    checklist: CHECKLIST,
  },
} satisfies Record<VisualKind, VisualRuntimeDescriptor>;
