/**
 * Sample visual fixtures — one per {@link VisualKind}. Used by the gallery page
 * (`/visuals`) to verify the renderer and as reference data for later stories
 * (AI generation output should validate against the same schema).
 */

import {
  DEFAULT_STYLE,
  VISUAL_KINDS,
  VISUAL_SCHEMA_VERSION,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

const flowchart: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "flowchart",
  title: "User login flow",
  width: 700,
  height: 540,
  style: { ...DEFAULT_STYLE },
  nodes: [
    {
      id: "start",
      label: "Start",
      x: 170,
      y: 60,
      width: 130,
      height: 50,
      shape: "ellipse",
      icon: "Flag",
    },
    {
      id: "creds",
      label: "Enter credentials",
      x: 170,
      y: 175,
      width: 190,
      height: 56,
      shape: "rounded",
      icon: "Key",
    },
    {
      id: "valid",
      label: "Valid?",
      x: 170,
      y: 310,
      width: 160,
      height: 96,
      shape: "diamond",
      icon: "CircleHelp",
    },
    {
      id: "dashboard",
      label: "Open dashboard",
      x: 170,
      y: 460,
      width: 190,
      height: 56,
      shape: "rounded",
      icon: "CircleCheck",
    },
    {
      id: "error",
      label: "Show error",
      x: 480,
      y: 310,
      width: 170,
      height: 56,
      shape: "rounded",
      icon: "TriangleAlert",
    },
  ],
  edges: [
    { id: "e1", from: "start", to: "creds" },
    { id: "e2", from: "creds", to: "valid" },
    { id: "e3", from: "valid", to: "dashboard", label: "Yes" },
    { id: "e4", from: "valid", to: "error", label: "No" },
    { id: "e5", from: "error", to: "creds" },
  ],
};

const mindmap: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "mindmap",
  title: "Content marketing",
  width: 760,
  height: 470,
  style: { ...DEFAULT_STYLE },
  nodes: [
    {
      id: "root",
      label: "Content Marketing",
      x: 380,
      y: 235,
      width: 200,
      height: 64,
      shape: "pill",
    },
    {
      id: "blog",
      label: "Blog",
      x: 150,
      y: 95,
      width: 120,
      height: 48,
      shape: "pill",
    },
    {
      id: "video",
      label: "Video",
      x: 610,
      y: 95,
      width: 120,
      height: 48,
      shape: "pill",
    },
    {
      id: "social",
      label: "Social",
      x: 120,
      y: 245,
      width: 120,
      height: 48,
      shape: "pill",
    },
    {
      id: "email",
      label: "Email",
      x: 630,
      y: 250,
      width: 120,
      height: 48,
      shape: "pill",
    },
    {
      id: "seo",
      label: "SEO",
      x: 300,
      y: 410,
      width: 120,
      height: 48,
      shape: "pill",
    },
    {
      id: "newsletter",
      label: "Newsletter",
      x: 520,
      y: 410,
      width: 140,
      height: 48,
      shape: "pill",
    },
  ],
  edges: [
    { id: "m1", from: "root", to: "blog" },
    { id: "m2", from: "root", to: "video" },
    { id: "m3", from: "root", to: "social" },
    { id: "m4", from: "root", to: "email" },
    { id: "m5", from: "root", to: "seo" },
    { id: "m6", from: "root", to: "newsletter" },
  ],
};

const list: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "list",
  title: "How it works",
  width: 680,
  height: 372,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "s1", label: "Paste your text", icon: "ClipboardList" },
    { id: "s2", label: "Generate visual options", icon: "Sparkles" },
    { id: "s3", label: "Polish colors and layout", icon: "Wrench" },
    { id: "s4", label: "Export & share", icon: "Send" },
  ],
  edges: [],
};

const chart: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "chart",
  title: "Weekly active users",
  width: 720,
  height: 420,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "mon", label: "Mon", value: 120 },
    { id: "tue", label: "Tue", value: 180 },
    { id: "wed", label: "Wed", value: 150 },
    { id: "thu", label: "Thu", value: 220 },
    { id: "fri", label: "Fri", value: 260 },
  ],
  edges: [],
};

const concept: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "concept",
  title: "Photosynthesis",
  width: 760,
  height: 480,
  style: { ...DEFAULT_STYLE },
  nodes: [
    {
      id: "sun",
      label: "Sunlight",
      x: 140,
      y: 90,
      width: 130,
      height: 60,
      shape: "ellipse",
    },
    {
      id: "water",
      label: "Water",
      x: 140,
      y: 380,
      width: 120,
      height: 60,
      shape: "ellipse",
    },
    {
      id: "co2",
      label: "Carbon dioxide",
      x: 380,
      y: 410,
      width: 170,
      height: 64,
      shape: "ellipse",
    },
    {
      id: "chloro",
      label: "Chloroplast",
      x: 400,
      y: 200,
      width: 170,
      height: 66,
      shape: "ellipse",
    },
    {
      id: "glucose",
      label: "Glucose",
      x: 640,
      y: 130,
      width: 130,
      height: 60,
      shape: "ellipse",
    },
    {
      id: "oxygen",
      label: "Oxygen",
      x: 640,
      y: 360,
      width: 120,
      height: 60,
      shape: "ellipse",
    },
  ],
  edges: [
    { id: "c1", from: "sun", to: "chloro", label: "absorbed by" },
    { id: "c2", from: "water", to: "chloro", label: "absorbed by" },
    { id: "c3", from: "co2", to: "chloro", label: "enters" },
    { id: "c4", from: "chloro", to: "glucose", label: "produces" },
    { id: "c5", from: "chloro", to: "oxygen", label: "releases" },
  ],
};

