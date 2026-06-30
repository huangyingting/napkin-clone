import type {
  ConnectorAnchor,
  ConnectorEndpoint,
  DeckChromeConfig,
  DeckV7,
  ImageAsset,
  LayoutBox,
  Paragraph,
  SemanticRole,
  SemanticTemplateKind,
  ShapeKind,
  SlideChildNode,
  SlideNode,
  TextContent,
  TextRun,
} from "./schema";
import type { PresentationDiagnostic } from "./diagnostics";
import { makeDiagnostic } from "./diagnostics";
import { safeParseDeckV7 } from "./validation";
import {
  getThemePackageV7,
  resolveThemePackageIdV7,
} from "./theme-package-registry";

/**
 * Explicit old→new identity mapping emitted by a v6→v7 migration.
 *
 * Compatible v6 ids are preserved as v7 ids; when an id must be rewritten (it is
 * illegal or collides), the original→assigned pair is recorded here so downstream
 * consumers (comment / source-link anchor migration, #1274) can remap references
 * instead of losing them. Only identities that carried a usable original id are
 * recorded.
 */
export interface MigrationIdMap {
  /** Original v6 deck id → assigned v7 deck id. */
  decks: Record<string, string>;
  /** Original v6 slide id → assigned v7 slide id. */
  slides: Record<string, string>;
  /** Original v6 element id → assigned v7 node id. */
  nodes: Record<string, string>;
  /** Original v6 asset id → assigned v7 asset id. */
  assets: Record<string, string>;
  /** Original legacy theme id → assigned v7 theme package id. */
  themes: Record<string, string>;
  /** Original source block id → preserved v7 source block id. */
  sources: Record<string, string>;
  /** Explicit rewrite records, including reason, for callers needing more detail. */
  rewrites: MigrationRewrite[];
  /** Dropped identities that could not be migrated. */
  dropped: MigrationDroppedIdentity[];
  /** References that could not be remapped to a migrated identity. */
  unmapped: MigrationUnmappedReference[];
}

type MigrationResult =
  | {
      ok: true;
      deck: DeckV7;
      diagnostics: PresentationDiagnostic[];
      idMap: MigrationIdMap;
    }
  | {
      ok: false;
      error: string;
      errors?: string[];
      diagnostics: PresentationDiagnostic[];
    };

/** Outcome of assigning a v7 id from a (possibly absent or illegal) v6 id. */
interface IdAssignment {
  /** The final, valid, unique v7 id. */
  id: string;
  /** The original v6 id, when one was present and usable. */
  original: string | null;
  /** True when an original id was present but had to be rewritten. */
  renamed: boolean;
}

export type MigrationIdentityKind =
  | "deck"
  | "slide"
  | "node"
  | "asset"
  | "theme";

export interface MigrationRewrite {
  kind: MigrationIdentityKind;
  from: string;
  to: string;
  reason: string;
}

export interface MigrationDroppedIdentity {
  kind: "node";
  from: string;
  reason: string;
  slideId: string;
}

export interface MigrationUnmappedReference {
  kind: "connector-endpoint" | "source-ref";
  from: string;
  reason: string;
  slideId: string;
  nodeId: string;
}

/** Accumulates identity mappings and drop notes across a migration pass. */
interface MigrationRecorder {
  decks: Record<string, string>;
  slides: Record<string, string>;
  nodes: Record<string, string>;
  assets: Record<string, string>;
  themes: Record<string, string>;
  sources: Record<string, string>;
  rewrites: MigrationRewrite[];
  dropped: MigrationDroppedIdentity[];
  unmapped: MigrationUnmappedReference[];
}

type LegacyMasterChromeKind = "logo" | "footer" | "pageNumber" | "watermark";

/** Result of attempting to migrate a single v6 element to a v7 node. */
type ElementMigration =
  | { ok: true; node: SlideChildNode; assignment: IdAssignment }
  | { ok: false; reason: string; assignment: IdAssignment | null };

const SEMANTIC_ROLES = new Set<SemanticRole>([
  "slide",
  "title",
  "subtitle",
  "kicker",
  "body",
  "bullet",
  "caption",
  "quote",
  "attribution",
  "metric",
  "label",
  "table",
  "visual",
  "image",
  "card",
  "callout",
  "connector",
  "background",
  "themeDecoration",
]);

const TEMPLATE_KINDS = new Set<SemanticTemplateKind>([
  "cover",
  "agenda",
  "section",
  "executive-summary",
  "content",
  "detail",
  "quote",
  "big-stat",
  "metric-row",
  "insight",
  "evidence",
  "table",
  "comparison",
  "matrix",
  "framework",
  "process",
  "timeline",
  "roadmap",
  "architecture",
  "case-study",
  "risks",
  "recommendation",
  "pricing",
  "team",
  "visual-focus",
  "closing",
  "appendix",
]);

