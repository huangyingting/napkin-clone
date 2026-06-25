/**
 * Product seed builders for blank visuals inserted without AI/network calls.
 *
 * These are deterministic creation templates, not sample gallery fixtures.
 */

import {
  DEFAULT_STYLE,
  VISUAL_SCHEMA_VERSION,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

/**
 * Builds a blank, schema-valid {@link Visual} for a given {@link VisualKind}
 * WITHOUT calling AI — the deterministic seed behind the "Insert Visual" path
 * (Phase 2). Each template returns the minimal sensible structure for its kind
 * (positioned nodes + edges for graph types, valued nodes for chart/funnel,
 * plain steps for list/timeline/cycle, columns for comparison) with the
 * {@link DEFAULT_STYLE} theme and placeholder labels the user then edits.
 *
 * A fresh object graph is returned on every call (style is shallow-cloned and
 * nodes/edges are literal arrays) so callers can mutate the result freely
 * without touching a shared template. Every returned value passes
 * `validateVisual` from `@/lib/visual/schema`.
 */
export function createBlankVisual(kind: VisualKind): Visual {
  return BLANK_BUILDERS[kind]();
}

function blankFlowchart(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "flowchart",
    title: "Flowchart",
    width: 480,
    height: 380,
    style: { ...DEFAULT_STYLE },
    nodes: [
      {
        id: "n1",
        label: "Start",
        x: 240,
        y: 70,
        width: 150,
        height: 56,
        shape: "rounded",
      },
      {
        id: "n2",
        label: "Step",
        x: 240,
        y: 190,
        width: 150,
        height: 56,
        shape: "rounded",
      },
      {
        id: "n3",
        label: "End",
        x: 240,
        y: 310,
        width: 150,
        height: 56,
        shape: "rounded",
      },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
    ],
  };
}

function blankMindmap(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "mindmap",
    title: "Mind map",
    width: 600,
    height: 360,
    style: { ...DEFAULT_STYLE },
    nodes: [
      {
        id: "root",
        label: "Central idea",
        x: 300,
        y: 180,
        width: 180,
        height: 60,
        shape: "pill",
      },
      {
        id: "b1",
        label: "Branch 1",
        x: 110,
        y: 90,
        width: 130,
        height: 48,
        shape: "pill",
      },
      {
        id: "b2",
        label: "Branch 2",
        x: 490,
        y: 90,
        width: 130,
        height: 48,
        shape: "pill",
      },
      {
        id: "b3",
        label: "Branch 3",
        x: 110,
        y: 270,
        width: 130,
        height: 48,
        shape: "pill",
      },
      {
        id: "b4",
        label: "Branch 4",
        x: 490,
        y: 270,
        width: 130,
        height: 48,
        shape: "pill",
      },
    ],
    edges: [
      { id: "m1", from: "root", to: "b1" },
      { id: "m2", from: "root", to: "b2" },
      { id: "m3", from: "root", to: "b3" },
      { id: "m4", from: "root", to: "b4" },
    ],
  };
}

function blankList(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "list",
    title: "List",
    width: 560,
    height: 320,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "i1", label: "First item" },
      { id: "i2", label: "Second item" },
      { id: "i3", label: "Third item" },
    ],
    edges: [],
  };
}

function blankChart(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "chart",
    title: "Chart",
    width: 640,
    height: 400,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "a", label: "A", value: 40 },
      { id: "b", label: "B", value: 80 },
      { id: "c", label: "C", value: 60 },
      { id: "d", label: "D", value: 100 },
    ],
    edges: [],
  };
}

function blankConcept(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "concept",
    title: "Concept map",
    width: 600,
    height: 380,
    style: { ...DEFAULT_STYLE },
    nodes: [
      {
        id: "c1",
        label: "Concept",
        x: 300,
        y: 90,
        width: 160,
        height: 60,
        shape: "ellipse",
      },
      {
        id: "c2",
        label: "Idea A",
        x: 140,
        y: 290,
        width: 150,
        height: 60,
        shape: "ellipse",
      },
      {
        id: "c3",
        label: "Idea B",
        x: 460,
        y: 290,
        width: 150,
        height: 60,
        shape: "ellipse",
      },
    ],
    edges: [
      { id: "ce1", from: "c1", to: "c2", label: "relates to" },
      { id: "ce2", from: "c1", to: "c3", label: "relates to" },
    ],
  };
}

