import type {
  Paragraph,
  ConnectorAnchor,
  ConnectorArrow,
  ConnectorPoint,
  ConnectorRouting,
  ElementAlign,
  ElementBox,
  ShapeKind,
  SlideElement,
  TextElementStyle,
  TextFitMode,
  TextRun,
} from "../deck-elements";
import { isSlideFontId } from "../slide-fonts";
import {
  validateImageCrop,
  validateImageFitMode,
  validateImageMaskShape,
} from "./media";
import { validateSourceRef } from "./source-refs";
import {
  CONNECTOR_ANCHORS,
  CONNECTOR_ARROWS,
  CONNECTOR_ROUTINGS,
  DeckValidationError,
  ELEMENT_ALIGNS,
  SHAPE_KINDS,
  TEXT_FIT_MODES,
  VERTICAL_ALIGNS,
  type VerticalAlign,
  isHexColor,
  isPlainObject,
  validateFiniteNumber,
  validateOpacity,
} from "./shared";

const PRESENTATION_ROLES = [
  "title",
  "subtitle",
  "sectionTitle",
  "body",
  "bullet",
  "quote",
  "caption",
  "footer",
  "label",
  "media",
  "visual",
  "image",
  "logo",
  "pageNumber",
  "background",
] as const;

const COLOR_REF_TOKENS = [
  "slideBg",
  "surface",
  "accent",
  "onBg",
  "onSurface",
  "muted",
] as const;

const REMOVED_ELEMENT_FIELDS = [
  "alt",
  "arrowEnd",
  "arrowStart",
  "assetId",
  "bulletGap",
  "bulletIndent",
  "color",
  "crop",
  "dash",
  "fitMode",
  "groupId",
  "maskShape",
  "name",
  "opacity",
  "paragraphs",
  "radius",
  "rotation",
  "routing",
  "runs",
  "shadow",
  "shape",
  "src",
  "start",
  "stroke",
  "style",
  "styleOverride",
  "styleThemeId",
  "text",
  "textRole",
  "textRuns",
  "textStyle",
  "textStyleOverride",
  "visualId",
] as const;

function validatePresentationRole(input: unknown, context: string): string {
  if (
    typeof input !== "string" ||
    !(PRESENTATION_ROLES as readonly string[]).includes(input)
  ) {
    throw new DeckValidationError(
      `${context} must be one of: ${PRESENTATION_ROLES.join(", ")}`,
    );
  }
  return input;
}

function validateColorRef(
  input: unknown,
  context: string,
): { token: string } | { value: string } {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.token === "string") {
    if (!(COLOR_REF_TOKENS as readonly string[]).includes(input.token)) {
      throw new DeckValidationError(
        `${context}.token must be one of: ${COLOR_REF_TOKENS.join(", ")}`,
      );
    }
    return { token: input.token };
  }
  if (typeof input.value === "string" && input.value.length > 0) {
    return { value: input.value };
  }
  throw new DeckValidationError(
    `${context} must contain a token or non-empty value`,
  );
}

export function validateBackgroundDesign(
  input: unknown,
  context: string,
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (input.type === "solid") {
    return {
      type: "solid",
      color: validateColorRef(input.color, `${context}.color`),
    };
  }
  if (input.type === "gradient") {
    return {
      type: "gradient",
      from: validateColorRef(input.from, `${context}.from`),
      to: validateColorRef(input.to, `${context}.to`),
      ...(typeof input.angle === "number" && Number.isFinite(input.angle)
        ? { angle: input.angle }
        : {}),
    };
  }
  if (input.type === "image") {
    if (typeof input.url !== "string" || input.url.length === 0) {
      throw new DeckValidationError(
        `${context}.url must be a non-empty string`,
      );
    }
    if (
      input.assetId !== undefined &&
      (typeof input.assetId !== "string" || input.assetId.length === 0)
    ) {
      throw new DeckValidationError(
        `${context}.assetId must be a non-empty string`,
      );
    }
    return {
      type: "image",
      url: input.url,
      ...(typeof input.assetId === "string" && input.assetId.length > 0
        ? { assetId: input.assetId }
        : {}),
    };
  }
  throw new DeckValidationError(
    `${context}.type must be "solid", "gradient", or "image"`,
  );
}

