/**
 * Template compiler for the v7 presentation system.
 *
 * Compiles an `AiSlideSpec` + `SemanticTemplateV1` into a `SlideNode` tree.
 * The compiler:
 * - Selects the best layout variant for the given controls.
 * - Materialises slot values into node content.
 * - Generates stable node ids (does NOT copy AI-generated ids).
 * - Records slot keys on nodes for future reapply/repair.
 * - Returns diagnostics for every issue.
 */

import type {
  SlideNode,
  SlideChildNode,
  TextNode,
  ImageNode,
  ShapeNode,
  TableNode,
  VisualNode,
  GroupNode,
  TextContent,
  Paragraph,
  TableContent,
  SlotKey,
  SlideControls,
} from "./schema";
import type {
  AiSlideSpec,
  SlotValue,
  BulletSlotItem,
  TimelineSlotItem,
} from "./ai-plan-schema";
import type {
  SemanticTemplateV1,
  TemplateNodeBlueprint,
} from "./template-registry";
import { selectLayout } from "./template-registry";
import type { PresentationDiagnostic } from "./diagnostics";
import { DiagnosticCollector } from "./diagnostics";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _idCounter = 0;

/** Resets the id counter (only for tests). */
export function resetIdCounter(): void {
  _idCounter = 0;
}

function generateNodeId(prefix: string = "node"): string {
  return `${prefix}-${(++_idCounter).toString(36).padStart(4, "0")}`;
}