const SHAPE_KINDS = new Set<ShapeKind>([
  "rect",
  "ellipse",
  "line",
  "triangle",
  "diamond",
  "circle",
  "square",
  "path",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Assigns a valid, unique v7 id from a candidate v6 id.
 *
 * A compatible v6 id (non-empty, ASCII-safe, unique) is preserved verbatim. An
 * illegal or colliding id is rewritten deterministically and flagged via
 * {@link IdAssignment.renamed} so the caller can record an old→new mapping.
 */
function assignId(
  value: unknown,
  fallback: string,
  usedIds: Set<string>,
): IdAssignment {
  const original = typeof value === "string" && value.length > 0 ? value : null;
  const source = original ?? fallback;
  const cleaned = source.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 128);
  const base = /^[a-zA-Z0-9]/.test(cleaned) ? cleaned : fallback;
  let candidate = base || fallback;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return {
    id: candidate,
    original,
    renamed: original !== null && candidate !== original,
  };
}

function rewriteReason(assignment: IdAssignment): string {
  if (assignment.original === null || !assignment.renamed) {
    return "preserved";
  }
  const cleaned = assignment.original.replace(/[^a-zA-Z0-9:_-]/g, "-");
  if (
    cleaned !== assignment.original ||
    !/^[a-zA-Z0-9]/.test(cleaned) ||
    assignment.original.length > 128
  ) {
    return "invalid-id";
  }
  return "duplicate-id";
}

function validRole(value: unknown): SemanticRole | undefined {
  return typeof value === "string" && SEMANTIC_ROLES.has(value as SemanticRole)
    ? (value as SemanticRole)
    : undefined;
}

function templateKindForSlide(
  slide: Record<string, unknown>,
  slideIndex: number,
): SemanticTemplateKind {
  if (typeof slide.templateId === "string") {
    const idParts = slide.templateId.split(":");
    const candidate = idParts[idParts.length - 1];
    if (TEMPLATE_KINDS.has(candidate as SemanticTemplateKind)) {
      return candidate as SemanticTemplateKind;
    }
  }
  if (slideIndex === 0) return "cover";
  return "content";
}

function slideStyleRef(
  kind: SemanticTemplateKind,
): "slide.cover" | "slide.content" | "slide.section" {
  if (kind === "cover") return "slide.cover";
  if (kind === "section") return "slide.section";
  return "slide.content";
}

function textStyleRef(
  role: SemanticRole | undefined,
):
  | "text.title"
  | "text.subtitle"
  | "text.body"
  | "text.kicker"
  | "text.caption"
  | "text.quote"
  | "text.metric" {
  switch (role) {
    case "title":
      return "text.title";
    case "subtitle":
      return "text.subtitle";
    case "kicker":
      return "text.kicker";
    case "caption":
      return "text.caption";
    case "quote":
      return "text.quote";
    case "metric":
      return "text.metric";
    default:
      return "text.body";
  }
}

function layoutFromElement(
  element: Record<string, unknown>,
  fallbackZ: number,
): LayoutBox {
  const box = isPlainObject(element.box) ? element.box : {};
  const frame = {
    x: finiteNumber(box.x, 10),
    y: finiteNumber(box.y, 10),
    w: Math.max(0.1, finiteNumber(box.w, 30)),
    h: Math.max(0.1, finiteNumber(box.h, 10)),
  };
  return {
    frame,
    zIndex: Math.trunc(finiteNumber(element.zIndex, fallbackZ)),
    ...(element.rotation !== undefined
      ? { rotation: finiteNumber(element.rotation, 0) }
      : {}),
  };
}

function migrateRuns(value: unknown): TextRun[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const runs = value.filter(isPlainObject).map((run): TextRun => {
    const text = typeof run.text === "string" ? run.text : "";
    return {
      text,
      ...(run.bold === true ? { bold: true } : {}),
      ...(run.italic === true ? { italic: true } : {}),
      ...(run.underline === true ? { underline: true } : {}),
      ...(run.code === true ? { code: true } : {}),
      ...(typeof run.link === "string" ? { link: run.link } : {}),
      ...(typeof run.color === "string"
        ? { localStyle: { color: run.color } }
        : {}),
    };
  });
  return runs.length > 0 ? runs : undefined;
}

function migrateParagraphs(
  content: Record<string, unknown>,
  nodeId: string,
): Paragraph[] {
  if (Array.isArray(content.paragraphs) && content.paragraphs.length > 0) {
    return content.paragraphs.filter(isPlainObject).map((paragraph, index) => {
      const text = typeof paragraph.text === "string" ? paragraph.text : "";
      const runs = migrateRuns(paragraph.runs);
      return {
        id: `${nodeId}-p-${index + 1}`,
        text,
        ...(runs && runs.map((run) => run.text).join("") === text
          ? { runs }
          : {}),
        ...(paragraph.listType === "number"
          ? {
              list: {
                kind: "number" as const,
                indent: finiteNumber(paragraph.indent, 0),
              },
            }
          : paragraph.listType === "bullet" || paragraph.indent !== undefined
            ? {
                list: {
                  kind: "bullet" as const,
                  indent: finiteNumber(paragraph.indent, 0),
                },
              }
            : {}),
      };
    });
  }

  const text = typeof content.text === "string" ? content.text : "";
  const runs = migrateRuns(content.runs);
  return [
    {
      id: `${nodeId}-p-1`,
      text,
      ...(runs && runs.map((run) => run.text).join("") === text
        ? { runs }
        : {}),
    },
  ];
}

function textContent(
  content: Record<string, unknown>,
  nodeId: string,
): TextContent {
  return {
    paragraphs: migrateParagraphs(content, nodeId),
    ...(content.fitMode === "fixed-box" || content.fitMode === "shrink-to-fit"
      ? { fit: content.fitMode }
      : {}),
  };
}

function sourceMetadata(
  source: unknown,
  recorder: MigrationRecorder,
  slideId: string,
  nodeId: string,
): SlideChildNode["source"] {
  if (source === undefined) return undefined;
  if (!isPlainObject(source)) {
    recorder.unmapped.push({
      kind: "source-ref",
      from: nodeId,
      reason: "Source metadata is not an object.",
      slideId,
      nodeId,
    });
    return undefined;
  }
  if (
    typeof source.documentId !== "string" ||
    typeof source.blockId !== "string"
  ) {
    recorder.unmapped.push({
      kind: "source-ref",
      from: typeof source.blockId === "string" ? source.blockId : nodeId,
      reason: "Source metadata is missing a documentId or blockId.",
      slideId,
      nodeId,
    });
    return undefined;
  }
  const blockKind =
    source.blockKind === "text" ||
    source.blockKind === "visual" ||
    source.blockKind === "table" ||
    source.blockKind === "image"
      ? source.blockKind
      : undefined;
  return {
    documentId: source.documentId,
    blockId: source.blockId,
    ...(blockKind ? { blockKind } : {}),
    ...(typeof source.contentHash === "string"
      ? { contentHash: source.contentHash }
      : {}),
    ...(typeof source.blockRevision === "string"
      ? { blockRevision: source.blockRevision }
      : {}),
    ...(typeof source.linkedAt === "string"
      ? { linkedAt: source.linkedAt }
      : {}),
    ...(isPlainObject(source.display)
      ? {
          display: {
            ...(typeof source.display.documentTitle === "string"
              ? { documentTitle: source.display.documentTitle }
              : {}),
            ...(typeof source.display.blockLabel === "string"
              ? { blockLabel: source.display.blockLabel }
              : {}),
            ...(typeof source.display.blockKindLabel === "string"
              ? { blockKindLabel: source.display.blockKindLabel }
              : {}),
          },
        }
      : {}),
    ...(isPlainObject(source.refresh) &&
    (source.refresh.state === "fresh" ||
      source.refresh.state === "stale" ||
      source.refresh.state === "orphan" ||
      source.refresh.state === "unlinked" ||
      source.refresh.state === "unknown")
      ? {
          refresh: {
            state: source.refresh.state,
            ...(typeof source.refresh.checkedAt === "string"
              ? { checkedAt: source.refresh.checkedAt }
              : {}),
            ...(typeof source.refresh.refreshedAt === "string"
              ? { refreshedAt: source.refresh.refreshedAt }
              : {}),
            ...(typeof source.refresh.sourceHash === "string"
              ? { sourceHash: source.refresh.sourceHash }
              : {}),
            ...(typeof source.refresh.reason === "string"
              ? { reason: source.refresh.reason }
              : {}),
          },
        }
      : {}),
    ...(source.unlinked === true ? { unlinked: true } : {}),
  };
}

function baseNode(
  element: Record<string, unknown>,
  id: string,
  fallbackZ: number,
  recorder: MigrationRecorder,
  slideId: string,
): Pick<
  SlideChildNode,
  "id" | "role" | "layout" | "locked" | "hidden" | "name" | "source"
> {
  const role = validRole(element.role);
  const source = sourceMetadata(element.source, recorder, slideId, id);
  return {
    id,
    ...(role ? { role } : {}),
    layout: layoutFromElement(element, fallbackZ),
    ...(element.locked === true ? { locked: true } : {}),
    ...(element.hidden === true ? { hidden: true } : {}),
    ...(typeof element.name === "string" ? { name: element.name } : {}),
    ...(source ? { source } : {}),
  };
}

function imageAssetId(
  content: Record<string, unknown>,
  nodeId: string,
  images: Record<string, ImageAsset>,
  usedAssetIds: Set<string>,
  recordIdentity: (
    kind: MigrationIdentityKind,
    assignment: IdAssignment,
  ) => void,
): string | null {
  const src = typeof content.src === "string" ? content.src : undefined;
  if (typeof content.assetId === "string" && content.assetId.length > 0) {
    const assignment = assignId(
      content.assetId,
      `${nodeId}-asset`,
      usedAssetIds,
    );
    const assetId = assignment.id;
    recordIdentity("asset", assignment);
    if (src)
      images[assetId] = {
        id: assetId,
        src,
        ...(typeof content.alt === "string" ? { alt: content.alt } : {}),
      };
    return assetId;
  }
  if (!src) return null;
  const generated = assignId(null, `${nodeId}-asset`, usedAssetIds);
  const generatedId = generated.id;
  images[generatedId] = {
    id: generatedId,
    src,
    ...(typeof content.alt === "string" ? { alt: content.alt } : {}),
  };
  return generatedId;
}

function connectorEndpoint(value: unknown): ConnectorEndpoint {
  if (isPlainObject(value)) {
    if (typeof value.elementId === "string") {
      return {
        kind: "node",
        nodeId: value.elementId,
        anchor: connectorAnchor(value.anchor),
      };
    }
    return {
      kind: "point",
      point: {
        x: finiteNumber(value.x, 0),
        y: finiteNumber(value.y, 0),
      },
    };
  }
  return { kind: "point", point: { x: 0, y: 0 } };
}

function connectorAnchor(value: unknown): ConnectorAnchor {
  return value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left" ||
    value === "center"
    ? value
    : "center";
}

function buildNodeForKind(
  element: Record<string, unknown>,
  id: string,
  base: ReturnType<typeof baseNode>,
  role: SemanticRole | undefined,
  content: Record<string, unknown>,
  images: Record<string, ImageAsset>,
  usedAssetIds: Set<string>,
  recordIdentity: (
    kind: MigrationIdentityKind,
    assignment: IdAssignment,
  ) => void,
): SlideChildNode | { drop: string } {
  switch (element.kind) {
    case "text":
      return {
        ...base,
        type: "text",
        style: { ref: textStyleRef(role) },
        content: textContent(content, id),
      };
    case "image": {
      const assetId = imageAssetId(
        content,
        id,
        images,
        usedAssetIds,
        recordIdentity,
      );
      if (!assetId) return { drop: "Image element has no resolvable source." };
      return {
        ...base,
        type: "image",
        role: base.role ?? "image",
        style: { ref: "media.inline" },
        content: {
          assetId,
          ...(typeof content.alt === "string" ? { alt: content.alt } : {}),
        },
      };
    }
    case "visual": {
      const visualId =
        typeof content.visualId === "string" ? content.visualId : undefined;
      if (!visualId) return { drop: "Visual element has no visualId." };
      return {
        ...base,
        type: "visual",
        role: base.role ?? "visual",
        style: { ref: "chart.primary" },
        content: {
          visualId,
          ...(typeof content.alt === "string" ? { alt: content.alt } : {}),
        },
      };
    }
    case "shape": {
      const rawShape =
        typeof content.shape === "string" &&
        SHAPE_KINDS.has(content.shape as ShapeKind)
          ? (content.shape as ShapeKind)
          : "rect";
      const shape =
        rawShape === "path" && typeof content.path !== "string"
          ? "rect"
          : rawShape;
      const label = typeof content.text === "string" ? content.text : "";
      return {
        ...base,
        type: "shape",
        style: { ref: "surface.card" },
        content: {
          shape,
          ...(shape === "path" && typeof content.path === "string"
            ? { path: content.path }
            : {}),
          ...(label
            ? {
                text: textContent(
                  { text: label, runs: content.textRuns },
                  `${id}-text`,
                ),
              }
            : {}),
        },
      };
    }
    case "connector":
      return {
        ...base,
        type: "connector",
        role: base.role ?? "connector",
        style: { ref: "connector.primary" },
        content: {
          from: connectorEndpoint(content.start),
          to: connectorEndpoint(content.end),
          ...(content.routing === "elbow"
            ? { routing: "elbow" }
            : { routing: "straight" }),
        },
      };
    case "table": {
      const columns = Array.isArray(content.columns)
        ? content.columns
            .filter(isPlainObject)
            .slice(0, 8)
            .map((column, columnIndex) => ({
              id:
                typeof column.id === "string"
                  ? column.id
                  : `${id}-col-${columnIndex + 1}`,
              label:
                typeof column.label === "string"
                  ? column.label
                  : `Column ${columnIndex + 1}`,
              ...(typeof column.width === "number"
                ? { width: column.width }
                : {}),
            }))
        : [];
      const safeColumns =
        columns.length > 0
          ? columns
          : [{ id: `${id}-col-1`, label: "Column 1" }];
      const rows = Array.isArray(content.rows)
        ? content.rows
            .filter(isPlainObject)
            .slice(0, 20)
            .map((row, rowIndex) => {
              const rawCells = Array.isArray(row.cells) ? row.cells : [];
              const cells = safeColumns.map((_, cellIndex) => {
                const cell = rawCells[cellIndex];
                return isPlainObject(cell) && typeof cell.text === "string"
                  ? { text: cell.text }
                  : { text: "" };
              });
              return {
                id:
                  typeof row.id === "string"
                    ? row.id
                    : `${id}-row-${rowIndex + 1}`,
                cells,
              };
            })
        : [];
      return {
        ...base,
        type: "table",
        role: "table",
        style: { ref: "surface.table" },
        content: {
          columns: safeColumns,
          rows:
            rows.length > 0
              ? rows
              : [
                  {
                    id: `${id}-row-1`,
                    cells: safeColumns.map(() => ({ text: "" })),
                  },
                ],
          ...(content.header === true ? { header: true } : {}),
          ...(typeof content.caption === "string"
            ? { caption: content.caption }
            : {}),
        },
      };
    }
    default:
      return { drop: `Unsupported element kind "${String(element.kind)}".` };
  }
}

function migrateElement(
  element: unknown,
  index: number,
  slideId: string,
  usedIds: Set<string>,
  usedAssetIds: Set<string>,
  images: Record<string, ImageAsset>,
  recorder: MigrationRecorder,
  recordIdentity: (
    kind: MigrationIdentityKind,
    assignment: IdAssignment,
  ) => void,
): ElementMigration {
  if (!isPlainObject(element) || typeof element.kind !== "string") {
    return {
      ok: false,
      reason: "Element is not a recognised object.",
      assignment: null,
    };
  }
  const assignment = assignId(element.id, `node-${index + 1}`, usedIds);
  const id = assignment.id;
  const content = isPlainObject(element.content) ? element.content : {};
  const base = baseNode(element, id, index + 1, recorder, slideId);
  const role = validRole(element.role);

  const built = buildNodeForKind(
    element,
    id,
    base,
    role,
    content,
    images,
    usedAssetIds,
    recordIdentity,
  );
  if ("drop" in built) {
    return { ok: false, reason: built.drop, assignment };
  }
  return { ok: true, node: built, assignment };
}

function canvasFromLegacy(raw: Record<string, unknown>): DeckV7["canvas"] {
  const canvas = isPlainObject(raw.canvas) ? raw.canvas : {};
  if (canvas.format === "4:3") {
    return { format: "4:3", width: 100, height: 75, unit: "percent" };
  }
  if (canvas.format === "square") {
    return { format: "square", width: 100, height: 100, unit: "percent" };
  }
  return { format: "16:9", width: 100, height: 56.25, unit: "percent" };
}

function themeFromLegacy(raw: Record<string, unknown>): {
  theme: DeckV7["theme"];
  original: string | null;
  renamed: boolean;
} {
  const design = isPlainObject(raw.design) ? raw.design : {};
  const original = typeof design.themeId === "string" ? design.themeId : null;
  const packageId = resolveThemePackageIdV7(original ?? "neutral");
  const resolved = getThemePackageV7(packageId) ? packageId : "neutral";
  return {
    theme: { packageId: resolved },
    original,
    renamed: original !== null && original !== resolved,
  };
}

function legacyMasterElements(
  raw: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!Array.isArray(raw.masters)) return [];
  const masters = raw.masters.filter(isPlainObject);
  const defaultMaster =
    typeof raw.defaultMasterId === "string"
      ? masters.find((master) => master.id === raw.defaultMasterId)
      : undefined;
  const master = defaultMaster ?? masters[0];
  return Array.isArray(master?.elements)
    ? master.elements.filter(isPlainObject)
    : [];
}