function validateDesignOverrides(
  input: unknown,
  context: string,
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  const out: Record<string, unknown> = { ...input };
  if (input.background !== undefined) {
    out.background = validateBackgroundDesign(
      input.background,
      `${context}.background`,
    );
  }
  if (input.textStyle !== undefined) {
    out.textStyle = validatePartialTextStyle(
      input.textStyle,
      `${context}.textStyle`,
    );
  }
  if (input.fill !== undefined) {
    out.fill = validateColorRef(input.fill, `${context}.fill`);
  }
  if (input.stroke !== undefined) {
    if (!isPlainObject(input.stroke) || !isHexColor(input.stroke.color)) {
      throw new DeckValidationError(`${context}.stroke.color must be a hex color`);
    }
    out.stroke = {
      color: input.stroke.color,
      width: Math.max(
        0,
        validateFiniteNumber(input.stroke.width, `${context}.stroke.width`),
      ),
    };
  }
  if (input.radius !== undefined) {
    out.radius = Math.max(
      0,
      Math.min(50, validateFiniteNumber(input.radius, `${context}.radius`)),
    );
  }
  if (input.fitMode !== undefined) {
    out.fitMode = validateImageFitMode(input.fitMode, `${context}.fitMode`);
  }
  if (input.maskShape !== undefined) {
    out.maskShape = validateImageMaskShape(
      input.maskShape,
      `${context}.maskShape`,
    );
  }
  if (
    input.arrowStart !== undefined &&
    !CONNECTOR_ARROWS.includes(input.arrowStart as ConnectorArrow)
  ) {
    throw new DeckValidationError(
      `${context}.arrowStart must be one of: ${CONNECTOR_ARROWS.join(", ")}`,
    );
  }
  if (
    input.arrowEnd !== undefined &&
    !CONNECTOR_ARROWS.includes(input.arrowEnd as ConnectorArrow)
  ) {
    throw new DeckValidationError(
      `${context}.arrowEnd must be one of: ${CONNECTOR_ARROWS.join(", ")}`,
    );
  }
  if (input.opacity !== undefined) {
    out.opacity = validateOpacity(input.opacity, `${context}.opacity`);
  }
  if (input.dash !== undefined) out.dash = Boolean(input.dash);
  return out;
}

function validateElementSource(
  input: unknown,
  context: string,
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  return validateSourceRef(input, context) as unknown as Record<string, unknown>;
}

function rejectRemovedElementFields(
  input: Record<string, unknown>,
  context: string,
): void {
  for (const field of REMOVED_ELEMENT_FIELDS) {
    if (field in input) {
      throw new DeckValidationError(
        `${context}.${field} has moved to content or designOverrides`,
      );
    }
  }
  if (input.layoutSlot !== undefined) {
    throw new DeckValidationError(
      `${context}.layoutSlot is no longer supported`,
    );
  }
  if (input.sourceRef !== undefined) {
    throw new DeckValidationError(`${context}.sourceRef has moved to source`);
  }
}

function validateTextFitMode(
  value: unknown,
  context: string,
): TextFitMode | undefined {
  if (value === undefined) return undefined;
  if (!TEXT_FIT_MODES.includes(value as TextFitMode)) {
    throw new DeckValidationError(
      `${context} must be one of: ${TEXT_FIT_MODES.join(", ")}`,
    );
  }
  return value as TextFitMode;
}

function validateBox(input: unknown, context: string): ElementBox {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  return {
    x: validateFiniteNumber(input.x, `${context}.x`),
    y: validateFiniteNumber(input.y, `${context}.y`),
    w: validateFiniteNumber(input.w, `${context}.w`),
    h: validateFiniteNumber(input.h, `${context}.h`),
  };
}

