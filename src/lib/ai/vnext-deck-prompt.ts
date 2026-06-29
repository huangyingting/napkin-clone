/**
 * AI prompt builder for vNext (v7) semantic deck plans.
 *
 * Builds messages that instruct the AI to produce an `AiDeckPlanV1` JSON plan
 * using typed slot values, semantic template kinds, and tone/density/emphasis
 * controls. The plan is consumed by `repairAiDeckPlan` then `compileSlide`.
 *
 * Key differences from `package-template-deck-prompt.ts`:
 * - Outputs `{ planVersion: 1, ... }` shape (not `schemaVersion: 1`).
 * - Slot values are typed: `{ type: "shortText", text: "..." }` etc.
 * - Uses SemanticTemplateRegistry (all 27 kinds) instead of v6 package catalog.
 * - Controls (tone/density/emphasis) are explicit slide-level fields.
 */

import type { ChatMessage } from "@/lib/ai/prompt";
import type {
  DeckGenerationOptions,
  DeckVisualInventoryItem,
} from "@/lib/ai/deck-generation-options";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import type {
  SemanticTemplateV1,
  SlotContract,
} from "@/lib/presentation-vnext/template-registry";

export interface BuildVnextDeckMessagesOptions {
  outline: string;
  themePackageId: string;
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>;
  options?: DeckGenerationOptions;
  retryReason?: string;
}

// ---------------------------------------------------------------------------
// Slot contract rendering
// ---------------------------------------------------------------------------

function renderSlotContract(key: string, contract: SlotContract): string {
  const parts: string[] = [key, `type=${contract.type}`];
  if (contract.required) parts.push("required");
  else parts.push("optional");
  if (contract.maxChars) parts.push(`≤${contract.maxChars}c`);
  if (contract.maxItems) parts.push(`≤${contract.maxItems}items`);
  if (contract.maxColumns) parts.push(`≤${contract.maxColumns}cols`);
  if (contract.maxRows) parts.push(`≤${contract.maxRows}rows`);
  return `    ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Template catalog rendering
// ---------------------------------------------------------------------------

function renderTemplateCatalog(templates: SemanticTemplateV1[]): string {
  return templates
    .map((t) => {
      const slotLines = Object.entries(t.slots)
        .map(([key, contract]) => renderSlotContract(key, contract))
        .join("\n");
      const densities = t.supports.density.join("|");
      const emphases = t.supports.emphasis.join("|");
      return [
        `• ${t.kind} [${t.group}]: ${t.intent}`,
        `  bestFor: ${t.selection.bestFor}`,
        `  density: ${densities} | emphasis: ${emphases}`,
        `  slots:\n${slotLines}`,
      ].join("\n");
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Visual inventory rendering
// ---------------------------------------------------------------------------

function renderInventory(
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>,
): string {
  if (visualInventory.length === 0) {
    return "Visual inventory: (none — do not include visual type slots)";
  }
  return [
    "Visual inventory (use visualId exactly as listed):",
    ...visualInventory.map(
      (item) =>
        `  - ${item.id} | ${item.title} (${item.type}): ${item.summary}`,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  "You generate a v7 semantic slide plan, not free-form deck JSON.",
  "Return valid JSON only. No markdown, no prose, no code fences.",
  "",
  "Required JSON shape:",
  "{",
  '  "planVersion": 1,',
  '  "locale": "<BCP-47 code matching source language>",',
  '  "slides": [',
  "    {",
  '      "kind": "<kind from catalog>",',
  '      "tone": "<optional: neutral|confident|warm|urgent|premium|technical>",',
  '      "density": "<optional: airy|normal|dense>",',
  '      "emphasis": "<optional: balanced|title|data|visual|quote|action>",',
  '      "slots": {',
  '        "title":       { "type": "shortText",  "text": "..." },',
  '        "subtitle":    { "type": "shortText",  "text": "..." },',
  '        "kicker":      { "type": "shortText",  "text": "..." },',
  '        "body":        { "type": "paragraph",  "paragraphs": ["..."] },',
  '        "bullets":     { "type": "bullets",    "items": [{ "text": "..." }] },',
  '        "quote":       { "type": "shortText",  "text": "..." },',
  '        "attribution": { "type": "shortText",  "text": "..." },',
  '        "metrics":     { "type": "metrics",    "items": [{ "value": "42%", "label": "Growth", "detail": "optional" }] },',
  '        "table":       { "type": "table",      "columns": ["Col"], "rows": [["cell"]] },',
  '        "visual":      { "type": "visual",     "visualId": "<exact-id>" },',
  '        "image":       { "type": "image",      "prompt": "describe image", "alt": "alt text" }',
  "      },",
  '      "speakerNotes": "<optional overflow or speaker notes>"',
  "    }",
  "  ]",
  "}",
  "",
  "Rules:",
  "- Use kind values from the template catalog only.",
  "- First slide: cover. Last slide: closing or recommendation.",
  "- Fill only slots declared for each template. Omit all others.",
  "- Use the exact slot value type shown in the catalog for each slot.",
  "- Keep visible slot text concise. Put overflow and context in speakerNotes.",
  "- Use 'visual' slot type only when the visualId exactly matches the visual inventory.",
  "- Write all content (slots, speakerNotes) in the same language as the source.",
  "- Choose density and emphasis to match content richness, not theme style.",
].join("\n");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const LENGTH_GUIDANCE: Record<
  NonNullable<DeckGenerationOptions["length"]>,
  string
> = {
  short: "Aim for a tight deck of 4–6 slides.",
  medium: "Aim for a focused deck of 7–12 slides.",
  long: "Aim for a thorough deck of 13–20 slides.",
};

export function buildVnextDeckMessages(
  options: BuildVnextDeckMessagesOptions,
): ChatMessage[] {
  const registry = createDefaultTemplateRegistry();
  const catalog = renderTemplateCatalog(registry.all());

  const lengthNote = options.options?.length
    ? LENGTH_GUIDANCE[options.options.length]
    : null;
  const toneNote = options.options?.tone
    ? `Preferred tone: ${options.options.tone}.`
    : null;
  const audienceNote = options.options?.audience
    ? `Audience: ${options.options.audience}.`
    : null;

  const userParts = [
    `Active theme package: ${options.themePackageId}`,
    lengthNote,
    toneNote,
    audienceNote,
    options.retryReason
      ? `Previous attempt rejected: ${options.retryReason}`
      : null,
    "",
    "Template catalog:",
    catalog,
    "",
    renderInventory(options.visualInventory),
    "",
    "Source outline:",
    '"""',
    options.outline,
    '"""',
  ].filter((part): part is string => part !== null && part !== "");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n") },
  ];
}