function legacyChromeKind(
  element: Record<string, unknown>,
): LegacyMasterChromeKind | null {
  return element.masterChromeKind === "logo" ||
    element.masterChromeKind === "footer" ||
    element.masterChromeKind === "pageNumber" ||
    element.masterChromeKind === "watermark"
    ? element.masterChromeKind
    : null;
}

function legacyText(element: Record<string, unknown>): string {
  const content = isPlainObject(element.content) ? element.content : {};
  if (typeof content.text === "string") return content.text;
  if (Array.isArray(content.paragraphs)) {
    const paragraph = content.paragraphs.find(isPlainObject);
    if (paragraph && typeof paragraph.text === "string") return paragraph.text;
  }
  return "";
}

function legacyTextAlign(
  element: Record<string, unknown>,
): "left" | "center" | "right" | undefined {
  const designOverrides = isPlainObject(element.designOverrides)
    ? element.designOverrides
    : {};
  const textStyle = isPlainObject(designOverrides.textStyle)
    ? designOverrides.textStyle
    : {};
  return textStyle.align === "left" ||
    textStyle.align === "center" ||
    textStyle.align === "right"
    ? textStyle.align
    : undefined;
}

function pageNumberPlacement(
  layout: LayoutBox,
): "bottom-left" | "bottom-center" | "bottom-right" {
  if (layout.frame.x < 25) return "bottom-left";
  if (layout.frame.x > 60) return "bottom-right";
  return "bottom-center";
}

