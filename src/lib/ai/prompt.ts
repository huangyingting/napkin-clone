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
import { getAllKindPromptGuidance } from "@/lib/visual/registry";

type ChatRole = "system" | "user" | "assistant";

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

const ICON_NAMES = ICON_CATALOG.map((entry) => entry.name);
const KIND_GUIDANCE_LINES = getAllKindPromptGuidance().map(
  ({ guidance }) => `- ${guidance}`,
);

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
  ...KIND_GUIDANCE_LINES,
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
