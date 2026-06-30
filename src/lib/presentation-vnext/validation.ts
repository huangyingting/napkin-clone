/**
 * Safe parse / validation for v7 deck JSON.
 *
 * `safeParseDeckV7` is the public entry point. It accepts only structurally
 * valid v7 decks and returns typed errors for anything else.
 *
 * Repair is NOT done here. Repair happens only at import, migration, paste, and
 * AI-plan boundaries before the value is saved.
 */

import type { DeckV7 } from "./schema";
import { DECK_SCHEMA_VERSION_V7 } from "./schema";
import { isValidId, isFiniteNumber, isPositiveFinite } from "./ids";
import { isStyleRef } from "./style-registry";
import { SEMANTIC_TEMPLATE_KINDS } from "./template-registry";

// ---------------------------------------------------------------------------
// Public parse result
// ---------------------------------------------------------------------------

export type DeckV7ParseResult =
  | { success: true; data: DeckV7 }
  | { success: false; errors: string[] };

/** Validates and parses an unknown value as a v7 deck. Does not mutate input. */
export function safeParseDeckV7(input: unknown): DeckV7ParseResult {
  const errors: string[] = [];
  try {
    const deck = validateDeckV7(input, errors);
    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, data: deck as DeckV7 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { success: false, errors: [...errors, msg] };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(errors: string[], msg: string): void {
  errors.push(msg);
}

function validateId(
  value: unknown,
  ctx: string,
  errors: string[],
): string | undefined {
  if (!isValidId(value)) {
    fail(errors, `${ctx} must be a valid id (non-empty ASCII, max 128 chars)`);
    return undefined;
  }
  return value as string;
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const CANVAS_FORMATS = ["16:9", "4:3", "square", "custom"] as const;

function validateCanvas(
  input: unknown,
  ctx: string,
  errors: string[],
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return {};
  }
  const allowed = new Set(["format", "width", "height", "unit", "safeArea"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      fail(errors, `${ctx}.${key} is not a known canvas field`);
    }
  }
  if (
    !CANVAS_FORMATS.includes(input.format as (typeof CANVAS_FORMATS)[number])
  ) {
    fail(errors, `${ctx}.format must be one of: ${CANVAS_FORMATS.join(", ")}`);
  }
  if (!isPositiveFinite(input.width)) {
    fail(errors, `${ctx}.width must be a positive number`);
  }
  if (!isPositiveFinite(input.height)) {
    fail(errors, `${ctx}.height must be a positive number`);
  }
  if (input.unit !== "percent") {
    fail(errors, `${ctx}.unit must be "percent"`);
  }
  return input;
}

// ---------------------------------------------------------------------------
// Asset registry
// ---------------------------------------------------------------------------

function validateAssetRegistry(
  input: unknown,
  ctx: string,
  errors: string[],
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return { images: {} };
  }
  if (!isPlainObject(input.images)) {
    fail(errors, `${ctx}.images must be an object`);
  }
  return input;
}

// ---------------------------------------------------------------------------
// Layout box
// ---------------------------------------------------------------------------

function validateFrame(
  input: unknown,
  ctx: string,
  errors: string[],
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return {};
  }
  for (const key of ["x", "y", "w", "h"] as const) {
    if (!isFiniteNumber(input[key])) {
      fail(errors, `${ctx}.${key} must be a finite number`);
    }
  }
  if (
    typeof input.w === "number" &&
    typeof input.h === "number" &&
    (input.w <= 0 || input.h <= 0)
  ) {
    fail(errors, `${ctx}: w and h must be greater than 0`);
  }
  return input;
}