function watermarkSize(
  element: Record<string, unknown>,
): "small" | "medium" | "large" {
  const designOverrides = isPlainObject(element.designOverrides)
    ? element.designOverrides
    : {};
  const textStyle = isPlainObject(designOverrides.textStyle)
    ? designOverrides.textStyle
    : {};
  const fontSize = finiteNumber(textStyle.fontSize, 10);
  if (fontSize <= 8) return "small";
  if (fontSize >= 12) return "large";
  return "medium";
}

function migrateLegacyMasterChrome(
  raw: Record<string, unknown>,
  images: Record<string, ImageAsset>,
  usedAssetIds: Set<string>,
  recordIdentity: (
    kind: MigrationIdentityKind,
    assignment: IdAssignment,
  ) => void,
): { chrome?: DeckChromeConfig; unsupportedCount: number } {
  const elements = legacyMasterElements(raw);
  if (elements.length === 0) return { unsupportedCount: 0 };

  const chrome: DeckChromeConfig = {};
  let unsupportedCount = 0;

  for (const element of elements) {
    const kind = legacyChromeKind(element);
    if (!kind) {
      if (element.masterChromeKind !== undefined) unsupportedCount += 1;
      continue;
    }
    const content = isPlainObject(element.content) ? element.content : {};
    const layout = layoutFromElement(element, kind === "watermark" ? -20 : 900);
    const enabled = element.hidden !== true;

    if (kind === "logo") {
      const assetId = imageAssetId(
        content,
        typeof element.id === "string" ? element.id : "master-logo",
        images,
        usedAssetIds,
        recordIdentity,
      );
      if (!assetId) {
        unsupportedCount += 1;
        continue;
      }
      chrome.logo = {
        enabled,
        assetId,
        alt: typeof content.alt === "string" ? content.alt : "Logo",
        layout,
      };
      continue;
    }

    if (kind === "footer") {
      chrome.footer = {
        enabled,
        text: legacyText(element),
        align: legacyTextAlign(element) ?? "center",
        layout,
      };
      continue;
    }

    if (kind === "pageNumber") {
      const text = legacyText(element);
      chrome.pageNumber = {
        enabled,
        format: text.includes("{{pageCount}}") ? "number-total" : "number",
        placement: pageNumberPlacement(layout),
        layout,
      };
      continue;
    }

    chrome.watermark = {
      enabled,
      text: legacyText(element),
      opacity: finiteNumber(element.opacity, 0.18),
      layoutMode: typeof element.rotation === "number" ? "diagonal" : "center",
      size: watermarkSize(element),
      layout,
    };
  }

  return {
    chrome: Object.keys(chrome).length > 0 ? chrome : undefined,
    unsupportedCount,
  };
}

