/**
 * Prompt construction for AI visual generation (US-010).
 *
 * The model is asked to return a single JSON object `{ "visuals": [...] }` whose
 * entries each conform to the canonical visual schema
 * (`@/lib/visual/schema`). The schema description is derived from the schema
 * constants so the prompt stays in sync with the validator.
 */

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

export interface BuildMessagesOptions {
  text: string;
  /** Optional desired visual type to bias generation toward. */
  type?: VisualKind;
  /** Minimum number of candidate visuals the model should return. */
  count: number;
  /** Optional reason the previous attempt was rejected (used on retry). */
  retryReason?: string;
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
};

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
    `      "textColor": CSS color string for the node label (optional)`,
    `    }`,
    `  ],`,
    `  "edges": [`,
    `    { "id": unique string, "from": node id, "to": node id, "label": string (optional), "directed": boolean (optional) }`,
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
  "Rules:",
  "- Every edge `from`/`to` MUST reference an `id` that exists in that visual's `nodes`.",
  "- Node and edge `id`s MUST be unique within their visual.",
  "- Keep labels concise (a few words).",
  "- Lay positioned types out without overlaps; keep all coordinates within width/height.",
  "- Return DISTINCT candidates that take different structural approaches.",
].join("\n");

/**
 * Builds the chat messages for a generation request. The output JSON object must
 * be `{ "visuals": [ ...at least `count` visuals... ] }`.
 */
export function buildGenerationMessages(
  options: BuildMessagesOptions,
): ChatMessage[] {
  const { text, type, count, retryReason } = options;

  const typeInstruction = type
    ? `All candidates MUST use "type": "${type}".`
    : `Vary the visual "type" across candidates (choose the kinds that best fit the text).`;

  const userParts = [
    `Produce a JSON object: { "visuals": [ ... ] } containing at least ${count} candidate visuals.`,
    typeInstruction,
    retryReason
      ? `Your previous attempt was rejected: ${retryReason} Fix it and return valid JSON only.`
      : "",
    "",
    "Source text:",
    '"""',
    text,
    '"""',
  ].filter((part) => part !== "");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n") },
  ];
}
