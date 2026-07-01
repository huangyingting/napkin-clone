import type {
  SemanticDeckPlanV1,
  SemanticSlideSpecV1,
  BulletSlotItem,
  SlotValue,
} from "@/lib/presentation-vnext/semantic-deck-plan";
import {
  collectDocumentBlocks,
  type DocumentBlock,
  type DocumentTableBlock,
  type DocumentTextBlock,
} from "@/lib/content";
import {
  AI_GENERATION_INPUT_MAX_CHARS,
  AI_VISUAL_INVENTORY_MAX_ITEMS,
} from "@/lib/limits/ai";
import {
  documentBlockSignature,
  hashDocumentBlock,
} from "@/lib/presentation/document-block-hash";
import { fnv1aHash32 } from "@/lib/presentation/fnv-hash";

import type { PresentationDiagnostic } from "./diagnostics";
import { makeDiagnostic } from "./diagnostics";
import { createBlankDeckV7 } from "./empty-deck";
import type {
  DeckV7,
  NodeSourceMetadata,
  SemanticTemplateKind,
  SlideChildNode,
  SlideControls,
  SlideNode,
  SlotKey,
} from "./schema";
import { DECK_SCHEMA_VERSION_V7 } from "./schema";
import type { CanvasSpec, JsonValue } from "./types";
import { compileSlide } from "./template-compiler";
import {
  type SemanticTemplateV1,
  type TemplateGroup,
} from "./template-registry";
import { createDefaultTemplateRegistry } from "./theme-packages";
import { safeParseDeckV7 } from "./validation";
import { repairSemanticDeckPlan } from "./semantic-deck-plan-repair";

const DEFAULT_DERIVE_TITLE = "Document";
const DEFAULT_TABLE_TITLE = "Table";
const DEFAULT_VISUAL_TITLE = "Visual";
const MAX_BULLET_ITEMS_PER_SLIDE = 6;
const MAX_VISUAL_SUMMARY_CHARS = 120;

export type DocumentSlidePlanner = "deterministic" | "ai";
export type DocumentSlideMode = "faithful" | "presentationRewrite";

export type DocumentSourceVisualInventoryItem = {
  id: string;
  title: string;
  type: string;
  summary: string;
};

export type DocumentSourceBlockV1 =
  | { id: string; kind: "heading"; level?: 1 | 2 | 3; text: string }
  | {
      id: string;
      kind: "paragraph" | "listitem" | "quote" | "hr";
      text: string;
    }
  | {
      id: string;
      kind: "table";
      caption?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      id: string;
      kind: "visual";
      visualId: string;
      title?: string;
      summary?: string;
    };

export type DocumentSourceSectionV1 = {
  id: string;
  title?: string;
  sourceBlockIds: string[];
  blocks: DocumentSourceBlockV1[];
};

export type DocumentSourcePlanV1 = {
  planVersion: 1;
  documentId?: string;
  contentHash: string;
  locale?: string;
  truncated: boolean;
  originalChars: number;
  keptChars: number;
  sections: DocumentSourceSectionV1[];
  visualInventory: DocumentSourceVisualInventoryItem[];
};

export type DocumentPlannedSlideV1 = {
  id: string;
  kind: SemanticTemplateKind;
  sourceBlockIds: string[];
  slotSources: Partial<Record<SlotKey, string[]>>;
  controls?: SlideControls;
  slots: Partial<Record<SlotKey, SlotValue>>;
  speakerNotes?: string;
  rationale?: string;
  omittedBlockIds?: string[];
};

export type DocumentSlidePlanV1 = {
  planVersion: 1;
  planner: DocumentSlidePlanner;
  mode: DocumentSlideMode;
  title?: string;
  locale?: string;
  source: {
    documentId?: string;
    contentHash: string;
    truncated: boolean;
  };
  slides: DocumentPlannedSlideV1[];
  omittedBlockIds?: string[];
};

export type DocumentSourcePlanBuildResult = {
  sourcePlan: DocumentSourcePlanV1;
  blocks: DocumentBlock[];
  blockMap: ReadonlyMap<string, DocumentBlock>;
};

export type CompileDocumentSlidePlanResult =
  | {
      ok: true;
      deck: DeckV7;
      diagnostics: PresentationDiagnostic[];
    }
  | {
      ok: false;
      error: string;
      diagnostics: PresentationDiagnostic[];
      validationErrors?: string[];
    };