function generateParagraphId(): string {
  return `para-${(++_idCounter).toString(36).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Content builders
// ---------------------------------------------------------------------------

function buildTextContent(value: SlotValue): TextContent | null {
  if (value.type === "shortText") {
    return {
      paragraphs: [{ id: generateParagraphId(), text: value.text }],
    };
  }
  if (value.type === "paragraph") {
    return {
      paragraphs: value.paragraphs.map((p) => ({
        id: generateParagraphId(),
        text: p,
      })),
    };
  }
  if (value.type === "bullets") {
    const paragraphs: Paragraph[] = [];
    const addItems = (items: BulletSlotItem[], indent = 0) => {
      for (const item of items) {
        paragraphs.push({
          id: generateParagraphId(),
          text: item.text,
          list: { kind: "bullet", indent },
        });
        if (item.children) {
          addItems(item.children, indent + 1);
        }
      }
    };
    addItems(value.items);
    return { paragraphs };
  }
  if (value.type === "metric") {
    return {
      paragraphs: [{ id: generateParagraphId(), text: value.value }],
    };
  }
  return null;
}

function buildTableContent(value: SlotValue): TableContent | null {
  if (value.type !== "table") return null;
  return {
    columns: value.columns.map((label, i) => ({
      id: `col-${i}`,
      label,
    })),
    rows: value.rows.map((cells, ri) => ({
      id: `row-${ri}`,
      cells: cells.map((text) => ({ text })),
    })),
    ...(value.caption ? { caption: value.caption } : {}),
    header: true,
  };
}

function buildTimelineRoleContent(
  items: TimelineSlotItem[],
  role: TemplateNodeBlueprint["role"],
): TextContent | null {
  const texts = items
    .map((item) => {
      if (role === "label") return item.label;
      if (role === "title") return item.title;
      if (role === "body") return item.body;
      return undefined;
    })
    .filter(
      (text): text is string => typeof text === "string" && text.length > 0,
    );

  if (texts.length === 0) return null;
  return {
    paragraphs: texts.map((text) => ({ id: generateParagraphId(), text })),
  };
}

// ---------------------------------------------------------------------------
// Blueprint materialisation
// ---------------------------------------------------------------------------

function materialiseBlueprintNode(
  blueprint: TemplateNodeBlueprint,
  slots: Partial<Record<SlotKey, SlotValue>>,
  dc: DiagnosticCollector,
  slideIndex: number,
): SlideChildNode | null {
  const nodeId = generateNodeId(blueprint.role ?? blueprint.type ?? "node");
  const slotKey = blueprint.slot;
  const slotValue = slotKey ? slots[slotKey] : undefined;

  const baseNode = {
    id: nodeId,
    ...(blueprint.role !== undefined ? { role: blueprint.role } : {}),
    ...(slotKey !== undefined ? { slot: slotKey } : {}),
    layout: blueprint.layout,
    style: blueprint.style,
  };

  const nodeType = blueprint.type;

  if (nodeType === "text") {
    let content: TextContent | null = null;
    if (slotValue) {
      content = buildTextContent(slotValue);
    }
    if (!content) {
      // Use static content or empty paragraph
      const staticText =
        blueprint.content?.type === "text" ? blueprint.content.text : "";
      content = {
        paragraphs: [{ id: generateParagraphId(), text: staticText }],
      };
    }
    return { ...baseNode, type: "text", content } as TextNode;
  }

  if (nodeType === "image") {
    if (slotValue?.type === "image") {
      return {
        ...baseNode,
        type: "image",
        content: {
          assetId: slotValue.assetId ?? "placeholder",
          ...(slotValue.alt ? { alt: slotValue.alt } : {}),
        },
      } as ImageNode;
    }
    // Placeholder image
    return {
      ...baseNode,
      type: "image",
      content: { assetId: "placeholder" },
    } as ImageNode;
  }

  if (nodeType === "shape") {
    return {
      ...baseNode,
      type: "shape",
      content: { shape: "rect" },
    } as ShapeNode;
  }

  if (nodeType === "table") {
    let content: TableContent | null = slotValue
      ? buildTableContent(slotValue)
      : null;
    if (!content) {
      content = {
        columns: [{ id: "col-0", label: "Column 1" }],
        rows: [{ id: "row-0", cells: [{ text: "" }] }],
      };
    }
    return { ...baseNode, type: "table", content } as TableNode;
  }

  if (nodeType === "visual") {
    const visualId =
      slotValue?.type === "visual" ? slotValue.visualId : undefined;
    const assetId = slotValue?.type === "image" ? slotValue.assetId : undefined;
    return {
      ...baseNode,
      type: "visual",
      content: {
        ...(assetId ? { assetId } : {}),
        ...(visualId ? { visualId } : {}),
      },
    } as VisualNode;
  }

  if (nodeType === "group") {
    const children: SlideChildNode[] = [];
    if (slotValue?.type === "timeline") {
      for (const childBp of blueprint.children ?? []) {
        const child = materialiseBlueprintNode(childBp, slots, dc, slideIndex);
        if (!child) continue;
        if (child.type === "text") {
          const timelineContent = buildTimelineRoleContent(
            slotValue.items,
            childBp.role,
          );
          if (timelineContent) {
            children.push({
              ...child,
              content: timelineContent,
            });
            continue;
          }
        }
        children.push(child);
      }
    } else {
      for (const childBp of blueprint.children ?? []) {
        const child = materialiseBlueprintNode(childBp, slots, dc, slideIndex);
        if (child) children.push(child);
      }
    }
    if (children.length === 0) {
      // Add a placeholder child so group invariant holds
      children.push({
        id: generateNodeId("placeholder"),
        type: "shape",
        content: { shape: "rect" },
        style: blueprint.style,
      } as ShapeNode);
    }
    return {
      ...baseNode,
      type: "group",
      component: blueprint.component ?? "custom",
      children,
    } as GroupNode;
  }

  dc.warning(
    "unknown-template-kind",
    `Blueprint node type "${nodeType}" is not supported; skipping`,
    { path: `slides[${slideIndex}]` },
  );
  return null;
}

// ---------------------------------------------------------------------------
// Public compiler
// ---------------------------------------------------------------------------

export type TemplateCompileResult = {
  slide: SlideNode;
  diagnostics: PresentationDiagnostic[];
};

/**
 * Compiles an `AiSlideSpec` and a `SemanticTemplateV1` into a `SlideNode`.
 *
 * Rules:
 * - Layout selection is deterministic: exact match -> density -> emphasis -> default.
 * - Node ids are generated; AI-provided ids are never used.
 * - Slot keys are stamped on nodes for reapply/repair.
 * - Diagnostics are returned alongside the compiled node.
 */
export function compileSlide(
  spec: AiSlideSpec,
  template: SemanticTemplateV1,
  slideIndex: number = 0,
): TemplateCompileResult {
  const dc = new DiagnosticCollector();

  // Select layout
  const layout = selectLayout(template, spec.density, spec.emphasis);

  // Materialise children from layout blueprints
  const rootBlueprint = layout.root;
  const children: SlideChildNode[] = [];

  for (const childBp of rootBlueprint.children ?? []) {
    const child = materialiseBlueprintNode(childBp, spec.slots, dc, slideIndex);
    if (child) {
      children.push(child);
    }
  }

  const controls: SlideControls = {};
  if (spec.tone) controls.tone = spec.tone;
  if (spec.density) controls.density = spec.density;
  if (spec.emphasis) controls.emphasis = spec.emphasis;

  const slide: SlideNode = {
    id: generateNodeId("slide"),
    type: "slide",
    template: {
      kind: spec.kind,
      layoutId: layout.id,
    },
    style: rootBlueprint.style,
    ...(Object.keys(controls).length > 0 ? { controls } : {}),
    children,
    ...(spec.speakerNotes ? { notes: spec.speakerNotes } : {}),
  };

  return { slide, diagnostics: dc.diagnostics };
}