function remapConnectorEndpoint(
  endpoint: ConnectorEndpoint,
  recorder: MigrationRecorder,
  slideId: string,
  nodeId: string,
  fallbackPoint: { x: number; y: number },
): ConnectorEndpoint {
  if (endpoint.kind !== "node") return endpoint;
  const mapped = recorder.nodes[endpoint.nodeId];
  if (mapped) {
    return { ...endpoint, nodeId: mapped };
  }
  recorder.unmapped.push({
    kind: "connector-endpoint",
    from: endpoint.nodeId,
    reason: "No migrated node exists for this connector endpoint.",
    slideId,
    nodeId,
  });
  return { kind: "point", point: fallbackPoint };
}

function remapNodeReferences(
  node: SlideChildNode,
  recorder: MigrationRecorder,
  slideId: string,
): SlideChildNode {
  if (node.source?.blockId) {
    recorder.sources[node.source.blockId] = node.source.blockId;
  }
  if (node.type === "connector") {
    return {
      ...node,
      content: {
        ...node.content,
        from: remapConnectorEndpoint(
          node.content.from,
          recorder,
          slideId,
          node.id,
          { x: 0, y: 50 },
        ),
        to: remapConnectorEndpoint(
          node.content.to,
          recorder,
          slideId,
          node.id,
          { x: 100, y: 50 },
        ),
      },
    };
  }
  if (node.type === "group") {
    return {
      ...node,
      children: node.children.map((child) =>
        remapNodeReferences(child, recorder, slideId),
      ),
    };
  }
  return node;
}