export type DocumentSlidePlanRepairResult = {
  plan: DocumentSlidePlanV1;
  diagnostics: PresentationDiagnostic[];
};

const VISUAL_DERIVE_TEMPLATE: SemanticTemplateV1 = {
  schemaVersion: 1,
  kind: "visual-focus",
  label: "Deterministic Visual Focus",
  version: "1.0.0",
  group: "explain" satisfies TemplateGroup,
  intent: "Deterministic visual slide for derive-from-document.",
  slots: {
    title: {
      type: "shortText",
      required: false,
      maxChars: 120,
      overflow: "truncateWithNote",
    },
    visualId: {
      type: "visual",
      required: true,
      overflow: "repair",
    },
    caption: {
      type: "shortText",
      required: false,
      maxChars: 200,
      overflow: "truncateWithNote",
    },
  } as SemanticTemplateV1["slots"],
  supports: {
    tone: ["neutral", "confident", "warm", "premium"],
    density: ["normal"],
    emphasis: ["visual"],
  },
  layouts: [
    {
      id: "derive-visual-default",
      density: ["normal"],
      emphasis: ["visual"],
      root: {
        type: "slide",
        style: { ref: "slide.content" },
        children: [
          {
            type: "text",
            role: "title",
            slot: "title",
            style: { ref: "text.title" },
            layout: { frame: { x: 8, y: 6, w: 84, h: 12 }, zIndex: 1 },
          },
          {
            type: "visual",
            role: "visual",
            slot: "visualId",
            style: { ref: "media.inline" },
            layout: { frame: { x: 8, y: 22, w: 84, h: 62 }, zIndex: 2 },
          },
          {
            type: "text",
            role: "caption",
            slot: "caption",
            style: { ref: "text.caption" },
            layout: { frame: { x: 8, y: 86, w: 84, h: 6 }, zIndex: 3 },
          },
        ],
      },
    },
  ],
  selection: {
    priority: 1,
    bestFor: "Deterministic derive visual fallback",
    signals: ["derive", "visual"],
  },
};

function createDocumentSlidePlanTemplateRegistry() {
  const registry = createDefaultTemplateRegistry();
  registry.register(VISUAL_DERIVE_TEMPLATE);
  return registry;
}

function trimText(block: DocumentTextBlock): string {
  return block.text.trim();
}

function isNonEmptyTextBlock(block: DocumentTextBlock): boolean {
  return trimText(block).length > 0;
}

function headingTitle(block: DocumentTextBlock): string {
  const title = trimText(block);
  return title.length > 0 ? title : DEFAULT_DERIVE_TITLE;
}

