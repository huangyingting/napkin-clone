/**
 * Prompt construction for AI deck generation (issue #262).
 *
 * The model is asked to return a single JSON {@link Deck} object — `{ slides:
 * [...], themeId }` — whose slides carry concise, presentation-ready content and
 * (optionally) free-form positioned `elements[]`. The allowed `layout` and
 * `themeId` value lists are derived from the exported `SLIDE_LAYOUTS` /
 * `DECK_THEMES` const arrays in `@/lib/presentation/deck` so this prompt stays
 * in sync with the validator (`safeParseDeck`).
 *
 * This module is intentionally free of any network, DOM, or React dependencies
 * so it can be unit tested deterministically under `node --test`.
 */

import type { ChatMessage } from "@/lib/ai/prompt";
import { DECK_THEMES, SLIDE_LAYOUTS } from "@/lib/presentation/deck";

/**
 * The vibrant, content-appropriate themes the model should choose from for
 * strong visual impact (issue #281). Derived from {@link DECK_THEMES} so it
 * stays in sync with the validator: every theme EXCEPT `default`, which is
 * reserved for explicitly dark / embed contexts.
 */
const VIBRANT_THEMES: readonly string[] = DECK_THEMES.filter(
  (theme) => theme !== "default",
);

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
    `  "themeId": one of ${DECK_THEMES.map((t) => `"${t}"`).join(" | ")} (choose a vibrant one — see Theme rules below),`,
    '  "slides": [',
    "    {",
    '      "title": short slide heading string (optional),',
    '      "bullets": array of short strings matching bullet element item text (optional projection),',
    '      "notes": speaker notes string for live narration / overflow detail (optional),',
    `      "layout": one of ${SLIDE_LAYOUTS.map((l) => `"${l}"`).join(" | ")} (optional; defaults to "blank"),`,
    '      "elements": [   // optional free-form positioned content',
    '        { "kind": "text", "text": string, "role": "title" | "body", "box": { "x": %, "y": %, "w": %, "h": % } },',
    '        { "kind": "bullets", "items": [{ "text": string }, ...], "box": { "x": %, "y": %, "w": %, "h": % } },',
    '        { "kind": "visual", "visualId": one of the inventory ids, "box": { "x": %, "y": %, "w": %, "h": % } }',
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
  "- You may reference a visual on a slide ONLY via an `elements` entry of kind `visual` whose `visualId` is one of the provided inventory ids.",
  "- HARD RULE: every `visualId` MUST exactly match an id from the visual inventory. NEVER invent, guess, or modify a visual id. If no inventory visual fits a slide, omit visuals from that slide.",
  "- If the inventory is empty, do not include any `visual` elements at all.",
  "",
  "Theme rules:",
  `- ALWAYS choose a VIBRANT theme (${VIBRANT_THEMES.map((t) => `"${t}"`).join(" | ")}) that fits the content's mood/subject, for strong visual impact.`,
  "- Pick the single theme whose palette best matches the content and apply it to the whole deck via the top-level `themeId` field.",
  '- Reserve "default" ONLY for explicitly dark or embed contexts (e.g. the content is about a dark UI, a terminal, or asks for a muted/dark look). Do NOT use "default" as a generic fallback — a vibrant theme is always preferred.',
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
 * be a single {@link Deck} object: `{ "slides": [ ... ], "themeId": ... }`.
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
