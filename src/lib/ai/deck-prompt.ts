/**
 * Prompt construction for AI deck generation (issue #262).
 *
 * The model is asked to return a single schema-v6 JSON {@link Deck} object
 * whose slides carry concise, presentation-ready content and free-form
 * positioned `elements[]`. The allowed `templateId` and `design.themeId` value
 * lists are derived from the built-in slide template catalogue and
 * `PRESENTATION_THEME_IDS` so this prompt stays in sync with `safeParseDeck`.
 *
 * This module is intentionally free of any network, DOM, or React dependencies
 * so it can be unit tested deterministically under `node --test`.
 */

import type { ChatMessage } from "@/lib/ai/prompt";
import { PRESENTATION_THEME_IDS } from "@/lib/presentation/deck";
import { SLIDE_TEMPLATES } from "@/lib/presentation/slide-templates";

/**
 * The named visual-content themes the model should choose from (all entries
 * in {@link PRESENTATION_THEME_IDS}).  Kept as a named constant so the theme-rules
 * section of the prompt and the schema description share the same list.
 */
const VIBRANT_THEMES: readonly string[] = PRESENTATION_THEME_IDS;
const TEMPLATE_IDS = SLIDE_TEMPLATES.map((template) => template.kind);

/** A single visual the model may reference (and ONLY these) by `id`. */
export interface DeckVisualInventoryItem {
  id: string;
  title: string;
  type: string;
  summary: string;
}

/** Tuning knobs threaded from {@link GenerateDeckInput.options}. */
export interface DeckGenerationOptions {
  /** Rough deck size hint. */
  length?: "short" | "medium" | "long";
  /** Desired voice/register, e.g. "confident", "playful". */
  tone?: string;
  /** Who the deck is for, e.g. "executives", "new engineers". */
  audience?: string;
}

export interface BuildDeckMessagesOptions {
  /** The structured outline the deck should be built from. */
  outline: string;
  /** The visuals the model may reference. May be empty. */
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>;
  /** Optional length/tone/audience tuning. */
  options?: DeckGenerationOptions;
  /** Optional reason the previous attempt was rejected (used on retry). */
  retryReason?: string;
}

const LENGTH_GUIDANCE: Record<
  NonNullable<DeckGenerationOptions["length"]>,
  string
> = {
  short: "Aim for a tight deck of roughly 4–6 slides.",
  medium: "Aim for a focused deck of roughly 7–12 slides.",
  long: "Aim for a thorough deck of roughly 13–20 slides.",
};