export function looksLikeLegacyDeckV6(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (raw.schemaVersion === 6) return true;
  return (
    Array.isArray(raw.slides) &&
    raw.slides.some(
      (slide) => isPlainObject(slide) && Array.isArray(slide.elements),
    )
  );
}

export function migrateLegacyDeckV6(raw: unknown): MigrationResult {
  if (!looksLikeLegacyDeckV6(raw) || !isPlainObject(raw)) {
    return {
      ok: false,
      error: "Deck JSON is not a legacy v6 deck.",
      diagnostics: [],
    };
  }

  if (!Array.isArray(raw.slides) || raw.slides.length === 0) {
    return {
      ok: false,
      error: "Legacy v6 deck has no slides to migrate.",
      diagnostics: [
        makeDiagnostic(
          "invalid-schema-version",
          "fatal",
          "Legacy v6 deck has no slides to migrate.",
          { path: "slides" },
        ),
      ],
    };
  }

  const usedIds = new Set<string>();
  const usedDeckIds = new Set<string>();
  const usedAssetIds = new Set<string>();
  const images: Record<string, ImageAsset> = {};
  const recorder: MigrationRecorder = {
    decks: {},
    slides: {},
    nodes: {},
    assets: {},
    themes: {},
    sources: {},
    rewrites: [],
    dropped: [],
    unmapped: [],
  };

  const recordIdentity = (
    kind: MigrationIdentityKind,
    assignment: IdAssignment,
  ): void => {
    if (assignment.original === null) return;
    const target =
      kind === "deck"
        ? recorder.decks
        : kind === "slide"
          ? recorder.slides
          : kind === "node"
            ? recorder.nodes
            : kind === "asset"
              ? recorder.assets
              : recorder.themes;
    if (target[assignment.original] === undefined) {
      target[assignment.original] = assignment.id;
    }
    if (assignment.renamed) {
      recorder.rewrites.push({
        kind,
        from: assignment.original,
        to: assignment.id,
        reason: rewriteReason(assignment),
      });
    }
  };

  const deckAssignment =
    typeof raw.id === "string" && raw.id.length > 0
      ? assignId(raw.id, "deck-1", usedDeckIds)
      : null;
  if (deckAssignment) {
    recordIdentity("deck", deckAssignment);
  }
  const legacyTheme = themeFromLegacy(raw);
  if (legacyTheme.original !== null) {
    recorder.themes[legacyTheme.original] = legacyTheme.theme.packageId;
    if (legacyTheme.renamed) {
      recorder.rewrites.push({
        kind: "theme",
        from: legacyTheme.original,
        to: legacyTheme.theme.packageId,
        reason: "theme-package-remapped",
      });
    }
  }
  const legacyChrome = migrateLegacyMasterChrome(
    raw,
    images,
    usedAssetIds,
    recordIdentity,
  );

  const migratedSlides: SlideNode[] = raw.slides
    .filter(isPlainObject)
    .map((slide, slideIndex) => {
      const slideAssignment = assignId(
        slide.id,
        `slide-${slideIndex + 1}`,
        usedIds,
      );
      const id = slideAssignment.id;
      recordIdentity("slide", slideAssignment);
      const templateKind = templateKindForSlide(slide, slideIndex);
      const children: SlideChildNode[] = Array.isArray(slide.elements)
        ? slide.elements.flatMap((element, elementIndex) => {
            const migrated = migrateElement(
              element,
              elementIndex,
              id,
              usedIds,
              usedAssetIds,
              images,
              recorder,
              recordIdentity,
            );
            if (migrated.ok) {
              recordIdentity("node", migrated.assignment);
              return [migrated.node];
            }
            const original = migrated.assignment?.original ?? null;
            if (original !== null) {
              recorder.dropped.push({
                from: original,
                reason: migrated.reason,
                slideId: id,
                kind: "node",
              });
            }
            return [];
          })
        : [];
      return {
        id,
        type: "slide",
        ...(typeof slide.title === "string" ? { name: slide.title } : {}),
        template: { kind: templateKind },
        style: { ref: slideStyleRef(templateKind) },
        children,
        ...(typeof slide.notes === "string" ? { notes: slide.notes } : {}),
      };
    });

  const deck: DeckV7 = {
    schemaVersion: 7,
    ...(deckAssignment ? { id: deckAssignment.id } : {}),
    canvas: canvasFromLegacy(raw),
    theme: legacyTheme.theme,
    ...(legacyChrome.chrome ? { chrome: legacyChrome.chrome } : {}),
    assets: { images },
    slides: migratedSlides.map((slide) => ({
      ...slide,
      children: slide.children.map((node) =>
        remapNodeReferences(node, recorder, slide.id),
      ),
    })),
    ...(typeof raw.deckContentHash === "string"
      ? { metadata: { contentHash: raw.deckContentHash } }
      : {}),
  };

  const parsed = safeParseDeckV7(deck);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Migrated v6 deck failed v7 validation: ${parsed.errors.join("; ")}`,
      errors: parsed.errors,
      diagnostics: [
        makeDiagnostic(
          "invalid-schema-version",
          "fatal",
          "Legacy v6 deck could not be migrated to a valid DeckV7.",
          { details: { errors: parsed.errors } },
        ),
      ],
    };
  }

  const diagnostics: PresentationDiagnostic[] = [
    makeDiagnostic(
      "migration-repair-applied",
      "info",
      "Legacy v6 deck was migrated to DeckV7 for editing.",
    ),
  ];

  if (recorder.rewrites.length > 0) {
    diagnostics.push(
      makeDiagnostic(
        "migration-id-rewrite",
        "info",
        `${recorder.rewrites.length} identifier(s) were rewritten during migration; an old→new id map was emitted for anchor remapping.`,
        {
          details: {
            rewrites: recorder.rewrites.map(({ kind, from, to, reason }) => ({
              kind,
              from,
              to,
              reason,
            })),
          },
        },
      ),
    );
  }

  if (legacyChrome.chrome) {
    diagnostics.push(
      makeDiagnostic(
        "migration-repair-applied",
        "info",
        "Legacy v6 master chrome was migrated to DeckV7 chrome.",
      ),
    );
  }

  if (legacyChrome.unsupportedCount > 0) {
    diagnostics.push(
      makeDiagnostic(
        "unsupported-export-feature",
        "warning",
        `${legacyChrome.unsupportedCount} legacy master chrome item(s) could not be migrated to v7 deck chrome.`,
        { path: "masters" },
      ),
    );
  }

  for (const drop of recorder.dropped) {
    diagnostics.push(
      makeDiagnostic(
        "migration-dropped-node",
        "warning",
        `Element "${drop.from}" was dropped during migration: ${drop.reason}`,
        {
          path: `slides.${drop.slideId}`,
          details: { from: drop.from, kind: drop.kind },
        },
      ),
    );
  }

  for (const unmapped of recorder.unmapped) {
    const isSourceRef = unmapped.kind === "source-ref";
    diagnostics.push(
      makeDiagnostic(
        isSourceRef
          ? "migration-unmapped-source-ref"
          : "migration-unmapped-reference",
        "warning",
        isSourceRef
          ? `Source metadata on "${unmapped.nodeId}" could not be migrated: ${unmapped.reason}`
          : `Connector "${unmapped.nodeId}" references "${unmapped.from}", which was not migrated.`,
        {
          path: `slides.${unmapped.slideId}.nodes.${unmapped.nodeId}`,
          details: {
            from: unmapped.from,
            kind: unmapped.kind,
            reason: unmapped.reason,
          },
        },
      ),
    );
  }

  return {
    ok: true,
    deck: parsed.data,
    diagnostics,
    idMap: {
      decks: recorder.decks,
      slides: recorder.slides,
      nodes: recorder.nodes,
      assets: recorder.assets,
      themes: recorder.themes,
      sources: recorder.sources,
      rewrites: recorder.rewrites,
      dropped: recorder.dropped,
      unmapped: recorder.unmapped,
    },
  };
}
