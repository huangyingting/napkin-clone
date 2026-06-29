import type { ChatMessage } from "@/lib/ai/prompt";
import type {
  DeckGenerationOptions,
  DeckVisualInventoryItem,
} from "@/lib/ai/deck-generation-options";
import {
  themePackageTemplateCatalogForAi,
  type ThemePackageId,
} from "@/lib/presentation/theme-packages";

export interface BuildPackageTemplateDeckMessagesOptions {
  outline: string;
  packageId: ThemePackageId;
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>;
  options?: DeckGenerationOptions;
  retryReason?: string;
}

const LENGTH_GUIDANCE: Record<
  NonNullable<DeckGenerationOptions["length"]>,
  string
> = {
  short: "Aim for a tight deck of roughly 4-6 slides.",
  medium: "Aim for a focused deck of roughly 7-12 slides.",
  long: "Aim for a thorough deck of roughly 13-20 slides.",
};

function renderCatalog(packageId: ThemePackageId): string {
  return themePackageTemplateCatalogForAi(packageId)
    .map((entry) =>
      [
        `- ${entry.kind} (intent: ${entry.intent}, medium: ${entry.contentMedium}, layout: ${entry.renderFamily})`,
        entry.artifactRole ? `  artifactRole: ${entry.artifactRole}` : null,
        `  bestFor: ${entry.bestFor}`,
        entry.avoidFor ? `  avoidFor: ${entry.avoidFor}` : null,
        `  accepts: ${entry.accepts.join(", ")}`,
        `  capacity: ${JSON.stringify(entry.capacity)}`,
        `  signals: ${entry.signals.slice(0, 8).join(", ")}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    )
    .join("\n");
}

function renderInventory(
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>,
): string {
  if (visualInventory.length === 0) {
    return "Visual inventory: (none - do not include visualId slots)";
  }
  return [
    "Visual inventory (reference these by id only):",
    ...visualInventory.map(
      (item) => `- ${item.id} - ${item.title} (${item.type}): ${item.summary}`,
    ),
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You generate a package-template slide plan, not free-form deck JSON.",
  "Return valid JSON only. No markdown, no prose, no code fences.",
  "The JSON must have this shape:",
  "{",
  '  "schemaVersion": 1,',
  '  "language": "same language as the source",',
  '  "slides": [',
  "    {",
  '      "title": "short title",',
  '      "templateKind": "one catalog kind",',
  '      "selectionReason": "brief optional debug reason",',
  '      "slots": { "title": "required", "body": "paragraph text", "bullets": ["..."], "table": { "columns": ["..."], "rows": [["..."]] } },',
  '      "notes": "optional overflow or speaker notes"',
  "    }",
  "  ]",
  "}",
  "Rules:",
  "- Use templateKind values from the catalog only.",
  "- First slide should usually be cover.",
  "- Last slide should usually be closing or recommendation.",
  "- Choose by narrative intent first, content medium second, and layout/render family last.",
  "- Use detail for dense explanatory paragraphs, background, requirements, analysis, or content-heavy narrative slides.",
  "- Do not use industry names as template categories; use the cross-industry catalog kinds.",
  "- Keep visible slot text concise; put overflow in notes.",
  "- Use table slots only for naturally structured data, evidence, or comparisons.",
  "- Use visualId only when it exactly matches the visual inventory.",
  "- Write titles, slots, and notes in the same language as the source.",
].join("\n");

export function buildPackageTemplateDeckMessages(
  options: BuildPackageTemplateDeckMessagesOptions,
): ChatMessage[] {
  const lengthInstruction = options.options?.length
    ? LENGTH_GUIDANCE[options.options.length]
    : null;
  const toneInstruction = options.options?.tone
    ? `Tone: write in a ${options.options.tone} voice.`
    : null;
  const audienceInstruction = options.options?.audience
    ? `Audience: tailor the content for ${options.options.audience}.`
    : null;

  const userParts = [
    `Active theme package: ${options.packageId}`,
    lengthInstruction,
    toneInstruction,
    audienceInstruction,
    options.retryReason
      ? `Previous attempt was rejected: ${options.retryReason}`
      : null,
    "",
    "Template catalog:",
    renderCatalog(options.packageId),
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