function deckSchemaDescription(): string {
  return [
    "Return ONE JSON object describing a presentation Deck with this exact shape:",
    "{",
    '  "schemaVersion": 6,',
    '  "canvas": { "format": "16:9" },',
    `  "design": { "themeId": one of ${VIBRANT_THEMES.map((t) => `"${t}"`).join(" | ")} },`,
    '  "masters": [{ "id": "master-default", "name": "Default", "elements": [] }],',
    '  "defaultMasterId": "master-default",',
    '  "slides": [',
    "    {",
    '      "title": short slide heading string,',
    '      "notes": speaker notes string for live narration / overflow detail (optional),',
    `      "templateId": one of ${TEMPLATE_IDS.map((id) => `"${id}"`).join(" | ")} (optional; omit for "blank"),`,
    '      "elements": [',
    '        { "kind": "text", "role": "title" | "body" | "bullet", "box": { "x": %, "y": %, "w": %, "h": % }, "content": { "kind": "text", "text": string, "paragraphs": [{ "text": string, "listType": "bullet" optional }] }, "designOverrides": { "textStyle": { "fontSize": number, "bold": boolean, "italic": boolean, "align": "left" | "center" | "right" } } optional },',
    '        { "kind": "visual", "role": "visual", "box": { "x": %, "y": %, "w": %, "h": % }, "content": { "kind": "visual", "visualId": one of the inventory ids } },',
    '        { "kind": "image", "role": "image", "box": { "x": %, "y": %, "w": %, "h": % }, "content": { "kind": "image", "src": image URL or data URL, "alt": string optional }, "designOverrides": { "fitMode": "contain" | "cover" | "fill" | "none", "maskShape": "none" | "rect" | "circle" | "ellipse" | "rounded" | "diamond" | "triangle" } optional },',
    '        { "kind": "shape", "role": "background" | "label", "box": { "x": %, "y": %, "w": %, "h": % }, "content": { "kind": "shape", "shape": "rect" | "ellipse" | "triangle", "text": string optional }, "designOverrides": { "fill": { "token": "slideBg" | "surface" | "accent" | "onBg" | "onSurface" | "onAccent" | "muted" } OR { "value": "#rrggbb" } OR { "type": "radialGradient", "inner": colorRef, "outer": colorRef, "cx": 0-100 optional, "cy": 0-100 optional, "r": 0-100 optional }, "effect": { "kind": "glass", "intensity": "light" | "medium" | "strong" } optional } optional }',
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
    "Box coordinates (x, y, w, h) are PERCENTAGES of the slide (0–100), where x/y is the top-left corner.",
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You are a presentation-design assistant that turns an outline into a structured slide deck.",
  "You respond with valid JSON ONLY — no markdown, no prose, no code fences.",
  "",
  deckSchemaDescription(),
  "",
  "Storytelling and brevity rules:",
  "- Build a clear narrative flow for LIVE storytelling: open with a title slide, develop sections in order, and close with a summary or call-to-action slide.",
  "- ONE idea per slide. Do not cram multiple topics onto a single slide.",
  "- Keep visible text extremely tight: at most ~24 visible words per slide across title and bullets combined.",
  "- Any detail, nuance, or full sentences that exceed the visible budget MUST go into that slide's `notes` (speaker notes), never onto the slide body.",
  "- Favor a strong visual hierarchy: a short title plus a few punchy bullets, not paragraphs.",
  "",
  "Visual rules:",
  "- You may reference a visual on a slide ONLY via an `elements` entry of kind `visual` whose `content.visualId` is one of the provided inventory ids.",
  "- HARD RULE: every `visualId` MUST exactly match an id from the visual inventory. NEVER invent, guess, or modify a visual id. If no inventory visual fits a slide, omit visuals from that slide.",
  "- If the inventory is empty, do not include any `visual` elements at all.",
  "",
  "Theme rules:",
  `- ALWAYS choose a VIBRANT theme (${VIBRANT_THEMES.map((t) => `"${t}"`).join(" | ")}) that fits the content's mood/subject, for strong visual impact.`,
  "- Pick the single theme whose palette best matches the content and apply it to the whole deck via `design.themeId`.",
  "",
  "V6 shape rules:",
  "- Do NOT output top-level `themeId`, `layout`, `bullets`, `visualIds`, `sourceRef`, `styleOverride`, or flat element payload fields such as `text` or `visualId`.",
  "- Put text and visual payloads under `element.content`; put local styling under `element.designOverrides`.",
  "- Use shape elements for decorative backgrounds/cards only when they improve hierarchy. Supported shape.content.shape values: `rect`, `ellipse`, `triangle`; do not generate `line` shapes.",
  "- `radialGradient` means a two-stop radial fill. Use it on slide backgrounds or shape fills, not as text styling.",
  '- Glass effects are only shape effects (`designOverrides.effect.kind = "glass"`). Keep text editable by placing a separate text element above the glass shape; do not put glass/blur on text or image elements.',
  "- Image elements may use `designOverrides.maskShape` for rect/ellipse/triangle/circle/rounded/diamond masks, but do not put glass or blur effects on images.",
  "- Keep `masters` as the default empty master unless explicitly asked for global chrome. If using master chrome, it MUST be in `masters[].elements[]` with `masterChromeKind`; NEVER put `masterChromeKind` on slide `elements[]`.",
  "",
  "Output rules:",
  "- Output the JSON object ONLY — no surrounding prose, no markdown, no code fences.",
  "- LANGUAGE: All slide titles, bullets, and notes MUST be written in the SAME LANGUAGE as the source outline. Do NOT translate content into English or any other language.",
].join("\n");

function renderInventory(
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>,
): string {
  if (visualInventory.length === 0) {
    return "Visual inventory: (none — do not include any visual elements)";
  }
  return [
    "Visual inventory (reference these by id ONLY — never invent ids):",
    ...visualInventory.map(
      (item) => `- ${item.id} — ${item.title} (${item.type}): ${item.summary}`,
    ),
  ].join("\n");
}

/**
 * Builds the chat messages for a deck-generation request. The output JSON must
 * be a single schema-v6 {@link Deck} object.
 */
export function buildDeckGenerationMessages(
  options: BuildDeckMessagesOptions,
): ChatMessage[] {
  const { outline, visualInventory, options: tuning, retryReason } = options;

  const lengthInstruction = tuning?.length
    ? LENGTH_GUIDANCE[tuning.length]
    : null;
  const toneInstruction = tuning?.tone
    ? `Tone: write in a ${tuning.tone} voice.`
    : null;
  const audienceInstruction = tuning?.audience
    ? `Audience: tailor the content for ${tuning.audience}.`
    : null;

  const userParts = [
    "Produce ONE JSON Deck object from the outline below.",
    lengthInstruction,
    toneInstruction,
    audienceInstruction,
    retryReason
      ? `Your previous attempt was rejected: ${retryReason} Fix it and return a single valid JSON Deck object only.`
      : "",
    "",
    renderInventory(visualInventory),
    "",
    "Outline:",
    '"""',
    outline,
    '"""',
  ].filter((part): part is string => part !== null && part !== "");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n") },
  ];
}