function validateTextStyle(input: unknown, context: string): TextElementStyle {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (
    typeof input.align !== "string" ||
    !ELEMENT_ALIGNS.includes(input.align as ElementAlign)
  ) {
    throw new DeckValidationError(
      `${context}.align must be one of: ${ELEMENT_ALIGNS.join(", ")}`,
    );
  }
  if (input.color !== undefined && !isHexColor(input.color)) {
    throw new DeckValidationError(`${context}.color must be a hex color`);
  }
  if (
    input.verticalAlign !== undefined &&
    !VERTICAL_ALIGNS.includes(input.verticalAlign as VerticalAlign)
  ) {
    throw new DeckValidationError(
      `${context}.verticalAlign must be one of: ${VERTICAL_ALIGNS.join(", ")}`,
    );
  }
  if (
    input.lineHeight !== undefined &&
    (typeof input.lineHeight !== "number" || !Number.isFinite(input.lineHeight))
  ) {
    throw new DeckValidationError(
      `${context}.lineHeight must be a finite number`,
    );
  }
  if (
    input.paragraphSpacing !== undefined &&
    (typeof input.paragraphSpacing !== "number" ||
      !Number.isFinite(input.paragraphSpacing))
  ) {
    throw new DeckValidationError(
      `${context}.paragraphSpacing must be a finite number`,
    );
  }
  return {
    fontSize: validateFiniteNumber(input.fontSize, `${context}.fontSize`),
    bold: Boolean(input.bold),
    italic: Boolean(input.italic),
    align: input.align as ElementAlign,
    ...(input.underline !== undefined
      ? { underline: Boolean(input.underline) }
      : {}),
    ...(input.verticalAlign !== undefined
      ? { verticalAlign: input.verticalAlign as VerticalAlign }
      : {}),
    ...(input.lineHeight !== undefined
      ? { lineHeight: input.lineHeight as number }
      : {}),
    ...(input.paragraphSpacing !== undefined
      ? { paragraphSpacing: input.paragraphSpacing as number }
      : {}),
    ...(input.color !== undefined ? { color: input.color as string } : {}),
    ...(isSlideFontId(input.fontId) ? { fontId: input.fontId } : {}),
  };
}

/**
 * Validates a partial text-style override (#605). Unlike {@link validateTextStyle},
 * every field is optional — a present field is validated, an absent field means
 * "inherit from the resolved template/role style". Used for `styleOverride` and
 * shape `textStyleOverride`.
 */
function validatePartialTextStyle(
  input: unknown,
  context: string,
): Partial<TextElementStyle> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (
    input.align !== undefined &&
    !ELEMENT_ALIGNS.includes(input.align as ElementAlign)
  ) {
    throw new DeckValidationError(
      `${context}.align must be one of: ${ELEMENT_ALIGNS.join(", ")}`,
    );
  }
  if (input.color !== undefined && !isHexColor(input.color)) {
    throw new DeckValidationError(`${context}.color must be a hex color`);
  }
  if (
    input.verticalAlign !== undefined &&
    !VERTICAL_ALIGNS.includes(input.verticalAlign as VerticalAlign)
  ) {
    throw new DeckValidationError(
      `${context}.verticalAlign must be one of: ${VERTICAL_ALIGNS.join(", ")}`,
    );
  }
  const out: Partial<TextElementStyle> = {};
  if (input.fontSize !== undefined) {
    out.fontSize = validateFiniteNumber(input.fontSize, `${context}.fontSize`);
  }
  if (input.bold !== undefined) out.bold = Boolean(input.bold);
  if (input.italic !== undefined) out.italic = Boolean(input.italic);
  if (input.underline !== undefined) out.underline = Boolean(input.underline);
  if (input.align !== undefined) out.align = input.align as ElementAlign;
  if (input.verticalAlign !== undefined) {
    out.verticalAlign = input.verticalAlign as VerticalAlign;
  }
  if (input.lineHeight !== undefined) {
    out.lineHeight = validateFiniteNumber(
      input.lineHeight,
      `${context}.lineHeight`,
    );
  }
  if (input.paragraphSpacing !== undefined) {
    out.paragraphSpacing = validateFiniteNumber(
      input.paragraphSpacing,
      `${context}.paragraphSpacing`,
    );
  }
  if (input.color !== undefined) out.color = input.color as string;
  if (isSlideFontId(input.fontId)) {
    out.fontId = input.fontId;
  }
  return out;
}

function validateTextRun(input: unknown, context: string): TextRun {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.text !== "string") {
    throw new DeckValidationError(`${context}.text must be a string`);
  }
  if (input.color !== undefined && !isHexColor(input.color)) {
    throw new DeckValidationError(`${context}.color must be a hex color`);
  }
  if (input.link !== undefined && typeof input.link !== "string") {
    throw new DeckValidationError(`${context}.link must be a string`);
  }
  const run: TextRun = { text: input.text };
  if (input.bold !== undefined) run.bold = Boolean(input.bold);
  if (input.italic !== undefined) run.italic = Boolean(input.italic);
  if (input.underline !== undefined) run.underline = Boolean(input.underline);
  if (input.fontSize !== undefined) {
    run.fontSize = validateFiniteNumber(input.fontSize, `${context}.fontSize`);
  }
  if (input.code !== undefined) run.code = Boolean(input.code);
  if (input.color !== undefined) run.color = input.color as string;
  if (input.link !== undefined) run.link = input.link as string;
  return run;
}

