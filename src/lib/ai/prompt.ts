/**
 * Prompt construction for AI visual generation (US-010).
 *
 * The model is asked to return a single JSON object `{ "visuals": [...] }` whose
 * entries each conform to the canonical visual schema
 * (`@/lib/visual/schema`). The schema description is derived from the schema
 * constants so the prompt stays in sync with the validator.
 */

import { ICON_CATALOG } from "@/lib/icons/catalog";
import {
  NODE_SHAPES,
  VISUAL_KINDS,
  VISUAL_SCHEMA_VERSION,
  type VisualKind,
} from "@/lib/visual/schema";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Layout orientation hint passed to the model. `"auto"` = today's behavior. */
export const ORIENTATIONS = [
  "vertical",
  "horizontal",
  "square",
  "auto",
] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** Controls how much the model expands the source text. Omitted = today's behavior. */
export const DETAIL_LEVELS = ["detailed", "summary"] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export function isOrientation(value: unknown): value is Orientation {
  return ORIENTATIONS.includes(value as Orientation);
}

export function isDetailLevel(value: unknown): value is DetailLevel {
  return DETAIL_LEVELS.includes(value as DetailLevel);
}

export interface BuildMessagesOptions {
  text: string;
  /** Optional desired visual type to bias generation toward. */
  type?: VisualKind;
  /** Minimum number of candidate visuals the model should return. */
  count: number;
  /** Optional reason the previous attempt was rejected (used on retry). */
  retryReason?: string;
  /**
   * Layout orientation. `"auto"` (or omitted) reproduces today's behavior:
   * the model chooses the canvas aspect ratio freely.
   */
  orientation?: Orientation;
  /**
   * `"detailed"` asks the model to expand the text (more nodes, richer labels).
   * `"summary"` asks for a compact output (fewer nodes, terse labels).
   * Omitting the field reproduces today's behavior.
   */
  detailLevel?: DetailLevel;
  /**
   * When `true`, the model is instructed to preserve the user's original
   * wording in node labels rather than paraphrasing.
   */
  stayCloserToText?: boolean;
}

const KIND_GUIDANCE: Record<VisualKind, string> = {
  flowchart:
    "flowchart: a directed process with edges; use shapes ellipse (start/end), diamond (decision), rounded (step); set node x/y to lay it out top-to-bottom.",
  mindmap:
    "mindmap: one central node with branches radiating out; use edges from the center; set x/y around the center.",
  list: "list/scene: an ordered set of points; order nodes meaningfully; x/y may be omitted (layout is derived from order).",
  chart:
    "chart: a bar chart; every node needs a numeric `value`; x/y may be omitted (bars are laid out from value + index).",
  concept:
    "concept: a non-linear graph of related ideas connected by labeled edges; set x/y to spread nodes out.",
  timeline:
    "timeline: an ordered sequence of steps along a horizontal axis; order nodes chronologically; x/y may be omitted (steps are laid out from order).",
  cycle:
    "cycle: a repeating loop of stages; order nodes in the direction of the cycle; x/y and edges may be omitted (nodes are arranged around a ring with directed arrows).",
  comparison:
    "comparison: side-by-side columns of grouped items; set each node's `value` to its column index (0, 1, 2, …) to group nodes into columns; the FIRST node in each column is the column title and the rest are its items; x/y and edges may be omitted.",
  funnel:
    "funnel: stacked stages that narrow downward; order nodes from widest (top) to narrowest (bottom) and give each a decreasing numeric `value` that drives its band width; x/y and edges may be omitted.",
  venn: "venn: 2–3 overlapping sets; set x/y to the center of each circle and `width` to its diameter (circles should partially overlap); no edges needed; 2 circles for simple overlap, 3 for triple overlap.",
  pyramid:
    "pyramid: stacked hierarchy levels — apex (top, narrowest) to base (bottom, widest); order nodes from apex to base (first node = top level, last = base level); no x/y or edges needed (widths are derived from position).",
  matrix:
    "matrix: 2×2 quadrant grid; set each node's `value` to its quadrant index (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right); multiple nodes can share a quadrant; x/y and edges may be omitted.",
  orgchart:
    "orgchart: hierarchical tree of roles or entities; set node x/y to lay it out top-to-bottom (root at top, leaves at bottom); add edges from each parent to its direct reports; use shape `rounded` for all nodes.",
};

const ICON_NAMES = ICON_CATALOG.map((entry) => entry.name);

