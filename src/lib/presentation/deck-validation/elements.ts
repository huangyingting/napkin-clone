import {
  type BaseElement,
  type Paragraph,
  type ConnectorAnchor,
  type ConnectorArrow,
  type ConnectorElement,
  type ConnectorPoint,
  type ConnectorRouting,
  type ElementAlign,
  type ElementBox,
  type ShapeKind,
  type SlideElement,
  type TextElementStyle,
  type TextFitMode,
  type TextRun,
} from "../deck";
import {
  DECK_TEXT_ROLES,
  isDeckTextRole,
  type DeckTextRole,
} from "../deck-theme-tokens";
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

/** Validates an optional semantic text role field (#605). */
function validateTextRole(input: unknown, context: string): DeckTextRole {
  if (!isDeckTextRole(input)) {
    throw new DeckValidationError(
      `${context} must be one of: ${DECK_TEXT_ROLES.join(", ")}`,
    );
  }
  return input;
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
): BaseElement {
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  const box = validateBox(input.box, `${context}.box`);
  const zIndex = validateFiniteNumber(input.zIndex, `${context}.zIndex`);
  if (input.layoutSlot !== undefined) {
    throw new DeckValidationError(
      `${context}.layoutSlot is no longer supported`,
    );
  }
  return {
    id: input.id,
    box,
    zIndex,
    ...(input.opacity !== undefined
      ? { opacity: validateOpacity(input.opacity, `${context}.opacity`) }
      : {}),
    ...(input.rotation !== undefined
      ? {
          rotation: validateFiniteNumber(input.rotation, `${context}.rotation`),
        }
      : {}),
    ...(input.shadow !== undefined ? { shadow: Boolean(input.shadow) } : {}),
    ...(input.locked !== undefined ? { locked: Boolean(input.locked) } : {}),
    ...(input.hidden !== undefined ? { hidden: Boolean(input.hidden) } : {}),
    ...(typeof input.name === "string" && input.name.length > 0
      ? { name: input.name }
      : {}),
    ...(typeof input.groupId === "string" && input.groupId.length > 0
      ? { groupId: input.groupId }
      : {}),
    ...(input.sourceRef !== undefined
      ? {
          sourceRef: validateSourceRef(input.sourceRef, `${context}.sourceRef`),
        }
      : {}),
  };
}