function blankTimeline(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "timeline",
    title: "Timeline",
    width: 720,
    height: 280,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "t1", label: "Phase 1" },
      { id: "t2", label: "Phase 2" },
      { id: "t3", label: "Phase 3" },
      { id: "t4", label: "Phase 4" },
    ],
    edges: [],
  };
}

function blankCycle(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "cycle",
    title: "Cycle",
    width: 560,
    height: 480,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "y1", label: "Step 1", width: 140, height: 56 },
      { id: "y2", label: "Step 2", width: 140, height: 56 },
      { id: "y3", label: "Step 3", width: 140, height: 56 },
      { id: "y4", label: "Step 4", width: 140, height: 56 },
    ],
    edges: [],
  };
}

function blankComparison(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "comparison",
    title: "Comparison",
    width: 640,
    height: 320,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "left", label: "Option A", value: 0 },
      { id: "left-1", label: "Point one", value: 0 },
      { id: "left-2", label: "Point two", value: 0 },
      { id: "right", label: "Option B", value: 1 },
      { id: "right-1", label: "Point one", value: 1 },
      { id: "right-2", label: "Point two", value: 1 },
    ],
    edges: [],
  };
}

function blankFunnel(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "funnel",
    title: "Funnel",
    width: 560,
    height: 380,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "f1", label: "Stage 1", value: 1000 },
      { id: "f2", label: "Stage 2", value: 600 },
      { id: "f3", label: "Stage 3", value: 300 },
      { id: "f4", label: "Stage 4", value: 120 },
    ],
    edges: [],
  };
}

function blankVenn(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "venn",
    title: "Venn diagram",
    width: 560,
    height: 440,
    style: { ...DEFAULT_STYLE },
    nodes: [
      {
        id: "v1",
        label: "Set A",
        x: 210,
        y: 200,
        width: 240,
        height: 240,
      },
      {
        id: "v2",
        label: "Set B",
        x: 350,
        y: 200,
        width: 240,
        height: 240,
      },
    ],
    edges: [],
  };
}

function blankPyramid(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "pyramid",
    title: "Pyramid",
    width: 560,
    height: 420,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "p1", label: "Level 1" },
      { id: "p2", label: "Level 2" },
      { id: "p3", label: "Level 3" },
      { id: "p4", label: "Level 4" },
    ],
    edges: [],
  };
}

function blankMatrix(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "matrix",
    title: "2×2 matrix",
    width: 560,
    height: 440,
    style: { ...DEFAULT_STYLE },
    nodes: [
      { id: "q0", label: "Quadrant A", value: 0 },
      { id: "q1", label: "Quadrant B", value: 1 },
      { id: "q2", label: "Quadrant C", value: 2 },
      { id: "q3", label: "Quadrant D", value: 3 },
    ],
    edges: [],
  };
}

function blankOrgchart(): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "orgchart",
    title: "Org chart",
    width: 560,
    height: 380,
    style: { ...DEFAULT_STYLE },
    nodes: [
      {
        id: "root",
        label: "Leader",
        x: 280,
        y: 70,
        width: 150,
        height: 56,
        shape: "rounded",
      },
      {
        id: "c1",
        label: "Report A",
        x: 140,
        y: 210,
        width: 150,
        height: 56,
        shape: "rounded",
      },
      {
        id: "c2",
        label: "Report B",
        x: 420,
        y: 210,
        width: 150,
        height: 56,
        shape: "rounded",
      },
    ],
    edges: [
      { id: "o1", from: "root", to: "c1" },
      { id: "o2", from: "root", to: "c2" },
    ],
  };
}

const BLANK_BUILDERS: Record<VisualKind, () => Visual> = {
  flowchart: blankFlowchart,
  mindmap: blankMindmap,
  list: blankList,
  chart: blankChart,
  concept: blankConcept,
  timeline: blankTimeline,
  cycle: blankCycle,
  comparison: blankComparison,
  funnel: blankFunnel,
  venn: blankVenn,
  pyramid: blankPyramid,
  matrix: blankMatrix,
  orgchart: blankOrgchart,
};