function schemaDescription(): string {
  return [
    "Each visual is a JSON object with this exact shape:",
    `{`,
    `  "version": ${VISUAL_SCHEMA_VERSION},`,
    `  "type": one of ${VISUAL_KINDS.map((k) => `"${k}"`).join(" | ")},`,
    `  "title": short string (optional),`,
    `  "width": number (canvas width, e.g. 760),`,
    `  "height": number (canvas height, e.g. 480),`,
    `  "nodes": [`,
    `    {`,
    `      "id": unique non-empty string,`,
    `      "label": string,`,
    `      "x": number (node CENTER x, optional),`,
    `      "y": number (node CENTER y, optional),`,
    `      "width": positive number (optional),`,
    `      "height": positive number (optional),`,
    `      "shape": one of ${NODE_SHAPES.map((s) => `"${s}"`).join(" | ")} (optional),`,
    `      "value": number (required for chart bars, optional otherwise),`,
    `      "color": CSS color string (optional),`,
    `      "stroke": CSS color string for the node border (optional),`,
    `      "textColor": CSS color string for the node label (optional),`,
    `      "icon": optional icon name from the bundled catalog`,
    `    }`,
    `  ],`,
    `  "edges": [`,
    `    { "id": unique string, "from": node id, "to": node id, "label": string (optional), "directed": boolean (optional), "style": "straight" | "curved" (optional) }`,
    `  ],`,
    `  "style": {`,
    `    "palette": [hex colors], "background": hex, "nodeFill": hex, "nodeStroke": hex,`,
    `    "nodeText": hex, "edgeColor": hex, "fontFamily": string, "fontSize": number, "fontWeight": number`,
    `  } (optional; sensible defaults are applied)`,
    `}`,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You are a visual-design assistant that converts text into structured diagrams.",
  "You respond with valid JSON ONLY — no markdown, no prose, no code fences.",
  "",
  schemaDescription(),
  "",
  "Visual type guidance:",
  ...VISUAL_KINDS.map((k) => `- ${KIND_GUIDANCE[k]}`),
  "",
  "Bundled icon catalog:",
  `- Valid node.icon values: ${ICON_NAMES.map((name) => `"${name}"`).join(", ")}.`,
  "- Add an `icon` to a node when it clearly reinforces the label; otherwise omit `icon`.",
  "",
  "Rules:",
  "- Every edge `from`/`to` MUST reference an `id` that exists in that visual's `nodes`.",
  "- Node and edge `id`s MUST be unique within their visual.",
  "- Keep labels concise (a few words).",
  "- Lay positioned types out without overlaps; keep all coordinates within width/height.",
  "- If you include `icon`, it MUST be one of the listed catalog names exactly.",
  "- Return DISTINCT candidates that take different structural approaches.",
  "- LANGUAGE: All node labels, edge labels, and visual titles MUST be written in the SAME LANGUAGE as the source text. Do NOT translate content into English or any other language.",
].join("\n");

const ORIENTATION_GUIDANCE: Record<Exclude<Orientation, "auto">, string> = {
  vertical:
    "Lay out each visual with a taller-than-wide canvas (e.g. width 520, height 720). Arrange nodes top-to-bottom.",
  horizontal:
    "Lay out each visual with a wider-than-tall canvas (e.g. width 900, height 480). Arrange nodes left-to-right.",
  square:
    "Lay out each visual with a roughly square canvas (e.g. width 640, height 640). Spread nodes across both axes.",
};

const DETAIL_GUIDANCE: Record<DetailLevel, string> = {
  detailed:
    "Expand the source text fully: include sub-points, add supporting nodes, and use descriptive multi-word labels.",
  summary:
    "Keep the visual compact: use the minimum nodes that capture the core idea, and keep labels to 1–3 words each.",
};

/**
 * Builds the chat messages for a generation request. The output JSON object must
 * be `{ "visuals": [ ...at least `count` visuals... ] }`.
 */
export function buildGenerationMessages(
  options: BuildMessagesOptions,
): ChatMessage[] {
  const {
    text,
    type,
    count,
    retryReason,
    orientation,
    detailLevel,
    stayCloserToText,
  } = options;

  const typeInstruction = type
    ? `All candidates MUST use "type": "${type}".`
    : `Vary the visual "type" across candidates (choose the kinds that best fit the text).`;

  const orientationInstruction =
    orientation && orientation !== "auto"
      ? ORIENTATION_GUIDANCE[orientation]
      : null;

  const detailInstruction = detailLevel ? DETAIL_GUIDANCE[detailLevel] : null;

  const wording = stayCloserToText
    ? "Preserve the user's original wording in node labels — do not paraphrase or rewrite; use exact phrases from the source text."
    : null;

  const userParts = [
    `Produce a JSON object: { "visuals": [ ... ] } containing at least ${count} candidate visuals.`,
    typeInstruction,
    orientationInstruction,
    detailInstruction,
    wording,
    retryReason
      ? `Your previous attempt was rejected: ${retryReason} Fix it and return valid JSON only.`
      : "",
    "",
    "Source text:",
    '"""',
    text,
    '"""',
  ].filter((part): part is string => part !== null && part !== "");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n") },
  ];
}