const timeline: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "timeline",
  title: "Product launch timeline",
  width: 820,
  height: 300,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "research", label: "Research", icon: "Search" },
    { id: "design", label: "Design & prototype", icon: "Sparkles" },
    { id: "build", label: "Build MVP", icon: "Hammer" },
    { id: "beta", label: "Private beta", icon: "Flag" },
    { id: "launch", label: "Public launch", icon: "Rocket" },
  ],
  edges: [],
};

const cycle: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "cycle",
  title: "Continuous improvement loop",
  width: 620,
  height: 560,
  style: { ...DEFAULT_STYLE },
  nodes: [
    {
      id: "plan",
      label: "Plan",
      width: 140,
      height: 56,
      icon: "ClipboardList",
    },
    { id: "build", label: "Build", width: 140, height: 56, icon: "Hammer" },
    { id: "ship", label: "Ship", width: 140, height: 56, icon: "Rocket" },
    {
      id: "measure",
      label: "Measure",
      width: 140,
      height: 56,
      icon: "BarChart",
    },
    { id: "learn", label: "Learn", width: 140, height: 56, icon: "RefreshCw" },
  ],
  edges: [],
};

const comparison: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "comparison",
  title: "Plan comparison",
  width: 760,
  height: 340,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "free", label: "Free", value: 0, icon: "Sparkles" },
    { id: "free-1", label: "1 workspace", value: 0 },
    { id: "free-2", label: "Community support", value: 0 },
    { id: "free-3", label: "Basic exports", value: 0 },
    { id: "pro", label: "Pro", value: 1, icon: "Rocket" },
    { id: "pro-1", label: "Unlimited workspaces", value: 1 },
    { id: "pro-2", label: "Priority support", value: 1 },
    { id: "pro-3", label: "PNG & SVG export", value: 1 },
    { id: "ent", label: "Enterprise", value: 2, icon: "Crown" },
    { id: "ent-1", label: "SSO & SAML", value: 2 },
    { id: "ent-2", label: "Dedicated manager", value: 2 },
    { id: "ent-3", label: "Audit logs", value: 2 },
  ],
  edges: [],
};

const funnel: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "funnel",
  title: "Marketing funnel",
  width: 640,
  height: 420,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "visitors", label: "Visitors", value: 12000 },
    { id: "signups", label: "Signups", value: 5200 },
    { id: "trials", label: "Active trials", value: 2100 },
    { id: "paid", label: "Paid customers", value: 760 },
    { id: "advocates", label: "Advocates", value: 180 },
  ],
  edges: [],
};

const venn: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "venn",
  title: "Product overlap",
  width: 640,
  height: 480,
  style: { ...DEFAULT_STYLE },
  nodes: [
    {
      id: "design",
      label: "Design",
      x: 240,
      y: 220,
      width: 280,
      height: 280,
    },
    {
      id: "engineering",
      label: "Engineering",
      x: 400,
      y: 220,
      width: 280,
      height: 280,
    },
    {
      id: "business",
      label: "Business",
      x: 320,
      y: 320,
      width: 280,
      height: 280,
    },
  ],
  edges: [],
};

const pyramid: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "pyramid",
  title: "Maslow's hierarchy",
  width: 600,
  height: 460,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "self", label: "Self-actualisation" },
    { id: "esteem", label: "Esteem" },
    { id: "love", label: "Love & belonging" },
    { id: "safety", label: "Safety" },
    { id: "phys", label: "Physiological" },
  ],
  edges: [],
};

const matrix: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "matrix",
  title: "BCG growth-share matrix",
  width: 640,
  height: 480,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "star", label: "Stars", value: 0 },
    { id: "question", label: "Question Marks", value: 1 },
    { id: "cow", label: "Cash Cows", value: 2 },
    { id: "dog", label: "Dogs", value: 3 },
  ],
  edges: [],
};

const orgchart: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "orgchart",
  title: "Engineering org",
  width: 720,
  height: 460,
  style: { ...DEFAULT_STYLE },
  nodes: [
    {
      id: "ceo",
      label: "CEO",
      x: 360,
      y: 70,
      width: 150,
      height: 56,
      shape: "rounded",
    },
    {
      id: "cto",
      label: "CTO",
      x: 180,
      y: 200,
      width: 150,
      height: 56,
      shape: "rounded",
    },
    {
      id: "cfo",
      label: "CFO",
      x: 540,
      y: 200,
      width: 150,
      height: 56,
      shape: "rounded",
    },
    {
      id: "eng1",
      label: "Frontend Lead",
      x: 90,
      y: 340,
      width: 150,
      height: 56,
      shape: "rounded",
    },
    {
      id: "eng2",
      label: "Backend Lead",
      x: 270,
      y: 340,
      width: 150,
      height: 56,
      shape: "rounded",
    },
    {
      id: "fin1",
      label: "Controller",
      x: 540,
      y: 340,
      width: 150,
      height: 56,
      shape: "rounded",
    },
  ],
  edges: [
    { id: "o1", from: "ceo", to: "cto" },
    { id: "o2", from: "ceo", to: "cfo" },
    { id: "o3", from: "cto", to: "eng1" },
    { id: "o4", from: "cto", to: "eng2" },
    { id: "o5", from: "cfo", to: "fin1" },
  ],
};

/** All sample fixtures keyed by visual kind. */
export const FIXTURES: Record<VisualKind, Visual> = {
  flowchart,
  mindmap,
  list,
  chart,
  concept,
  timeline,
  cycle,
  comparison,
  funnel,
  venn,
  pyramid,
  matrix,
  orgchart,
};

/** Sample fixtures in the canonical {@link VISUAL_KINDS} order. */
export const FIXTURE_LIST: Visual[] = VISUAL_KINDS.map(
  (kind) => FIXTURES[kind],
);

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