function validateLayoutBox(
  input: unknown,
  ctx: string,
  errors: string[],
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return {};
  }
  const allowed = new Set([
    "frame",
    "rotation",
    "zIndex",
    "autoHeight",
    "flipX",
    "flipY",
    "anchor",
    "constraints",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      fail(errors, `${ctx}.${key} is not a known layout field`);
    }
  }
  validateFrame(input.frame, `${ctx}.frame`, errors);
  if (!Number.isInteger(input.zIndex) || typeof input.zIndex !== "number") {
    fail(errors, `${ctx}.zIndex must be an integer`);
  }
  if (input.rotation !== undefined && !isFiniteNumber(input.rotation)) {
    fail(errors, `${ctx}.rotation must be a finite number`);
  }
  if (input.autoHeight !== undefined && typeof input.autoHeight !== "boolean") {
    fail(errors, `${ctx}.autoHeight must be a boolean`);
  }
  if (input.flipX !== undefined && typeof input.flipX !== "boolean") {
    fail(errors, `${ctx}.flipX must be a boolean`);
  }
  if (input.flipY !== undefined && typeof input.flipY !== "boolean") {
    fail(errors, `${ctx}.flipY must be a boolean`);
  }
  if (
    input.anchor !== undefined &&
    input.anchor !== "topLeft" &&
    input.anchor !== "center"
  ) {
    fail(errors, `${ctx}.anchor must be topLeft or center`);
  }
  if (input.constraints !== undefined) {
    validateLayoutConstraints(input.constraints, `${ctx}.constraints`, errors);
  }
  return input;
}

function validateLayoutConstraints(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  const allowed = new Set([
    "minW",
    "minH",
    "maxW",
    "maxH",
    "preserveAspectRatio",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      fail(errors, `${ctx}.${key} is not a known constraints field`);
    }
  }
  for (const key of ["minW", "minH", "maxW", "maxH"] as const) {
    if (input[key] !== undefined && !isFiniteNumber(input[key])) {
      fail(errors, `${ctx}.${key} must be a finite number`);
    }
  }
  if (
    input.preserveAspectRatio !== undefined &&
    typeof input.preserveAspectRatio !== "boolean"
  ) {
    fail(errors, `${ctx}.preserveAspectRatio must be a boolean`);
  }
}

// ---------------------------------------------------------------------------
// Deck chrome
// ---------------------------------------------------------------------------

const DECK_CHROME_KINDS = [
  "logo",
  "footer",
  "pageNumber",
  "watermark",
  "border",
  "safeArea",
] as const;

function validateStylePatch(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (input !== undefined && !isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
  }
}

function validateInsetsPct(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  for (const key of ["top", "right", "bottom", "left"] as const) {
    if (!isFiniteNumber(input[key])) {
      fail(errors, `${ctx}.${key} must be a finite number`);
    }
  }
}

function validateChromeItem(
  input: unknown,
  ctx: string,
  errors: string[],
  allowedSpecificKeys: readonly string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  const allowed = new Set([
    "enabled",
    "layout",
    "style",
    "layer",
    ...allowedSpecificKeys,
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      fail(errors, `${ctx}.${key} is not a known chrome field`);
    }
  }
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    fail(errors, `${ctx}.enabled must be a boolean`);
  }
  if (
    input.layer !== undefined &&
    input.layer !== "background" &&
    input.layer !== "foreground"
  ) {
    fail(errors, `${ctx}.layer must be background or foreground`);
  }
  if (input.layout !== undefined) {
    validateLayoutBox(input.layout, `${ctx}.layout`, errors);
  }
  validateStylePatch(input.style, `${ctx}.style`, errors);
}

function validateEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  ctx: string,
  errors: string[],
): void {
  if (value !== undefined && !allowed.includes(value as T)) {
    fail(errors, `${ctx} must be one of: ${allowed.join(", ")}`);
  }
}

function validateOptionalString(
  value: unknown,
  ctx: string,
  errors: string[],
): void {
  if (value !== undefined && typeof value !== "string") {
    fail(errors, `${ctx} must be a string`);
  }
}

function validateOptionalFiniteNumber(
  value: unknown,
  ctx: string,
  errors: string[],
): void {
  if (value !== undefined && !isFiniteNumber(value)) {
    fail(errors, `${ctx} must be a finite number`);
  }
}