function validateConnectorPoint(
  input: unknown,
  context: string,
): ConnectorPoint {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  // Distinguish bound endpoint (has elementId) from a free point (has x, y).
  if (input.elementId !== undefined) {
    if (typeof input.elementId !== "string" || input.elementId.length === 0) {
      throw new DeckValidationError(
        `${context}.elementId must be a non-empty string`,
      );
    }
    if (
      typeof input.anchor !== "string" ||
      !CONNECTOR_ANCHORS.includes(input.anchor as ConnectorAnchor)
    ) {
      throw new DeckValidationError(
        `${context}.anchor must be one of: ${CONNECTOR_ANCHORS.join(", ")}`,
      );
    }
    return {
      elementId: input.elementId,
      anchor: input.anchor as ConnectorAnchor,
    };
  }
  return {
    x: validateFiniteNumber(input.x, `${context}.x`),
    y: validateFiniteNumber(input.y, `${context}.y`),
  };
}

export function validateTextRuns(value: unknown, context: string): TextRun[] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((run, index) =>
    validateTextRun(run, `${context}[${index}]`),
  );
}

export function validateBulletRuns(
  value: unknown,
  context: string,
): TextRun[][] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((runs, index) =>
    validateTextRuns(runs, `${context}[${index}]`),
  );
}

const LIST_TYPES = ["bullet", "number"] as const;

/** Validates and normalises a single {@link Paragraph}. */
function validateParagraph(input: unknown, context: string): Paragraph {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.text !== "string") {
    throw new DeckValidationError(`${context}.text must be a string`);
  }
  const item: Paragraph = { text: input.text };
  if (input.runs !== undefined) {
    item.runs = validateTextRuns(input.runs, `${context}.runs`);
  }
  if (input.indent !== undefined) {
    if (
      typeof input.indent !== "number" ||
      !Number.isInteger(input.indent) ||
      input.indent < 0 ||
      input.indent > 5
    ) {
      throw new DeckValidationError(`${context}.indent must be an integer 0–5`);
    }
    item.indent = input.indent;
  }
  if (input.listType !== undefined) {
    if (!LIST_TYPES.includes(input.listType as (typeof LIST_TYPES)[number])) {
      throw new DeckValidationError(
        `${context}.listType must be "bullet" or "number"`,
      );
    }
    item.listType = input.listType as Paragraph["listType"];
  }
  return item;
}

/** Validates an array of canonical text paragraphs. */
function validateParagraphs(value: unknown, context: string): Paragraph[] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((item, index) =>
    validateParagraph(item, `${context}[${index}]`),
  );
}

function validateBaseElementFields(
  input: Record<string, unknown>,
  context: string,
): Record<string, unknown> {
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  if (
    typeof input.kind !== "string" ||
    !["text", "visual", "image", "shape", "connector"].includes(input.kind)
  ) {
    throw new DeckValidationError(
      `${context}.kind must be one of: text, visual, image, shape, connector`,
    );
  }
  const box = validateBox(input.box, `${context}.box`);
  const zIndex = validateFiniteNumber(input.zIndex, `${context}.zIndex`);
  rejectRemovedElementFields(input, context);
  return {
    id: input.id,
    kind: input.kind,
    ...(input.role !== undefined
      ? { role: validatePresentationRole(input.role, `${context}.role`) }
      : {}),
    box,
    zIndex,
    ...(input.designOverrides !== undefined
      ? {
          designOverrides: validateDesignOverrides(
            input.designOverrides,
            `${context}.designOverrides`,
          ),
        }
      : {}),
    ...(input.locked !== undefined ? { locked: Boolean(input.locked) } : {}),
    ...(input.hidden !== undefined ? { hidden: Boolean(input.hidden) } : {}),
    ...(input.source !== undefined
      ? { source: validateElementSource(input.source, `${context}.source`) }
      : {}),
  };
}