export function validateElement(input: unknown, context: string): SlideElement {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  const base = validateBaseElementFields(input, context);

  switch (input.kind) {
    case "text": {
      if (typeof input.text !== "string") {
        throw new DeckValidationError(`${context}.text must be a string`);
      }
      const paragraphs = validateParagraphs(
        input.paragraphs,
        `${context}.paragraphs`,
      );
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
        ...base,
        kind: "text",
        text: input.text,
        paragraphs,
        ...(input.runs !== undefined
          ? { runs: validateTextRuns(input.runs, `${context}.runs`) }
          : {}),
        style: validateTextStyle(input.style, `${context}.style`),
        ...(input.textRole !== undefined
          ? {
              textRole: validateTextRole(input.textRole, `${context}.textRole`),
            }
          : {}),
        ...(input.styleOverride !== undefined
          ? {
              styleOverride: validatePartialTextStyle(
                input.styleOverride,
                `${context}.styleOverride`,
              ),
            }
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
      if (
        input.styleThemeId !== undefined &&
        typeof input.styleThemeId !== "string"
      ) {
        throw new DeckValidationError(
          `${context}.styleThemeId must be a string`,
        );
      }
      if (input.alt !== undefined && typeof input.alt !== "string") {
        throw new DeckValidationError(`${context}.alt must be a string`);
      }
      return {
        ...base,
        kind: "visual",
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
      if (typeof input.src !== "string" || input.src.length === 0) {
        throw new DeckValidationError(
          `${context}.src must be a non-empty string`,
        );
      }
      if (input.alt !== undefined && typeof input.alt !== "string") {
        throw new DeckValidationError(`${context}.alt must be a string`);
      }
      if (input.assetId !== undefined && typeof input.assetId !== "string") {
        throw new DeckValidationError(`${context}.assetId must be a string`);
      }
      const fitMode = validateImageFitMode(input.fitMode, `${context}.fitMode`);
      const maskShape = validateImageMaskShape(
        input.maskShape,
        `${context}.maskShape`,
      );
      const crop = validateImageCrop(input.crop, `${context}.crop`);
      return {
        ...base,
        kind: "image",
        src: input.src,
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
        ...(input.radius !== undefined
          ? {
              radius: Math.max(
                0,
                Math.min(
                  50,
                  validateFiniteNumber(input.radius, `${context}.radius`),
                ),
              ),
            }
          : {}),
        ...(fitMode !== undefined ? { fitMode } : {}),
        ...(maskShape !== undefined ? { maskShape } : {}),
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
      if (!isHexColor(input.color)) {
        throw new DeckValidationError(`${context}.color must be a hex color`);
      }
      let stroke: { color: string; width: number } | undefined;
      if (input.stroke !== undefined) {
        if (!isPlainObject(input.stroke) || !isHexColor(input.stroke.color)) {
          throw new DeckValidationError(
            `${context}.stroke.color must be a hex color`,
          );
        }
        stroke = {
          color: input.stroke.color,
          width: Math.max(
            0,
            validateFiniteNumber(input.stroke.width, `${context}.stroke.width`),
          ),
        };
      }
      const radius =
        input.radius !== undefined
          ? Math.max(
              0,
              Math.min(
                50,
                validateFiniteNumber(input.radius, `${context}.radius`),
              ),
            )
          : undefined;
      return {
        ...base,
        kind: "shape",
        shape: input.shape as ShapeKind,
        color: input.color,
        ...(typeof input.text === "string" ? { text: input.text } : {}),
        ...(input.textRuns !== undefined
          ? {
              textRuns: validateTextRuns(input.textRuns, `${context}.textRuns`),
            }
          : {}),
        ...(input.textStyle !== undefined
          ? {
              textStyle: validateTextStyle(
                input.textStyle,
                `${context}.textStyle`,
              ),
            }
          : {}),
        ...(input.textRole !== undefined
          ? {
              textRole: validateTextRole(input.textRole, `${context}.textRole`),
            }
          : {}),
        ...(input.textStyleOverride !== undefined
          ? {
              textStyleOverride: validatePartialTextStyle(
                input.textStyleOverride,
                `${context}.textStyleOverride`,
              ),
            }
          : {}),
        ...(stroke !== undefined ? { stroke } : {}),
        ...(radius !== undefined ? { radius } : {}),
      };
    }
    case "connector": {
      if (!isPlainObject(input.start)) {
        throw new DeckValidationError(`${context}.start must be an object`);
      }
      if (!isPlainObject(input.end)) {
        throw new DeckValidationError(`${context}.end must be an object`);
      }
      const start = validateConnectorPoint(input.start, `${context}.start`);
      const end = validateConnectorPoint(input.end, `${context}.end`);
      const connector: ConnectorElement = {
        ...base,
        kind: "connector",
        start,
        end,
      };
      if (input.stroke !== undefined) {
        if (!isPlainObject(input.stroke) || !isHexColor(input.stroke.color)) {
          throw new DeckValidationError(
            `${context}.stroke.color must be a hex color`,
          );
        }
        connector.stroke = {
          color: input.stroke.color,
          width: Math.max(
            0,
            validateFiniteNumber(input.stroke.width, `${context}.stroke.width`),
          ),
        };
      }
      if (
        input.arrowStart !== undefined &&
        CONNECTOR_ARROWS.includes(input.arrowStart as ConnectorArrow)
      ) {
        connector.arrowStart = input.arrowStart as ConnectorArrow;
      }
      if (
        input.arrowEnd !== undefined &&
        CONNECTOR_ARROWS.includes(input.arrowEnd as ConnectorArrow)
      ) {
        connector.arrowEnd = input.arrowEnd as ConnectorArrow;
      }
      if (input.dash !== undefined) {
        connector.dash = Boolean(input.dash);
      }
      if (
        input.routing !== undefined &&
        CONNECTOR_ROUTINGS.includes(input.routing as ConnectorRouting)
      ) {
        connector.routing = input.routing as ConnectorRouting;
      }
      return connector;
    }
    default:
      throw new DeckValidationError(
        `${context}.kind must be one of: text, visual, image, shape, connector`,
      );
  }
}
