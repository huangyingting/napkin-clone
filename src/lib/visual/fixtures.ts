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

/** All sample fixtures keyed by visual kind. */
export const FIXTURES: Record<VisualKind, Visual> = {
  flowchart,
  mindmap,
  list,
  chart,
  concept,
};

/** Sample fixtures in the canonical {@link VISUAL_KINDS} order. */
export const FIXTURE_LIST: Visual[] = VISUAL_KINDS.map(
  (kind) => FIXTURES[kind],
);