function validateElementContent(
  kind: string,
  input: unknown,
  context: string,
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (input.kind !== kind) {
    throw new DeckValidationError(`${context}.kind must match element kind`);
  }

  switch (kind) {
    case "text": {
      if (typeof input.text !== "string") {
        throw new DeckValidationError(`${context}.text must be a string`);
      }
      const paragraphs =
        input.paragraphs !== undefined
          ? validateParagraphs(input.paragraphs, `${context}.paragraphs`)
          : [{ text: input.text }];
      const fitMode = validateTextFitMode(input.fitMode, `${context}.fitMode`);
      if (
        input.bulletGap !== undefined &&
        (typeof input.bulletGap !== "number" ||
          !Number.isFinite(input.bulletGap))
      ) {
        throw new DeckValidationError(
          `${context}.bulletGap must be a finite number`,
        );
      }
      if (
        input.bulletIndent !== undefined &&
        (typeof input.bulletIndent !== "number" ||
          !Number.isFinite(input.bulletIndent))
      ) {
        throw new DeckValidationError(
          `${context}.bulletIndent must be a finite number`,
        );
      }
      return {
        kind,
        text: input.text,
        paragraphs,
        ...(input.runs !== undefined
          ? { runs: validateTextRuns(input.runs, `${context}.runs`) }
          : {}),
        ...(fitMode !== undefined ? { fitMode } : {}),
        ...(input.bulletGap !== undefined
          ? { bulletGap: input.bulletGap as number }
          : {}),
        ...(input.bulletIndent !== undefined
          ? { bulletIndent: input.bulletIndent as number }
          : {}),
      };
    }
    case "visual": {
      if (typeof input.visualId !== "string" || input.visualId.length === 0) {
        throw new DeckValidationError(
          `${context}.visualId must be a non-empty string`,
        );
      }
      if (input.alt !== undefined && typeof input.alt !== "string") {
        throw new DeckValidationError(`${context}.alt must be a string`);
      }
      return {
        kind,
        visualId: input.visualId,
        ...(typeof input.styleThemeId === "string" &&
        input.styleThemeId.length > 0
          ? { styleThemeId: input.styleThemeId }
          : {}),
        ...(typeof input.alt === "string" && input.alt.length > 0
          ? { alt: input.alt }
          : {}),
      };
    }
    case "image": {
      if (input.assetId !== undefined && typeof input.assetId !== "string") {
        throw new DeckValidationError(`${context}.assetId must be a string`);
      }
      if (
        (typeof input.src !== "string" || input.src.length === 0) &&
        (typeof input.assetId !== "string" || input.assetId.length === 0)
      ) {
        throw new DeckValidationError(
          `${context}.src or ${context}.assetId must be a non-empty string`,
        );
      }
      if (input.alt !== undefined && typeof input.alt !== "string") {
        throw new DeckValidationError(`${context}.alt must be a string`);
      }
      const crop = validateImageCrop(input.crop, `${context}.crop`);
      return {
        kind,
        ...(typeof input.src === "string" && input.src.length > 0
          ? { src: input.src }
          : {}),
        ...(typeof input.assetId === "string" && input.assetId.length > 0
          ? { assetId: input.assetId }
          : {}),
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(crop !== undefined ? { crop } : {}),
      };
    }
    case "shape": {
      if (
        typeof input.shape !== "string" ||
        !SHAPE_KINDS.includes(input.shape as ShapeKind)
      ) {
        throw new DeckValidationError(
          `${context}.shape must be one of: ${SHAPE_KINDS.join(", ")}`,
        );
      }
      return {
        kind,
        shape: input.shape,
        ...(typeof input.text === "string" ? { text: input.text } : {}),
        ...(input.textRuns !== undefined
          ? { textRuns: validateTextRuns(input.textRuns, `${context}.textRuns`) }
          : {}),
      };
    }
    case "connector": {
      const start = validateConnectorPoint(input.start, `${context}.start`);
      const end = validateConnectorPoint(input.end, `${context}.end`);
      return {
        kind,
        start,
        end,
        ...(input.routing !== undefined &&
        CONNECTOR_ROUTINGS.includes(input.routing as ConnectorRouting)
          ? { routing: input.routing as ConnectorRouting }
          : {}),
      };
    }
    default:
      throw new DeckValidationError(
        `${context}.kind must be one of: text, visual, image, shape, connector`,
      );
  }
}

export function validateElement(input: unknown, context: string): SlideElement {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  const base = validateBaseElementFields(input, context);
  const kind = base.kind as string;
  const content = validateElementContent(
    kind,
    input.content,
    `${context}.content`,
  );
  return { ...base, content } as unknown as SlideElement;
}

export function validateMasterElement(
  input: unknown,
  context: string,
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (input.layer !== "background" && input.layer !== "foreground") {
    throw new DeckValidationError(
      `${context}.layer must be "background" or "foreground"`,
    );
  }
  if (input.locked !== true) {
    throw new DeckValidationError(`${context}.locked must be true`);
  }
  const base = validateBaseElementFields(input, context);
  const kind = base.kind as string;
  const content = validateElementContent(
    kind,
    input.content,
    `${context}.content`,
  );
  return { ...base, layer: input.layer, locked: true, content };
}