function buildTableSlot(block: DocumentTableBlock): SlotValue {
  return {
    type: "table",
    columns: block.columns.map((column) => column.label),
    rows: block.rows.map((row) => row.cells.map((cell) => cell.text)),
    ...(block.caption ? { caption: block.caption } : {}),
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}...`;
}

function titleFromType(type: string): string {
  if (type.length === 0) return "Untitled visual";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function summarizeVisual(block: Extract<DocumentBlock, { kind: "visual" }>) {
  const labels = Array.isArray(block.visual.nodes)
    ? block.visual.nodes
        .map((node) =>
          typeof node?.label === "string" ? node.label.trim() : "",
        )
        .filter((label) => label.length > 0)
    : [];
  return truncate(labels.join(", "), MAX_VISUAL_SUMMARY_CHARS);
}

function sourceIdForBlock(block: DocumentBlock, index: number): string {
  if (block.kind === "visual") return block.visualId;
  if (block.blockId) return block.blockId;
  return `block-${index + 1}-${hashDocumentBlock(block)}`;
}

function sourceBlockForDocumentBlock(
  block: DocumentBlock,
  id: string,
): DocumentSourceBlockV1 | null {
  if (block.kind === "visual") {
    return {
      id,
      kind: "visual",
      visualId: block.visualId,
      ...(block.visual.title ? { title: block.visual.title } : {}),
      summary: summarizeVisual(block),
    };
  }
  if (block.kind === "table") {
    return {
      id,
      kind: "table",
      ...(block.caption ? { caption: block.caption } : {}),
      columns: block.columns.map((column) => column.label),
      rows: block.rows.map((row) => row.cells.map((cell) => cell.text)),
    };
  }
  if (block.blockType === "heading") {
    return {
      id,
      kind: "heading",
      ...(block.level ? { level: block.level } : {}),
      text: block.text,
    };
  }
  return { id, kind: block.blockType, text: block.text };
}

function buildSourceSections(
  blocks: readonly DocumentBlock[],
  ids: readonly string[],
): DocumentSourceSectionV1[] {
  const sections: DocumentSourceSectionV1[] = [];
  let current: DocumentSourceSectionV1 | null = null;

  const ensureSection = () => {
    if (current) return current;
    current = {
      id: `section-${sections.length + 1}`,
      sourceBlockIds: [],
      blocks: [],
    };
    sections.push(current);
    return current;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const id = ids[i];
    if (!block || !id) continue;
    const sourceBlock = sourceBlockForDocumentBlock(block, id);
    if (!sourceBlock) continue;

    if (block.kind === "text" && block.blockType === "heading") {
      current = {
        id: `section-${sections.length + 1}`,
        title: headingTitle(block),
        sourceBlockIds: [],
        blocks: [],
      };
      sections.push(current);
    }

    const section = ensureSection();
    section.sourceBlockIds.push(id);
    section.blocks.push(sourceBlock);
  }

  return sections.filter((section) => section.blocks.length > 0);
}

function buildVisualInventory(
  blocks: readonly DocumentBlock[],
): DocumentSourceVisualInventoryItem[] {
  const inventory: DocumentSourceVisualInventoryItem[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (inventory.length >= AI_VISUAL_INVENTORY_MAX_ITEMS) break;
    if (block.kind !== "visual") continue;
    if (seen.has(block.visualId)) continue;
    seen.add(block.visualId);
    const type = String(block.visual.type ?? "");
    inventory.push({
      id: block.visualId,
      title:
        typeof block.visual.title === "string" &&
        block.visual.title.trim().length > 0
          ? block.visual.title.trim()
          : titleFromType(type),
      type,
      summary: summarizeVisual(block),
    });
  }
  return inventory;
}

function serializeSourcePlanForBudget(
  sections: readonly DocumentSourceSectionV1[],
): string {
  return sections
    .flatMap((section) =>
      section.blocks.map((block) => {
        if (block.kind === "heading") {
          return `${"#".repeat(block.level ?? 2)} ${block.text}`.trimEnd();
        }
        if (block.kind === "listitem") return `- ${block.text}`;
        if (block.kind === "quote") return `> ${block.text}`;
        if (block.kind === "hr") return "---";
        if (block.kind === "table") {
          return [
            block.caption,
            `| ${block.columns.join(" | ")} |`,
            `| ${block.columns.map(() => "---").join(" | ")} |`,
            ...block.rows.map((row) => `| ${row.join(" | ")} |`),
          ]
            .filter((line): line is string => typeof line === "string")
            .join("\n");
        }
        if (block.kind === "visual") return `[visual: ${block.visualId}]`;
        return block.text;
      }),
    )
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function buildContentHash(blocks: readonly DocumentBlock[]): string {
  return fnv1aHash32(blocks.map(documentBlockSignature).join("\x1e"));
}

function blockMapFor(
  blocks: readonly DocumentBlock[],
  ids: readonly string[],
): ReadonlyMap<string, DocumentBlock> {
  const map = new Map<string, DocumentBlock>();
  for (let i = 0; i < blocks.length; i++) {
    const id = ids[i];
    const block = blocks[i];
    if (id && block) map.set(id, block);
  }
  return map;
}

export function buildDocumentSourcePlanV1({
  contentJson,
  documentId,
}: {
  contentJson: unknown;
  documentId?: string;
}): DocumentSourcePlanBuildResult {
  const blocks = collectDocumentBlocks(contentJson);
  const ids = blocks.map(sourceIdForBlock);
  const sections = buildSourceSections(blocks, ids);
  const fullOutline = serializeSourcePlanForBudget(sections);
  const truncated = fullOutline.length > AI_GENERATION_INPUT_MAX_CHARS;
  return {
    sourcePlan: {
      planVersion: 1,
      ...(documentId ? { documentId } : {}),
      contentHash: buildContentHash(blocks),
      truncated,
      originalChars: fullOutline.length,
      keptChars: Math.min(fullOutline.length, AI_GENERATION_INPUT_MAX_CHARS),
      sections,
      visualInventory: buildVisualInventory(blocks),
    },
    blocks,
    blockMap: blockMapFor(blocks, ids),
  };
}

function sourceIdsForBlocks(
  blockMap: ReadonlyMap<string, DocumentBlock>,
  blocks: readonly DocumentBlock[],
): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    for (const [id, candidate] of blockMap.entries()) {
      if (candidate === block) {
        ids.push(id);
        break;
      }
    }
  }
  return ids;
}

function pushTextPlannedSlides(
  slides: DocumentPlannedSlideV1[],
  blockMap: ReadonlyMap<string, DocumentBlock>,
  options: {
    title: string;
    titleSource?: DocumentBlock;
    bodyBlocks: DocumentTextBlock[];
  },
): void {
  const titleText = options.title.trim() || DEFAULT_DERIVE_TITLE;
  const titleSourceIds = options.titleSource
    ? sourceIdsForBlocks(blockMap, [options.titleSource])
    : [];
  if (options.bodyBlocks.length === 0) {
    slides.push({
      id: `plan-slide-${slides.length + 1}`,
      kind: slides.length === 0 ? "cover" : "content",
      sourceBlockIds: titleSourceIds,
      slotSources: titleSourceIds.length > 0 ? { title: titleSourceIds } : {},
      slots: { title: { type: "shortText", text: titleText } },
    });
    return;
  }

  for (
    let offset = 0;
    offset < options.bodyBlocks.length;
    offset += MAX_BULLET_ITEMS_PER_SLIDE
  ) {
    const chunk = options.bodyBlocks.slice(
      offset,
      offset + MAX_BULLET_ITEMS_PER_SLIDE,
    );
    const items: BulletSlotItem[] = chunk
      .map((block) => trimText(block))
      .filter((value) => value.length > 0)
      .map((value) => ({ text: value }));
    if (items.length === 0) continue;

    const bulletSourceIds = sourceIdsForBlocks(blockMap, chunk);
    const chunkTitle =
      offset === 0 ? titleText : `${titleText} (cont.)`.trimEnd();
    const titleIds =
      offset === 0 && titleSourceIds.length > 0
        ? titleSourceIds
        : bulletSourceIds.slice(0, 1);
    slides.push({
      id: `plan-slide-${slides.length + 1}`,
      kind: "content",
      sourceBlockIds: [...new Set([...titleIds, ...bulletSourceIds])],
      slotSources: {
        ...(titleIds.length > 0 ? { title: titleIds } : {}),
        ...(bulletSourceIds.length > 0 ? { bullets: bulletSourceIds } : {}),
      },
      slots: {
        title: { type: "shortText", text: chunkTitle },
        bullets: { type: "bullets", items },
      },
    });
  }
}

export function deriveDocumentSlidePlanDeterministic({
  sourcePlan,
  blocks,
  blockMap,
}: {
  sourcePlan: DocumentSourcePlanV1;
  blocks: readonly DocumentBlock[];
  blockMap: ReadonlyMap<string, DocumentBlock>;
}): DocumentSlidePlanV1 {
  const slides: DocumentPlannedSlideV1[] = [];
  let sectionTitle = "";
  let sectionTitleSource: DocumentTextBlock | undefined;
  let pendingTitle = "";
  let pendingTitleSource: DocumentTextBlock | undefined;
  let pendingBodyBlocks: DocumentTextBlock[] = [];

  const flushText = () => {
    if (!pendingTitle && pendingBodyBlocks.length === 0) return;
    pushTextPlannedSlides(slides, blockMap, {
      title: pendingTitle || sectionTitle || DEFAULT_DERIVE_TITLE,
      titleSource: pendingTitleSource,
      bodyBlocks: pendingBodyBlocks,
    });
    pendingTitle = "";
    pendingTitleSource = undefined;
    pendingBodyBlocks = [];
  };

  for (const block of blocks) {
    if (block.kind === "text") {
      if (block.blockType === "heading") {
        flushText();
        const title = headingTitle(block);
        if ((block.level ?? 2) === 1) {
          const sourceBlockIds = sourceIdsForBlocks(blockMap, [block]);
          slides.push({
            id: `plan-slide-${slides.length + 1}`,
            kind: slides.length === 0 ? "cover" : "section",
            sourceBlockIds,
            slotSources:
              sourceBlockIds.length > 0 ? { title: sourceBlockIds } : {},
            slots: { title: { type: "shortText", text: title } },
          });
          sectionTitle = title;
          sectionTitleSource = block;
          pendingTitle = "";
          pendingTitleSource = undefined;
          continue;
        }

        pendingTitle = title;
        pendingTitleSource = block;
        continue;
      }

      if (block.blockType === "hr") {
        flushText();
        pendingTitle = sectionTitle || DEFAULT_DERIVE_TITLE;
        pendingTitleSource = sectionTitleSource;
        continue;
      }

      if (isNonEmptyTextBlock(block)) {
        if (!pendingTitle) {
          pendingTitle = sectionTitle || DEFAULT_DERIVE_TITLE;
          pendingTitleSource =
            pendingTitleSource ?? sectionTitleSource ?? block;
        }
        pendingBodyBlocks.push(block);
      }
      continue;
    }

    flushText();

    if (block.kind === "table") {
      const sourceBlockIds = sourceIdsForBlocks(blockMap, [block]);
      const tableTitle = sectionTitle || DEFAULT_TABLE_TITLE;
      slides.push({
        id: `plan-slide-${slides.length + 1}`,
        kind: "table",
        sourceBlockIds,
        slotSources: {
          ...(sourceBlockIds.length > 0 ? { title: sourceBlockIds } : {}),
          ...(sourceBlockIds.length > 0 ? { table: sourceBlockIds } : {}),
          ...(block.caption && sourceBlockIds.length > 0
            ? { caption: sourceBlockIds }
            : {}),
        },
        slots: {
          title: { type: "shortText", text: tableTitle },
          table: buildTableSlot(block),
          ...(block.caption
            ? { caption: { type: "shortText", text: block.caption } }
            : {}),
        },
      });
      continue;
    }

    const sourceBlockIds = sourceIdsForBlocks(blockMap, [block]);
    const visualTitle =
      block.visual.title?.trim() || sectionTitle || DEFAULT_VISUAL_TITLE;
    const caption = block.visual.type ? String(block.visual.type) : undefined;
    slides.push({
      id: `plan-slide-${slides.length + 1}`,
      kind: "visual-focus",
      sourceBlockIds,
      slotSources: {
        ...(sourceBlockIds.length > 0 ? { title: sourceBlockIds } : {}),
        ...(sourceBlockIds.length > 0 ? { visualId: sourceBlockIds } : {}),
        ...(caption && sourceBlockIds.length > 0
          ? { caption: sourceBlockIds }
          : {}),
      },
      slots: {
        title: { type: "shortText", text: visualTitle },
        visualId: { type: "visual", visualId: block.visualId },
        ...(caption ? { caption: { type: "shortText", text: caption } } : {}),
      },
    });
  }

  flushText();
  return {
    planVersion: 1,
    planner: "deterministic",
    mode: "faithful",
    source: {
      ...(sourcePlan.documentId ? { documentId: sourcePlan.documentId } : {}),
      contentHash: sourcePlan.contentHash,
      truncated: sourcePlan.truncated,
    },
    slides,
  };
}

export function documentSlidePlanToSemanticDeckPlan(
  plan: DocumentSlidePlanV1,
): SemanticDeckPlanV1 {
  return {
    planVersion: 1,
    ...(plan.title ? { title: plan.title } : {}),
    ...(plan.locale ? { locale: plan.locale } : {}),
    slides: plan.slides.map(
      (slide): SemanticSlideSpecV1 => ({
        kind: slide.kind,
        ...(slide.controls?.tone ? { tone: slide.controls.tone } : {}),
        ...(slide.controls?.density ? { density: slide.controls.density } : {}),
        ...(slide.controls?.emphasis
          ? { emphasis: slide.controls.emphasis }
          : {}),
        slots: slide.slots,
        ...(slide.speakerNotes ? { speakerNotes: slide.speakerNotes } : {}),
      }),
    ),
  };
}

export function semanticDeckPlanToDocumentSlidePlan({
  semanticPlan,
  sourcePlan,
  planner,
  mode,
}: {
  semanticPlan: SemanticDeckPlanV1;
  sourcePlan: DocumentSourcePlanV1;
  planner: DocumentSlidePlanner;
  mode: DocumentSlideMode;
}): DocumentSlidePlanV1 {
  return {
    planVersion: 1,
    planner,
    mode,
    ...(semanticPlan.title ? { title: semanticPlan.title } : {}),
    ...(semanticPlan.locale ? { locale: semanticPlan.locale } : {}),
    source: {
      ...(sourcePlan.documentId ? { documentId: sourcePlan.documentId } : {}),
      contentHash: sourcePlan.contentHash,
      truncated: sourcePlan.truncated,
    },
    slides: semanticPlan.slides.map(
      (slide, index): DocumentPlannedSlideV1 => ({
        id: `plan-slide-${index + 1}`,
        kind: slide.kind,
        sourceBlockIds: [],
        slotSources: {},
        slots: slide.slots,
        ...((slide.tone || slide.density || slide.emphasis) && {
          controls: {
            ...(slide.tone ? { tone: slide.tone } : {}),
            ...(slide.density ? { density: slide.density } : {}),
            ...(slide.emphasis ? { emphasis: slide.emphasis } : {}),
          },
        }),
        ...(slide.speakerNotes ? { speakerNotes: slide.speakerNotes } : {}),
      }),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function validMode(value: unknown): DocumentSlideMode {
  return value === "presentationRewrite" ? value : "faithful";
}

function sourceBlockIdSet(sourcePlan: DocumentSourcePlanV1): Set<string> {
  return new Set(
    sourcePlan.sections.flatMap((section) => section.sourceBlockIds),
  );
}

function filterSourceIds(
  ids: readonly string[],
  validIds: ReadonlySet<string>,
  diagnostics: PresentationDiagnostic[],
  path: string,
): string[] {
  const kept: string[] = [];
  for (const id of ids) {
    if (validIds.has(id)) {
      kept.push(id);
      continue;
    }
    diagnostics.push(
      makeDiagnostic(
        "missing-source-block",
        "warning",
        `Document slide plan referenced unknown source block "${id}".`,
        { path, details: { blockId: id } },
      ),
    );
  }
  return uniqueStrings(kept);
}

function readSlotSources(
  value: unknown,
  validIds: ReadonlySet<string>,
  diagnostics: PresentationDiagnostic[],
  slideIndex: number,
): Partial<Record<SlotKey, string[]>> {
  if (!isRecord(value)) return {};
  const slotSources: Partial<Record<SlotKey, string[]>> = {};
  for (const [slot, ids] of Object.entries(value)) {
    const filtered = filterSourceIds(
      readStringArray(ids),
      validIds,
      diagnostics,
      `slides[${slideIndex}].slotSources.${slot}`,
    );
    if (filtered.length > 0) {
      slotSources[slot as SlotKey] = filtered;
    }
  }
  return slotSources;
}

function semanticCandidateFromDocumentPlan(input: Record<string, unknown>) {
  const rawSlides = Array.isArray(input.slides) ? input.slides : [];
  return {
    planVersion: input.planVersion,
    ...(typeof input.title === "string" ? { title: input.title } : {}),
    ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
    slides: rawSlides.map((slide) => {
      const raw = isRecord(slide) ? slide : {};
      const controls = isRecord(raw.controls) ? raw.controls : {};
      return {
        kind: raw.kind,
        tone: controls.tone,
        density: controls.density,
        emphasis: controls.emphasis,
        slots: raw.slots,
        speakerNotes: raw.speakerNotes,
      };
    }),
  };
}

export function repairDocumentSlidePlan({
  input,
  sourcePlan,
}: {
  input: unknown;
  sourcePlan: DocumentSourcePlanV1;
}): DocumentSlidePlanRepairResult {
  if (!isRecord(input)) {
    return {
      plan: {
        planVersion: 1,
        planner: "ai",
        mode: "faithful",
        source: {
          ...(sourcePlan.documentId
            ? { documentId: sourcePlan.documentId }
            : {}),
          contentHash: sourcePlan.contentHash,
          truncated: sourcePlan.truncated,
        },
        slides: [],
      },
      diagnostics: [
        makeDiagnostic(
          "invalid-schema-version",
          "fatal",
          "Document slide plan must be an object.",
        ),
      ],
    };
  }

  const semanticRepair = repairSemanticDeckPlan(
    semanticCandidateFromDocumentPlan(input),
    createDocumentSlidePlanTemplateRegistry(),
  );
  const diagnostics = [...semanticRepair.diagnostics];
  const rawSlides = Array.isArray(input.slides) ? input.slides : [];
  const validIds = sourceBlockIdSet(sourcePlan);
  const slides: DocumentPlannedSlideV1[] = [];

  for (let index = 0; index < semanticRepair.plan.slides.length; index++) {
    const semanticSlide = semanticRepair.plan.slides[index];
    const rawSlide = isRecord(rawSlides[index]) ? rawSlides[index] : {};
    const sourceBlockIds = filterSourceIds(
      readStringArray(rawSlide.sourceBlockIds),
      validIds,
      diagnostics,
      `slides[${index}].sourceBlockIds`,
    );
    const slotSources = readSlotSources(
      rawSlide.slotSources,
      validIds,
      diagnostics,
      index,
    );
    slides.push({
      id:
        typeof rawSlide.id === "string" && rawSlide.id.length > 0
          ? rawSlide.id
          : `plan-slide-${index + 1}`,
      kind: semanticSlide.kind,
      sourceBlockIds,
      slotSources,
      slots: semanticSlide.slots,
      ...((semanticSlide.tone ||
        semanticSlide.density ||
        semanticSlide.emphasis) && {
        controls: {
          ...(semanticSlide.tone ? { tone: semanticSlide.tone } : {}),
          ...(semanticSlide.density ? { density: semanticSlide.density } : {}),
          ...(semanticSlide.emphasis
            ? { emphasis: semanticSlide.emphasis }
            : {}),
        },
      }),
      ...(semanticSlide.speakerNotes
        ? { speakerNotes: semanticSlide.speakerNotes }
        : {}),
      ...(typeof rawSlide.rationale === "string"
        ? { rationale: rawSlide.rationale }
        : {}),
      ...(readStringArray(rawSlide.omittedBlockIds).length > 0
        ? {
            omittedBlockIds: filterSourceIds(
              readStringArray(rawSlide.omittedBlockIds),
              validIds,
              diagnostics,
              `slides[${index}].omittedBlockIds`,
            ),
          }
        : {}),
    });
  }

  return {
    plan: {
      planVersion: 1,
      planner: "ai",
      mode: validMode(input.mode),
      ...(semanticRepair.plan.title
        ? { title: semanticRepair.plan.title }
        : {}),
      ...(semanticRepair.plan.locale
        ? { locale: semanticRepair.plan.locale }
        : {}),
      source: {
        ...(sourcePlan.documentId ? { documentId: sourcePlan.documentId } : {}),
        contentHash: sourcePlan.contentHash,
        truncated: sourcePlan.truncated,
      },
      slides,
      ...(readStringArray(input.omittedBlockIds).length > 0
        ? {
            omittedBlockIds: filterSourceIds(
              readStringArray(input.omittedBlockIds),
              validIds,
              diagnostics,
              "omittedBlockIds",
            ),
          }
        : {}),
    },
    diagnostics,
  };
}

function slotSourceIds(
  slotSources: Partial<Record<SlotKey, string[]>>,
  slot: SlotKey | undefined,
): string[] {
  if (!slot) return [];
  return slotSources[slot] ?? [];
}

function sourceForBlock(
  block: DocumentBlock,
  sourceBlockIds: readonly string[],
  documentId: string | undefined,
  linkedAt: string,
  derivation: {
    slidePlanId: string;
    slotKey?: SlotKey;
  },
): NodeSourceMetadata | undefined {
  if (!documentId) return undefined;
  const extra: Record<string, JsonValue> = {
    derivation: {
      pipelineVersion: 1,
      slidePlanId: derivation.slidePlanId,
      ...(derivation.slotKey ? { slotKey: derivation.slotKey } : {}),
      sourceBlockIds: [...sourceBlockIds],
    },
  };
  const base = {
    documentId,
    contentHash: hashDocumentBlock(block),
    linkedAt,
    extra,
  };
  if (block.kind === "visual") {
    return {
      ...base,
      blockId: block.visualId,
      blockKind: "visual",
    };
  }
  return {
    ...base,
    ...(block.blockId ? { blockId: block.blockId } : {}),
    blockKind: block.kind === "table" ? "table" : "text",
  };
}

function stampNodeSourceBySlot(
  node: SlideChildNode,
  slidePlan: DocumentPlannedSlideV1,
  blockMap: ReadonlyMap<string, DocumentBlock>,
  documentId: string | undefined,
  linkedAt: string,
): SlideChildNode {
  const sourceBlockIds = slotSourceIds(slidePlan.slotSources, node.slot);
  const primaryBlock = sourceBlockIds[0]
    ? blockMap.get(sourceBlockIds[0])
    : undefined;
  const source = primaryBlock
    ? sourceForBlock(primaryBlock, sourceBlockIds, documentId, linkedAt, {
        slidePlanId: slidePlan.id,
        ...(node.slot ? { slotKey: node.slot } : {}),
      })
    : undefined;

  if (node.type === "group") {
    return {
      ...node,
      ...(source ? { source } : {}),
      children: node.children.map((child) =>
        stampNodeSourceBySlot(child, slidePlan, blockMap, documentId, linkedAt),
      ),
    };
  }

  return {
    ...node,
    ...(source ? { source } : {}),
  };
}

function stampSlideSources(
  slide: SlideNode,
  slidePlan: DocumentPlannedSlideV1,
  blockMap: ReadonlyMap<string, DocumentBlock>,
  documentId: string | undefined,
  linkedAt: string,
): SlideNode {
  return {
    ...slide,
    children: slide.children.map((child) =>
      stampNodeSourceBySlot(child, slidePlan, blockMap, documentId, linkedAt),
    ),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export function compileDocumentSlidePlanToDeckV7({
  plan,
  blockMap,
  linkedAt = new Date().toISOString(),
  themePackageId = "neutral",
  canvas,
}: {
  plan: DocumentSlidePlanV1;
  blockMap: ReadonlyMap<string, DocumentBlock>;
  linkedAt?: string;
  themePackageId?: string;
  canvas?: CanvasSpec;
}): CompileDocumentSlidePlanResult {
  try {
    const diagnostics: PresentationDiagnostic[] = [];
    const slides: SlideNode[] = [];
    const semanticPlan = documentSlidePlanToSemanticDeckPlan(plan);
    const templateRegistry = createDocumentSlidePlanTemplateRegistry();

    for (let i = 0; i < semanticPlan.slides.length; i++) {
      const spec = semanticPlan.slides[i];
      const slidePlan = plan.slides[i];
      if (!spec || !slidePlan) continue;
      const template = templateRegistry.get(spec.kind);
      if (!template) continue;
      const compiled = compileSlide(spec, template, slides.length);
      diagnostics.push(...compiled.diagnostics);
      slides.push(
        stampSlideSources(
          compiled.slide,
          slidePlan,
          blockMap,
          plan.source.documentId,
          linkedAt,
        ),
      );
    }

    if (slides.length === 0) {
      return {
        ok: true,
        deck: createBlankDeckV7({ documentId: plan.source.documentId }),
        diagnostics,
      };
    }

    const sourceBlockIds = uniqueStrings(
      plan.slides.flatMap((slide) => slide.sourceBlockIds),
    );
    const omittedBlockIds = uniqueStrings([
      ...(plan.omittedBlockIds ?? []),
      ...plan.slides.flatMap((slide) => slide.omittedBlockIds ?? []),
    ]);
    const candidateDeck: DeckV7 = {
      schemaVersion: DECK_SCHEMA_VERSION_V7,
      canvas: canvas ?? {
        format: "16:9",
        width: 100,
        height: 56.25,
        unit: "percent",
      },
      theme: { packageId: themePackageId || "neutral" },
      assets: { images: {} },
      slides,
      ...(plan.title ? { title: plan.title } : {}),
      metadata: {
        createdAt: linkedAt,
        updatedAt: linkedAt,
        ...(plan.source.documentId
          ? { sourceDocumentId: plan.source.documentId }
          : {}),
        contentHash: plan.source.contentHash,
        ...(plan.locale ? { locale: plan.locale } : {}),
        extra: {
          derivation: {
            pipelineVersion: 1,
            planner: plan.planner,
            mode: plan.mode,
            ...(plan.source.documentId
              ? { sourceDocumentId: plan.source.documentId }
              : {}),
            sourceContentHash: plan.source.contentHash,
            sourceBlockIds,
            ...(omittedBlockIds.length > 0 ? { omittedBlockIds } : {}),
            generatedAt: linkedAt,
          },
        },
      },
    };

    const parsed = safeParseDeckV7(candidateDeck);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Derived deck failed v7 validation: ${parsed.errors.join("; ")}`,
        diagnostics,
        validationErrors: parsed.errors,
      };
    }

    return { ok: true, deck: parsed.data, diagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      error: `Could not compile document slide plan: ${message}`,
      diagnostics: [],
    };
  }
}