export function validateDeckChromeConfig(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (input === undefined) return;
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  for (const key of Object.keys(input)) {
    if (
      !DECK_CHROME_KINDS.includes(key as (typeof DECK_CHROME_KINDS)[number])
    ) {
      fail(errors, `${ctx}.${key} is not a known chrome slot`);
    }
  }
  if (input.logo !== undefined) {
    validateChromeItem(input.logo, `${ctx}.logo`, errors, [
      "assetId",
      "alt",
      "placement",
      "size",
    ]);
    if (isPlainObject(input.logo)) {
      validateOptionalString(input.logo.assetId, `${ctx}.logo.assetId`, errors);
      validateOptionalString(input.logo.alt, `${ctx}.logo.alt`, errors);
      validateEnumValue(
        input.logo.placement,
        ["top-left", "top-right", "bottom-left", "bottom-right"],
        `${ctx}.logo.placement`,
        errors,
      );
      validateEnumValue(
        input.logo.size,
        ["small", "medium", "large"],
        `${ctx}.logo.size`,
        errors,
      );
    }
  }
  if (input.footer !== undefined) {
    validateChromeItem(input.footer, `${ctx}.footer`, errors, [
      "text",
      "align",
    ]);
    if (isPlainObject(input.footer)) {
      validateOptionalString(input.footer.text, `${ctx}.footer.text`, errors);
      validateEnumValue(
        input.footer.align,
        ["left", "center", "right"],
        `${ctx}.footer.align`,
        errors,
      );
    }
  }
  if (input.pageNumber !== undefined) {
    validateChromeItem(input.pageNumber, `${ctx}.pageNumber`, errors, [
      "format",
      "placement",
    ]);
    if (isPlainObject(input.pageNumber)) {
      validateEnumValue(
        input.pageNumber.format,
        ["number", "number-total"],
        `${ctx}.pageNumber.format`,
        errors,
      );
      validateEnumValue(
        input.pageNumber.placement,
        ["bottom-left", "bottom-center", "bottom-right"],
        `${ctx}.pageNumber.placement`,
        errors,
      );
    }
  }
  if (input.watermark !== undefined) {
    validateChromeItem(input.watermark, `${ctx}.watermark`, errors, [
      "text",
      "opacity",
      "layoutMode",
      "size",
    ]);
    if (isPlainObject(input.watermark)) {
      validateOptionalString(
        input.watermark.text,
        `${ctx}.watermark.text`,
        errors,
      );
      validateOptionalFiniteNumber(
        input.watermark.opacity,
        `${ctx}.watermark.opacity`,
        errors,
      );
      validateEnumValue(
        input.watermark.layoutMode,
        ["center", "diagonal"],
        `${ctx}.watermark.layoutMode`,
        errors,
      );
      validateEnumValue(
        input.watermark.size,
        ["small", "medium", "large"],
        `${ctx}.watermark.size`,
        errors,
      );
    }
  }
  if (input.border !== undefined) {
    validateChromeItem(input.border, `${ctx}.border`, errors, [
      "color",
      "widthPt",
    ]);
    if (isPlainObject(input.border)) {
      validateOptionalString(input.border.color, `${ctx}.border.color`, errors);
      validateOptionalFiniteNumber(
        input.border.widthPt,
        `${ctx}.border.widthPt`,
        errors,
      );
    }
  }
  if (input.safeArea !== undefined) {
    validateChromeItem(input.safeArea, `${ctx}.safeArea`, errors, [
      "insets",
      "color",
      "widthPt",
    ]);
    if (isPlainObject(input.safeArea)) {
      validateOptionalString(
        input.safeArea.color,
        `${ctx}.safeArea.color`,
        errors,
      );
      validateOptionalFiniteNumber(
        input.safeArea.widthPt,
        `${ctx}.safeArea.widthPt`,
        errors,
      );
      if (input.safeArea.insets !== undefined) {
        validateInsetsPct(
          input.safeArea.insets,
          `${ctx}.safeArea.insets`,
          errors,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Style binding
// ---------------------------------------------------------------------------

function validateStyleBinding(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  if (!isStyleRef(input.ref)) {
    fail(errors, `${ctx}.ref must be a registered StyleRef`);
  }
}

// ---------------------------------------------------------------------------
// Text content
// ---------------------------------------------------------------------------

function validateTextContent(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  if (!Array.isArray(input.paragraphs)) {
    fail(errors, `${ctx}.paragraphs must be an array`);
    return;
  }
  for (let i = 0; i < input.paragraphs.length; i++) {
    const para = input.paragraphs[i];
    const pCtx = `${ctx}.paragraphs[${i}]`;
    if (!isPlainObject(para)) {
      fail(errors, `${pCtx} must be an object`);
      continue;
    }
    if (typeof para.id !== "string" || para.id.length === 0) {
      fail(errors, `${pCtx}.id must be a non-empty string`);
    }
    if (typeof para.text !== "string") {
      fail(errors, `${pCtx}.text must be a string`);
    }
    // Validate runs concatenate to paragraph text
    if (Array.isArray(para.runs) && typeof para.text === "string") {
      const joined = (para.runs as unknown[])
        .map((r) => (isPlainObject(r) ? (r.text ?? "") : ""))
        .join("");
      if (joined !== para.text) {
        fail(
          errors,
          `${pCtx}: runs text "${joined}" does not equal paragraph text "${para.text}"`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Table content
// ---------------------------------------------------------------------------

function validateTableContent(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  if (!Array.isArray(input.columns)) {
    fail(errors, `${ctx}.columns must be an array`);
    return;
  }
  if (!Array.isArray(input.rows)) {
    fail(errors, `${ctx}.rows must be an array`);
    return;
  }
  const colCount = input.columns.length;
  if (colCount < 1 || colCount > 8) {
    fail(errors, `${ctx}: columns count must be 1..8`);
  }
  if (input.rows.length < 1 || input.rows.length > 20) {
    fail(errors, `${ctx}: rows count must be 1..20`);
  }
  const colIds = new Set<string>();
  for (let ci = 0; ci < input.columns.length; ci++) {
    const col = input.columns[ci];
    if (!isPlainObject(col)) continue;
    if (typeof col.id !== "string" || colIds.has(col.id)) {
      fail(errors, `${ctx}.columns[${ci}].id must be unique and non-empty`);
    }
    colIds.add(col.id as string);
  }
  const rowIds = new Set<string>();
  for (let ri = 0; ri < input.rows.length; ri++) {
    const row = input.rows[ri];
    if (!isPlainObject(row)) continue;
    if (typeof row.id !== "string" || rowIds.has(row.id)) {
      fail(errors, `${ctx}.rows[${ri}].id must be unique and non-empty`);
    }
    rowIds.add(row.id as string);
    if (!Array.isArray(row.cells) || row.cells.length !== colCount) {
      fail(errors, `${ctx}.rows[${ri}]: must have exactly ${colCount} cells`);
    }
  }
}

// ---------------------------------------------------------------------------
// Connector content
// ---------------------------------------------------------------------------

function validateConnectorEndpoint(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  if (input.kind !== "point" && input.kind !== "node") {
    fail(errors, `${ctx}.kind must be "point" or "node"`);
  }
}

// ---------------------------------------------------------------------------
// Child node
// ---------------------------------------------------------------------------

const SHAPE_KINDS = [
  "rect",
  "ellipse",
  "line",
  "triangle",
  "diamond",
  "circle",
  "square",
  "path",
] as const;
const GROUP_COMPONENT_KINDS = [
  "metricCard",
  "quoteBlock",
  "timeline",
  "comparisonGrid",
  "cardGrid",
  "custom",
] as const;
const SEMANTIC_ROLES = [
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
] as const;

const SOURCE_BLOCK_KINDS = ["text", "visual", "table", "image"] as const;
const SOURCE_REFRESH_STATES = [
  "fresh",
  "stale",
  "orphan",
  "unlinked",
  "unknown",
] as const;

function validateStringField(
  value: unknown,
  ctx: string,
  errors: string[],
): void {
  if (value !== undefined && typeof value !== "string") {
    fail(errors, `${ctx} must be a string`);
  }
}

function validateSourceMetadata(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }

  const allowed = new Set([
    "documentId",
    "blockId",
    "blockKind",
    "contentHash",
    "blockRevision",
    "linkedAt",
    "display",
    "refresh",
    "unlinked",
    "extra",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      fail(errors, `${ctx}.${key} is not a known source field`);
    }
  }

  validateStringField(input.documentId, `${ctx}.documentId`, errors);
  validateStringField(input.blockId, `${ctx}.blockId`, errors);
  validateStringField(input.contentHash, `${ctx}.contentHash`, errors);
  validateStringField(input.blockRevision, `${ctx}.blockRevision`, errors);
  validateStringField(input.linkedAt, `${ctx}.linkedAt`, errors);
  if (
    input.blockKind !== undefined &&
    !SOURCE_BLOCK_KINDS.includes(
      input.blockKind as (typeof SOURCE_BLOCK_KINDS)[number],
    )
  ) {
    fail(
      errors,
      `${ctx}.blockKind must be one of: ${SOURCE_BLOCK_KINDS.join(", ")}`,
    );
  }
  if (input.unlinked !== undefined && typeof input.unlinked !== "boolean") {
    fail(errors, `${ctx}.unlinked must be a boolean`);
  }

  if (input.display !== undefined) {
    if (!isPlainObject(input.display)) {
      fail(errors, `${ctx}.display must be an object`);
    } else {
      const displayAllowed = new Set([
        "documentTitle",
        "blockLabel",
        "blockKindLabel",
      ]);
      for (const key of Object.keys(input.display)) {
        if (!displayAllowed.has(key)) {
          fail(errors, `${ctx}.display.${key} is not a known display field`);
        }
      }
      validateStringField(
        input.display.documentTitle,
        `${ctx}.display.documentTitle`,
        errors,
      );
      validateStringField(
        input.display.blockLabel,
        `${ctx}.display.blockLabel`,
        errors,
      );
      validateStringField(
        input.display.blockKindLabel,
        `${ctx}.display.blockKindLabel`,
        errors,
      );
    }
  }

  if (input.refresh !== undefined) {
    if (!isPlainObject(input.refresh)) {
      fail(errors, `${ctx}.refresh must be an object`);
    } else {
      const refreshAllowed = new Set([
        "state",
        "checkedAt",
        "refreshedAt",
        "sourceHash",
        "reason",
      ]);
      for (const key of Object.keys(input.refresh)) {
        if (!refreshAllowed.has(key)) {
          fail(errors, `${ctx}.refresh.${key} is not a known refresh field`);
        }
      }
      if (
        !SOURCE_REFRESH_STATES.includes(
          input.refresh.state as (typeof SOURCE_REFRESH_STATES)[number],
        )
      ) {
        fail(
          errors,
          `${ctx}.refresh.state must be one of: ${SOURCE_REFRESH_STATES.join(", ")}`,
        );
      }
      validateStringField(
        input.refresh.checkedAt,
        `${ctx}.refresh.checkedAt`,
        errors,
      );
      validateStringField(
        input.refresh.refreshedAt,
        `${ctx}.refresh.refreshedAt`,
        errors,
      );
      validateStringField(
        input.refresh.sourceHash,
        `${ctx}.refresh.sourceHash`,
        errors,
      );
      validateStringField(
        input.refresh.reason,
        `${ctx}.refresh.reason`,
        errors,
      );
    }
  }

  if (input.extra !== undefined && !isPlainObject(input.extra)) {
    fail(errors, `${ctx}.extra must be an object`);
  }
}

function validateChildNode(
  input: unknown,
  ctx: string,
  errors: string[],
  nodeIds: Set<string>,
  depth: number = 0,
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }

  const id = validateId(input.id, `${ctx}.id`, errors);
  if (id !== undefined) {
    if (nodeIds.has(id)) {
      fail(errors, `${ctx}.id "${id}" is duplicated`);
    } else {
      nodeIds.add(id);
    }
  }

  if (
    input.role !== undefined &&
    !SEMANTIC_ROLES.includes(input.role as (typeof SEMANTIC_ROLES)[number])
  ) {
    fail(errors, `${ctx}.role is not a known semantic role`);
  }

  if (input.layout !== undefined) {
    validateLayoutBox(input.layout, `${ctx}.layout`, errors);
  }

  if (input.source !== undefined) {
    validateSourceMetadata(input.source, `${ctx}.source`, errors);
  }

  if (input.style !== undefined) {
    validateStyleBinding(input.style, `${ctx}.style`, errors);
  }

  const type = input.type;
  if (typeof type !== "string") {
    fail(errors, `${ctx}.type must be a string`);
    return;
  }

  switch (type) {
    case "text":
      validateTextContent(input.content, `${ctx}.content`, errors);
      break;
    case "image":
      if (!isPlainObject(input.content)) {
        fail(errors, `${ctx}.content must be an object`);
      } else if (
        typeof input.content.assetId !== "string" ||
        input.content.assetId.length === 0
      ) {
        fail(errors, `${ctx}.content.assetId must be a non-empty string`);
      }
      break;
    case "shape": {
      if (!isPlainObject(input.content)) {
        fail(errors, `${ctx}.content must be an object`);
      } else {
        if (
          !SHAPE_KINDS.includes(
            input.content.shape as (typeof SHAPE_KINDS)[number],
          )
        ) {
          fail(
            errors,
            `${ctx}.content.shape must be one of: ${SHAPE_KINDS.join(", ")}`,
          );
        }
        if (
          input.content.shape === "path" &&
          (typeof input.content.path !== "string" ||
            input.content.path.length === 0)
        ) {
          fail(errors, `${ctx}.content.path is required when shape is "path"`);
        }
        if (input.content.text !== undefined) {
          validateTextContent(
            input.content.text,
            `${ctx}.content.text`,
            errors,
          );
        }
      }
      break;
    }
    case "connector": {
      if (!isPlainObject(input.content)) {
        fail(errors, `${ctx}.content must be an object`);
      } else {
        validateConnectorEndpoint(
          input.content.from,
          `${ctx}.content.from`,
          errors,
        );
        validateConnectorEndpoint(
          input.content.to,
          `${ctx}.content.to`,
          errors,
        );
      }
      break;
    }
    case "table":
      validateTableContent(input.content, `${ctx}.content`, errors);
      break;
    case "visual":
      if (!isPlainObject(input.content)) {
        fail(errors, `${ctx}.content must be an object`);
      } else if (
        input.content.assetId === undefined &&
        input.content.visualId === undefined
      ) {
        fail(errors, `${ctx}.content must provide assetId or visualId`);
      }
      break;
    case "group": {
      if (depth >= 4) {
        fail(errors, `${ctx}: groups may not be nested beyond depth 4`);
      }
      if (
        !GROUP_COMPONENT_KINDS.includes(
          input.component as (typeof GROUP_COMPONENT_KINDS)[number],
        )
      ) {
        fail(
          errors,
          `${ctx}.component must be one of: ${GROUP_COMPONENT_KINDS.join(", ")}`,
        );
      }
      if (!Array.isArray(input.children) || input.children.length === 0) {
        fail(errors, `${ctx}.children must be a non-empty array`);
      } else {
        for (let i = 0; i < input.children.length; i++) {
          validateChildNode(
            input.children[i],
            `${ctx}.children[${i}]`,
            errors,
            nodeIds,
            depth + 1,
          );
        }
      }
      break;
    }
    default:
      fail(errors, `${ctx}.type "${type}" is not a known node type`);
  }
}

// ---------------------------------------------------------------------------
// Slide
// ---------------------------------------------------------------------------

const SLIDE_TONES = [
  "neutral",
  "confident",
  "warm",
  "urgent",
  "premium",
  "technical",
] as const;
const SLIDE_DENSITIES = ["airy", "normal", "dense"] as const;
const SLIDE_EMPHASIS = [
  "balanced",
  "title",
  "data",
  "visual",
  "quote",
  "action",
] as const;
const SLIDE_DECORATION_LEVELS = ["none", "subtle", "default", "expressive"];
const SLIDE_CHROME_LEVELS = ["default", "minimal", "none"];
const SLIDE_CHROME_OVERRIDE_MODES = [
  "inherit",
  "disabled",
  "detached",
  "override",
];

function validateSlideProps(
  input: unknown,
  ctx: string,
  errors: string[],
): void {
  if (input === undefined) return;
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  if (
    input.decoration !== undefined &&
    !SLIDE_DECORATION_LEVELS.includes(input.decoration as string)
  ) {
    fail(errors, `${ctx}.decoration is not a known decoration level`);
  }
  if (
    input.chrome !== undefined &&
    !SLIDE_CHROME_LEVELS.includes(input.chrome as string)
  ) {
    fail(errors, `${ctx}.chrome is not a known chrome level`);
  }
  if (input.deckChrome !== undefined) {
    if (!isPlainObject(input.deckChrome)) {
      fail(errors, `${ctx}.deckChrome must be an object`);
    } else {
      for (const [kind, override] of Object.entries(input.deckChrome)) {
        if (
          !DECK_CHROME_KINDS.includes(
            kind as (typeof DECK_CHROME_KINDS)[number],
          )
        ) {
          fail(errors, `${ctx}.deckChrome.${kind} is not a known chrome slot`);
          continue;
        }
        if (!isPlainObject(override)) {
          fail(errors, `${ctx}.deckChrome.${kind} must be an object`);
          continue;
        }
        if (!SLIDE_CHROME_OVERRIDE_MODES.includes(override.mode as string)) {
          fail(errors, `${ctx}.deckChrome.${kind}.mode is not supported`);
        }
        if (override.mode === "override") {
          if (!isPlainObject(override.value)) {
            fail(errors, `${ctx}.deckChrome.${kind}.value must be an object`);
          } else {
            validateDeckChromeConfig(
              { [kind]: override.value },
              `${ctx}.deckChrome.${kind}.value`,
              errors,
            );
          }
        }
      }
    }
  }
}

const SLIDE_V7_KEYS = new Set([
  "id",
  "name",
  "role",
  "slot",
  "layout",
  "style",
  "localStyle",
  "locked",
  "hidden",
  "accessibility",
  "source",
  "type",
  "template",
  "controls",
  "props",
  "children",
  "notes",
]);

function validateSlideNode(
  input: unknown,
  ctx: string,
  errors: string[],
  nodeIds: Set<string>,
): void {
  if (!isPlainObject(input)) {
    fail(errors, `${ctx} must be an object`);
    return;
  }
  for (const key of Object.keys(input)) {
    if (!SLIDE_V7_KEYS.has(key)) {
      fail(errors, `${ctx}.${key} is not part of the v7 slide schema`);
    }
  }
  if ("elements" in input) {
    fail(errors, `${ctx}.elements is a v6 field and not valid in a v7 slide`);
  }
  if (input.type !== "slide") {
    fail(errors, `${ctx}.type must be "slide"`);
  }
  const id = validateId(input.id, `${ctx}.id`, errors);
  if (id !== undefined) {
    if (nodeIds.has(id)) {
      fail(errors, `${ctx}.id "${id}" is duplicated`);
    } else {
      nodeIds.add(id);
    }
  }

  // Template binding
  if (!isPlainObject(input.template)) {
    fail(errors, `${ctx}.template must be an object`);
  } else {
    if (
      !SEMANTIC_TEMPLATE_KINDS.includes(
        input.template.kind as (typeof SEMANTIC_TEMPLATE_KINDS)[number],
      )
    ) {
      fail(
        errors,
        `${ctx}.template.kind "${input.template.kind}" is not a known template kind`,
      );
    }
  }

  // Controls (optional)
  if (isPlainObject(input.controls)) {
    const { tone, density, emphasis } = input.controls;
    if (
      tone !== undefined &&
      !SLIDE_TONES.includes(tone as (typeof SLIDE_TONES)[number])
    ) {
      fail(errors, `${ctx}.controls.tone is not a known tone`);
    }
    if (
      density !== undefined &&
      !SLIDE_DENSITIES.includes(density as (typeof SLIDE_DENSITIES)[number])
    ) {
      fail(errors, `${ctx}.controls.density is not a known density`);
    }
    if (
      emphasis !== undefined &&
      !SLIDE_EMPHASIS.includes(emphasis as (typeof SLIDE_EMPHASIS)[number])
    ) {
      fail(errors, `${ctx}.controls.emphasis is not a known emphasis`);
    }
  }

  validateSlideProps(input.props, `${ctx}.props`, errors);

  if (input.style !== undefined) {
    validateStyleBinding(input.style, `${ctx}.style`, errors);
  }

  if (input.source !== undefined) {
    validateSourceMetadata(input.source, `${ctx}.source`, errors);
  }

  if (!Array.isArray(input.children)) {
    fail(errors, `${ctx}.children must be an array`);
  } else {
    for (let i = 0; i < input.children.length; i++) {
      validateChildNode(
        input.children[i],
        `${ctx}.children[${i}]`,
        errors,
        nodeIds,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

const DECK_V7_KEYS = new Set([
  "schemaVersion",
  "id",
  "title",
  "canvas",
  "theme",
  "chrome",
  "assets",
  "slides",
  "metadata",
]);

function validateDeckV7(input: unknown, errors: string[]): Partial<DeckV7> {
  if (!isPlainObject(input)) {
    fail(errors, "Deck must be an object");
    return {};
  }

  // Reject unknown top-level keys
  for (const key of Object.keys(input)) {
    if (!DECK_V7_KEYS.has(key)) {
      fail(errors, `Deck.${key} is not part of the v7 schema`);
    }
  }

  // Check schemaVersion first
  if (input.schemaVersion !== DECK_SCHEMA_VERSION_V7) {
    if (
      typeof input.schemaVersion === "number" &&
      input.schemaVersion !== DECK_SCHEMA_VERSION_V7
    ) {
      fail(
        errors,
        `Deck.schemaVersion ${input.schemaVersion} is not v7 (expected ${DECK_SCHEMA_VERSION_V7})`,
      );
    } else {
      fail(errors, `Deck.schemaVersion must be ${DECK_SCHEMA_VERSION_V7}`);
    }
    // Fatal: stop further validation
    return {};
  }

  validateCanvas(input.canvas, "Deck.canvas", errors);
  validateAssetRegistry(input.assets, "Deck.assets", errors);

  if (!isPlainObject(input.theme)) {
    fail(errors, "Deck.theme must be an object");
  } else if (
    typeof input.theme.packageId !== "string" ||
    input.theme.packageId.length === 0
  ) {
    fail(errors, "Deck.theme.packageId must be a non-empty string");
  } else if (isPlainObject(input.theme.overrides)) {
    validateDeckChromeConfig(
      input.theme.overrides.chrome,
      "Deck.theme.overrides.chrome",
      errors,
    );
  }
  validateDeckChromeConfig(input.chrome, "Deck.chrome", errors);

  if (!Array.isArray(input.slides)) {
    fail(errors, "Deck.slides must be an array");
  } else if (input.slides.length === 0) {
    fail(errors, "Deck.slides must contain at least one slide");
  } else {
    const nodeIds = new Set<string>();
    for (let i = 0; i < input.slides.length; i++) {
      validateSlideNode(input.slides[i], `slides[${i}]`, errors, nodeIds);
    }
  }

  // Reject v6 fields
  for (const v6Key of [
    "elements",
    "masters",
    "customTemplates",
    "design",
    "defaultMasterId",
  ]) {
    if (v6Key in input) {
      fail(errors, `Deck.${v6Key} is a v6 field and not valid in a v7 deck`);
    }
  }

  return input as Partial<DeckV7>;
}
