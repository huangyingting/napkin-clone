import type {
  AiSlideSpec,
  BulletSlotItem,
  SlotValue,
} from "@/lib/presentation-vnext/ai-plan-schema";
import {
  collectDocumentBlocks,
  type DocumentBlock,
  type DocumentTableBlock,
  type DocumentTextBlock,
} from "@/lib/content";
import { hashDocumentBlock } from "@/lib/presentation/document-block-hash";

import type { PresentationDiagnostic } from "./diagnostics";
import { createBlankDeckV7 } from "./empty-deck";
import type {
  DeckV7,
  NodeSourceMetadata,
  SlideChildNode,
  SlideNode,
  SlotKey,
} from "./schema";
import { DECK_SCHEMA_VERSION_V7 } from "./schema";
import { compileSlide } from "./template-compiler";
import {
  type SemanticTemplateV1,
  type TemplateGroup,
} from "./template-registry";
import { createDefaultTemplateRegistry } from "./theme-packages";
import { safeParseDeckV7 } from "./validation";

const DEFAULT_DERIVE_TITLE = "Document";
const DEFAULT_TABLE_TITLE = "Table";
const DEFAULT_VISUAL_TITLE = "Visual";
const MAX_BULLET_ITEMS_PER_SLIDE = 6;

type DeriveDraft = {
  spec: AiSlideSpec;
  slotSources: Partial<Record<SlotKey, DocumentBlock>>;
  template?: SemanticTemplateV1;
};

export type DeriveDeckV7Result =
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

function textSourceForBlock(
  block: DocumentBlock,
  documentId: string | undefined,
  linkedAt: string,
): NodeSourceMetadata | undefined {
  if (!documentId) return undefined;
  const base = {
    documentId,
    contentHash: hashDocumentBlock(block),
    linkedAt,
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
  slotSources: Partial<Record<SlotKey, DocumentBlock>>,
  documentId: string | undefined,
  linkedAt: string,
): SlideChildNode {
  const slotSource = node.slot ? slotSources[node.slot] : undefined;
  const source = slotSource
    ? textSourceForBlock(slotSource, documentId, linkedAt)
    : undefined;

  if (node.type === "group") {
    return {
      ...node,
      ...(source ? { source } : {}),
      children: node.children.map((child) =>
        stampNodeSourceBySlot(child, slotSources, documentId, linkedAt),
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
  slotSources: Partial<Record<SlotKey, DocumentBlock>>,
  documentId: string | undefined,
  linkedAt: string,
): SlideNode {
  return {
    ...slide,
    children: slide.children.map((child) =>
      stampNodeSourceBySlot(child, slotSources, documentId, linkedAt),
    ),
  };
}

function pushTextDraft(
  drafts: DeriveDraft[],
  options: {
    title: string;
    titleSource?: DocumentBlock;
    bodyBlocks: DocumentTextBlock[];
  },
): void {
  const titleText = options.title.trim() || DEFAULT_DERIVE_TITLE;
  if (options.bodyBlocks.length === 0) {
    drafts.push({
      spec: {
        kind: drafts.length === 0 ? "cover" : "content",
        slots: {
          title: { type: "shortText", text: titleText },
        },
      },
      slotSources: {
        ...(options.titleSource ? { title: options.titleSource } : {}),
      },
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

    const chunkTitle =
      offset === 0 ? titleText : `${titleText} (cont.)`.trimEnd();
    const titleSource = offset === 0 ? options.titleSource : chunk[0];
    drafts.push({
      spec: {
        kind: "content",
        slots: {
          title: { type: "shortText", text: chunkTitle },
          bullets: { type: "bullets", items },
        },
      },
      slotSources: {
        ...(titleSource ? { title: titleSource } : {}),
        bullets: chunk[0],
      },
    });
  }
}

function buildDeriveDrafts(blocks: DocumentBlock[]): DeriveDraft[] {
  const drafts: DeriveDraft[] = [];
  let sectionTitle = "";
  let sectionTitleSource: DocumentTextBlock | undefined;
  let pendingTitle = "";
  let pendingTitleSource: DocumentTextBlock | undefined;
  let pendingBodyBlocks: DocumentTextBlock[] = [];

  const flushText = () => {
    if (!pendingTitle && pendingBodyBlocks.length === 0) return;
    pushTextDraft(drafts, {
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
          drafts.push({
            spec: {
              kind: drafts.length === 0 ? "cover" : "section",
              slots: { title: { type: "shortText", text: title } },
            },
            slotSources: { title: block },
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
      const tableTitle = sectionTitle || DEFAULT_TABLE_TITLE;
      drafts.push({
        spec: {
          kind: "table",
          slots: {
            title: { type: "shortText", text: tableTitle },
            table: buildTableSlot(block),
            ...(block.caption
              ? { caption: { type: "shortText", text: block.caption } }
              : {}),
          },
        },
        slotSources: {
          title: block,
          table: block,
          ...(block.caption ? { caption: block } : {}),
        },
      });
      continue;
    }

    const visualTitle =
      block.visual.title?.trim() || sectionTitle || DEFAULT_VISUAL_TITLE;
    const caption = block.visual.type ? String(block.visual.type) : undefined;
    drafts.push({
      spec: {
        kind: "visual-focus",
        slots: {
          title: { type: "shortText", text: visualTitle },
          visualId: { type: "visual", visualId: block.visualId },
          ...(caption ? { caption: { type: "shortText", text: caption } } : {}),
        },
      },
      slotSources: {
        title: block,
        visualId: block,
        ...(caption ? { caption: block } : {}),
      },
      template: VISUAL_DERIVE_TEMPLATE,
    });
  }

  flushText();
  return drafts;
}

export function deriveDeckV7FromDocumentContent({
  contentJson,
  documentId,
  linkedAt = new Date().toISOString(),
  themePackageId = "neutral",
}: {
  contentJson: unknown;
  documentId?: string;
  linkedAt?: string;
  themePackageId?: string;
}): DeriveDeckV7Result {
  const fallbackDeck = createBlankDeckV7({ documentId });
  const blocks = collectDocumentBlocks(contentJson);
  if (blocks.length === 0) {
    return { ok: true, deck: fallbackDeck, diagnostics: [] };
  }

  try {
    const templateRegistry = createDefaultTemplateRegistry();
    const drafts = buildDeriveDrafts(blocks);
    if (drafts.length === 0) {
      return { ok: true, deck: fallbackDeck, diagnostics: [] };
    }

    const diagnostics: PresentationDiagnostic[] = [];
    const slides: SlideNode[] = [];

    for (const draft of drafts) {
      const template =
        draft.template ??
        templateRegistry.get(draft.spec.kind) ??
        templateRegistry.get("content");
      if (!template) continue;
      const compiled = compileSlide(draft.spec, template, slides.length);
      diagnostics.push(...compiled.diagnostics);
      slides.push(
        stampSlideSources(
          compiled.slide,
          draft.slotSources,
          documentId,
          linkedAt,
        ),
      );
    }

    if (slides.length === 0) {
      return { ok: true, deck: fallbackDeck, diagnostics };
    }

    const candidateDeck: DeckV7 = {
      schemaVersion: DECK_SCHEMA_VERSION_V7,
      canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
      theme: { packageId: themePackageId || "neutral" },
      assets: { images: {} },
      slides,
      metadata: {
        createdAt: linkedAt,
        updatedAt: linkedAt,
        ...(documentId ? { sourceDocumentId: documentId } : {}),
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
      error: `Could not derive deck from document: ${message}`,
      diagnostics: [],
    };
  }
}
