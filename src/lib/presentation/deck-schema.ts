/**
 * Validation for an edited {@link Deck} persisted on a document (`deckJson`).
 *
 * Mirrors the `validateVisual` / `safeParseVisual` pattern in
 * `src/lib/visual/schema.ts`: a strict, throwing `validateDeck` plus a
 * non-throwing `safeParseDeck` wrapper. No Zod, no browser/React deps — fully
 * testable under `node --test`.
 */

import {
  DECK_THEMES,
  IMAGE_FIT_MODES,
  IMAGE_MASK_SHAPES,
  PLACEHOLDER_TYPES,
  SLIDE_LAYOUTS,
  CURRENT_DECK_SCHEMA_VERSION,
  type BaseElement,
  type BulletItem,
  type ConnectorAnchor,
  type ConnectorArrow,
  type ConnectorElement,
  type ConnectorPoint,
  type ConnectorRouting,
  type Deck,
  type DeckTheme,
  type ElementAlign,
  type ElementBox,
  type ImageCrop,
  type ImageFitMode,
  type ImageMaskShape,
  type PlaceholderElement,
  type PlaceholderType,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type SlideLayout as DeckLayout,
  type SlideLayoutHint,
  type SourceRef,
  type TextElementStyle,
  type TextFitMode,
  type TextRun,
} from "./deck";
import {
  DEFAULT_SLIDE_FORMAT,
  SLIDE_FORMATS,
  type SlideFormat,
} from "./slide-format";
import type {
  BackgroundTreatment,
  ColorToken,
  DeckTextRole,
  DeckThemeTokenSet,
  FontScale,
  MasterSlide,
  ShapeToken,
  SpacingToken,
  TextRoleToken,
  TypographyToken,
} from "./deck-theme-tokens";
import { DECK_TEXT_ROLES, isDeckTextRole } from "./deck-theme-tokens";

class DeckValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeckTheme(value: unknown): value is DeckTheme {
  return typeof value === "string" && DECK_THEMES.includes(value as DeckTheme);
}

function isSlideLayoutHint(value: unknown): value is SlideLayoutHint {
  return (
    typeof value === "string" &&
    SLIDE_LAYOUTS.includes(value as SlideLayoutHint)
  );
}

function isSlideFormat(value: unknown): value is SlideFormat {
  return (
    typeof value === "string" && SLIDE_FORMATS.includes(value as SlideFormat)
  );
}

function validateStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new DeckValidationError(`${context}[${index}] must be a string`);
    }
    return entry;
  });
}

const ELEMENT_ALIGNS: readonly ElementAlign[] = ["left", "center", "right"];
const VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
type VerticalAlign = (typeof VERTICAL_ALIGNS)[number];
const SHAPE_KINDS: readonly ShapeKind[] = [
  "rect",
  "ellipse",
  "line",
  "triangle",
];
const CONNECTOR_ANCHORS: readonly ConnectorAnchor[] = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
];
const CONNECTOR_ROUTINGS: readonly ConnectorRouting[] = ["straight", "elbow"];
const CONNECTOR_ARROWS: readonly ConnectorArrow[] = ["none", "arrow", "filled"];
const TEXT_FIT_MODES: readonly TextFitMode[] = [
  "auto-height",
  "fixed-box",
  "shrink-to-fit",
];
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function validatePlaceholderType(
  value: unknown,
  context: string,
): PlaceholderType {
  if (!PLACEHOLDER_TYPES.includes(value as PlaceholderType)) {
    throw new DeckValidationError(
      `${context} must be one of: ${PLACEHOLDER_TYPES.join(", ")}`,
    );
  }
  return value as PlaceholderType;
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

function validateUnitFraction(value: unknown, context: string): number {
  const n = validateFiniteNumber(value, context);
  if (n < 0 || n > 1) {
    throw new DeckValidationError(`${context} must be between 0 and 1`);
  }
  return n;
}

export function validateImageFitMode(
  value: unknown,
  context: string,
): ImageFitMode | undefined {
  if (value === undefined) return undefined;
  if (!IMAGE_FIT_MODES.includes(value as ImageFitMode)) {
    throw new DeckValidationError(
      `${context} must be one of: ${IMAGE_FIT_MODES.join(", ")}`,
    );
  }
  return value as ImageFitMode;
}

export function validateImageMaskShape(
  value: unknown,
  context: string,
): ImageMaskShape | undefined {
  if (value === undefined) return undefined;
  if (!IMAGE_MASK_SHAPES.includes(value as ImageMaskShape)) {
    throw new DeckValidationError(
      `${context} must be one of: ${IMAGE_MASK_SHAPES.join(", ")}`,
    );
  }
  return value as ImageMaskShape;
}

export function validateImageCrop(
  input: unknown,
  context: string,
): ImageCrop | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  return {
    top: validateUnitFraction(input.top, `${context}.top`),
    right: validateUnitFraction(input.right, `${context}.right`),
    bottom: validateUnitFraction(input.bottom, `${context}.bottom`),
    left: validateUnitFraction(input.left, `${context}.left`),
  };
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function validateSourceRef(input: unknown, context: string): SourceRef {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.documentId !== "string" || input.documentId.length === 0) {
    throw new DeckValidationError(
      `${context}.documentId must be a non-empty string`,
    );
  }
  if (typeof input.blockId !== "string" || input.blockId.length === 0) {
    throw new DeckValidationError(
      `${context}.blockId must be a non-empty string`,
    );
  }
  if (
    input.contentHash !== undefined &&
    (typeof input.contentHash !== "string" || input.contentHash.length === 0)
  ) {
    throw new DeckValidationError(
      `${context}.contentHash must be a non-empty string`,
    );
  }
  if (!isIsoTimestamp(input.linkedAt)) {
    throw new DeckValidationError(
      `${context}.linkedAt must be a valid ISO timestamp`,
    );
  }
  if (input.unlinked !== undefined && typeof input.unlinked !== "boolean") {
    throw new DeckValidationError(`${context}.unlinked must be a boolean`);
  }
  if (input.blockKind !== "text" && input.blockKind !== "visual") {
    throw new DeckValidationError(
      `${context}.blockKind must be "text" or "visual"`,
    );
  }
  return {
    documentId: input.documentId,
    blockId: input.blockId,
    ...(typeof input.contentHash === "string"
      ? { contentHash: input.contentHash }
      : {}),
    linkedAt: input.linkedAt,
    ...(input.unlinked !== undefined ? { unlinked: input.unlinked } : {}),
    blockKind: input.blockKind,
  };
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function validateBackgroundTreatment(
  input: unknown,
  context: string,
): BackgroundTreatment {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (input.type === "solid") {
    if (!isHexColor(input.color)) {
      throw new DeckValidationError(`${context}.color must be a hex color`);
    }
    return { type: "solid", color: input.color as string };
  }
  if (input.type === "gradient") {
    if (!isHexColor(input.from)) {
      throw new DeckValidationError(`${context}.from must be a hex color`);
    }
    if (!isHexColor(input.to)) {
      throw new DeckValidationError(`${context}.to must be a hex color`);
    }
    return {
      type: "gradient",
      from: input.from as string,
      to: input.to as string,
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
    return { type: "image", url: input.url as string };
  }
  throw new DeckValidationError(
    `${context}.type must be "solid", "gradient", or "image"`,
  );
}

const LOGO_PLACEMENTS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

function validateMaster(input: unknown, context: string): MasterSlide {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof input.name !== "string" || input.name.length === 0) {
    throw new DeckValidationError(`${context}.name must be a non-empty string`);
  }
  if (typeof input.themeId !== "string") {
    throw new DeckValidationError(`${context}.themeId must be a string`);
  }
  const master: MasterSlide = {
    id: input.id,
    name: input.name,
    themeId: input.themeId,
    showPageNumbers: Boolean(input.showPageNumbers),
  };
  if (input.background !== undefined) {
    master.background = validateBackgroundTreatment(
      input.background,
      `${context}.background`,
    );
  }
  if (input.logoUrl !== undefined) {
    if (typeof input.logoUrl !== "string" || input.logoUrl.length === 0) {
      throw new DeckValidationError(
        `${context}.logoUrl must be a non-empty string`,
      );
    }
    master.logoUrl = input.logoUrl;
  }
  if (input.logoPlacement !== undefined) {
    if (
      !LOGO_PLACEMENTS.includes(
        input.logoPlacement as (typeof LOGO_PLACEMENTS)[number],
      )
    ) {
      throw new DeckValidationError(
        `${context}.logoPlacement must be one of: ${LOGO_PLACEMENTS.join(", ")}`,
      );
    }
    master.logoPlacement = input.logoPlacement as MasterSlide["logoPlacement"];
  }
  if (input.footerText !== undefined) {
    if (typeof input.footerText !== "string") {
      throw new DeckValidationError(`${context}.footerText must be a string`);
    }
    master.footerText = input.footerText;
  }
  return master;
}

const COLOR_TOKEN_KEYS = [
  "slideBg",
  "surface",
  "accent",
  "onBg",
  "onSurface",
  "onAccent",
  "muted",
] as const;

function validateColorToken(input: unknown, context: string): ColorToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  for (const key of COLOR_TOKEN_KEYS) {
    if (!isHexColor(input[key])) {
      throw new DeckValidationError(`${context}.${key} must be a hex color`);
    }
  }
  return {
    slideBg: input.slideBg as string,
    surface: input.surface as string,
    accent: input.accent as string,
    onBg: input.onBg as string,
    onSurface: input.onSurface as string,
    onAccent: input.onAccent as string,
    muted: input.muted as string,
  };
}

const FONT_SCALE_KEYS = ["h1", "h2", "h3", "body", "list", "footer"] as const;

function validateFontScale(input: unknown, context: string): FontScale {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  const scale = {} as FontScale;
  for (const key of FONT_SCALE_KEYS) {
    scale[key] = validateFiniteNumber(input[key], `${context}.${key}`);
  }
  return scale;
}

/** Validates a single semantic-role typography token (#603 / #604). */
function validateTextRoleToken(input: unknown, context: string): TextRoleToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (!isHexColor(input.color)) {
    throw new DeckValidationError(`${context}.color must be a hex color`);
  }
  if (
    input.align !== undefined &&
    !ELEMENT_ALIGNS.includes(input.align as ElementAlign)
  ) {
    throw new DeckValidationError(
      `${context}.align must be one of: ${ELEMENT_ALIGNS.join(", ")}`,
    );
  }
  const token: TextRoleToken = {
    fontSize: validateFiniteNumber(input.fontSize, `${context}.fontSize`),
    color: input.color as string,
    weight: validateFiniteNumber(input.weight, `${context}.weight`),
  };
  if (input.fontFamily !== undefined) {
    if (typeof input.fontFamily !== "string" || input.fontFamily.length === 0) {
      throw new DeckValidationError(
        `${context}.fontFamily must be a non-empty string`,
      );
    }
    token.fontFamily = input.fontFamily;
  }
  if (input.italic !== undefined) token.italic = Boolean(input.italic);
  if (input.underline !== undefined) token.underline = Boolean(input.underline);
  if (input.lineHeight !== undefined) {
    token.lineHeight = validateFiniteNumber(
      input.lineHeight,
      `${context}.lineHeight`,
    );
  }
  if (input.paragraphSpacing !== undefined) {
    token.paragraphSpacing = validateFiniteNumber(
      input.paragraphSpacing,
      `${context}.paragraphSpacing`,
    );
  }
  if (input.align !== undefined) token.align = input.align as ElementAlign;
  return token;
}

/** Validates the optional `typography.roles` map (#604). */
function validateRoleTokenMap(
  input: unknown,
  context: string,
): Partial<Record<DeckTextRole, TextRoleToken>> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  const roles: Partial<Record<DeckTextRole, TextRoleToken>> = {};
  for (const key of Object.keys(input)) {
    if (!isDeckTextRole(key)) {
      throw new DeckValidationError(
        `${context}.${key} is not a known text role (expected one of: ${DECK_TEXT_ROLES.join(
          ", ",
        )})`,
      );
    }
    roles[key] = validateTextRoleToken(input[key], `${context}.${key}`);
  }
  return roles;
}

function validateTypographyToken(
  input: unknown,
  context: string,
): TypographyToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.fontFamily !== "string" || input.fontFamily.length === 0) {
    throw new DeckValidationError(
      `${context}.fontFamily must be a non-empty string`,
    );
  }
  if (
    input.headingFontFamily !== undefined &&
    (typeof input.headingFontFamily !== "string" ||
      input.headingFontFamily.length === 0)
  ) {
    throw new DeckValidationError(
      `${context}.headingFontFamily must be a non-empty string`,
    );
  }
  const typography: TypographyToken = {
    fontFamily: input.fontFamily,
    scale: validateFontScale(input.scale, `${context}.scale`),
  };
  if (input.headingFontFamily !== undefined) {
    typography.headingFontFamily = input.headingFontFamily;
  }
  if (input.roles !== undefined) {
    typography.roles = validateRoleTokenMap(input.roles, `${context}.roles`);
  }
  return typography;
}

function validateSpacingToken(input: unknown, context: string): SpacingToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  return {
    slidePaddingPt: validateFiniteNumber(
      input.slidePaddingPt,
      `${context}.slidePaddingPt`,
    ),
    gridUnitPt: validateFiniteNumber(input.gridUnitPt, `${context}.gridUnitPt`),
  };
}

function validateShapeToken(input: unknown, context: string): ShapeToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.shadowCss !== "string") {
    throw new DeckValidationError(`${context}.shadowCss must be a string`);
  }
  return {
    cornerRadiusPt: validateFiniteNumber(
      input.cornerRadiusPt,
      `${context}.cornerRadiusPt`,
    ),
    shadowCss: input.shadowCss,
  };
}

function validateCustomTokenSet(
  input: unknown,
  context: string,
): DeckThemeTokenSet {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof input.name !== "string" || input.name.length === 0) {
    throw new DeckValidationError(`${context}.name must be a non-empty string`);
  }
  return {
    id: input.id,
    name: input.name,
    colors: validateColorToken(input.colors, `${context}.colors`),
    typography: validateTypographyToken(
      input.typography,
      `${context}.typography`,
    ),
    spacing: validateSpacingToken(input.spacing, `${context}.spacing`),
    shape: validateShapeToken(input.shape, `${context}.shape`),
    defaultBackground: validateBackgroundTreatment(
      input.defaultBackground,
      `${context}.defaultBackground`,
    ),
  };
}

function validateFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DeckValidationError(`${context} must be a finite number`);
  }
  return value;
}

/** Validates an opacity value, clamping to the `[0, 1]` range. */
function validateOpacity(value: unknown, context: string): number {
  const n = validateFiniteNumber(value, context);
  return Math.max(0, Math.min(1, n));
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
    ...(typeof input.fontFamily === "string" && input.fontFamily.length > 0
      ? { fontFamily: input.fontFamily }
      : {}),
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
  if (typeof input.fontFamily === "string" && input.fontFamily.length > 0) {
    out.fontFamily = input.fontFamily;
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

function validateTextRuns(value: unknown, context: string): TextRun[] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((run, index) =>
    validateTextRun(run, `${context}[${index}]`),
  );
}

function validateBulletRuns(value: unknown, context: string): TextRun[][] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((runs, index) =>
    validateTextRuns(runs, `${context}[${index}]`),
  );
}

const LIST_TYPES = ["bullet", "number"] as const;

/** Validates and normalises a single {@link BulletItem} (#335). */
function validateBulletItem(input: unknown, context: string): BulletItem {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.text !== "string") {
    throw new DeckValidationError(`${context}.text must be a string`);
  }
  const item: BulletItem = { text: input.text };
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
    item.listType = input.listType as BulletItem["listType"];
  }
  return item;
}

/** Validates an array of {@link BulletItem}s (#335). */
function validateBulletItems(value: unknown, context: string): BulletItem[] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((item, index) =>
    validateBulletItem(item, `${context}[${index}]`),
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
    case "placeholder": {
      return {
        ...base,
        kind: "placeholder",
        placeholderType: validatePlaceholderType(
          input.placeholderType,
          `${context}.placeholderType`,
        ),
        ...(typeof input.label === "string" && input.label.trim().length > 0
          ? { label: input.label }
          : {}),
      };
    }
    case "text": {
      if (typeof input.text !== "string") {
        throw new DeckValidationError(`${context}.text must be a string`);
      }
      if (input.role !== "title" && input.role !== "body") {
        throw new DeckValidationError(
          `${context}.role must be "title" or "body"`,
        );
      }
      const fitMode = validateTextFitMode(input.fitMode, `${context}.fitMode`);
      return {
        ...base,
        kind: "text",
        text: input.text,
        role: input.role,
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
      };
    }
    case "bullets": {
      const bulletsFitMode = validateTextFitMode(
        input.fitMode,
        `${context}.fitMode`,
      );
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
      const items = validateBulletItems(input.items, `${context}.items`);
      return {
        ...base,
        kind: "bullets",
        bullets: validateStringArray(input.bullets, `${context}.bullets`),
        ...(input.bulletRuns !== undefined
          ? {
              bulletRuns: validateBulletRuns(
                input.bulletRuns,
                `${context}.bulletRuns`,
              ),
            }
          : {}),
        items,
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
        ...(bulletsFitMode !== undefined ? { fitMode: bulletsFitMode } : {}),
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
        `${context}.kind must be one of: placeholder, text, bullets, visual, image, shape, connector`,
      );
  }
}

function validateLayout(input: unknown, context: string): DeckLayout {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof input.name !== "string" || input.name.length === 0) {
    throw new DeckValidationError(`${context}.name must be a non-empty string`);
  }
  if (!isSlideFormat(input.format)) {
    throw new DeckValidationError(
      `${context}.format must be one of: ${SLIDE_FORMATS.join(", ")}`,
    );
  }
  if (!Array.isArray(input.placeholders)) {
    throw new DeckValidationError(`${context}.placeholders must be an array`);
  }
  const placeholders = input.placeholders.map((placeholder, index) => {
    const validated = validateElement(
      placeholder,
      `${context}.placeholders[${index}]`,
    );
    if (validated.kind !== "placeholder") {
      throw new DeckValidationError(
        `${context}.placeholders[${index}] must be a placeholder element`,
      );
    }
    return validated as PlaceholderElement;
  });
  return {
    id: input.id,
    name: input.name,
    format: input.format,
    placeholders,
  };
}

function validateSlide(input: unknown, index: number): Slide {
  const context = `slides[${index}]`;
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }

  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  const id = input.id;

  if (typeof input.index !== "number" || !Number.isFinite(input.index)) {
    throw new DeckValidationError(`${context}.index must be a number`);
  }
  if (typeof input.title !== "string") {
    throw new DeckValidationError(`${context}.title must be a string`);
  }
  const bullets = validateStringArray(input.bullets, `${context}.bullets`);
  const titleRuns =
    input.titleRuns !== undefined
      ? validateTextRuns(input.titleRuns, `${context}.titleRuns`)
      : undefined;
  const bulletRuns =
    input.bulletRuns !== undefined
      ? validateBulletRuns(input.bulletRuns, `${context}.bulletRuns`)
      : undefined;
  const visualIds = validateStringArray(
    input.visualIds,
    `${context}.visualIds`,
  );
  if (!isSlideLayoutHint(input.layout)) {
    throw new DeckValidationError(
      `${context}.layout must be one of: ${SLIDE_LAYOUTS.join(", ")}`,
    );
  }
  if (typeof input.notes !== "string") {
    throw new DeckValidationError(`${context}.notes must be a string`);
  }
  if (!isDeckTheme(input.theme)) {
    throw new DeckValidationError(
      `${context}.theme must be one of: ${DECK_THEMES.join(", ")}`,
    );
  }

  if (!Array.isArray(input.elements)) {
    throw new DeckValidationError(`${context}.elements must be an array`);
  }
  const elements = input.elements.map((element, elementIndex) =>
    validateElement(element, `${context}.elements[${elementIndex}]`),
  );

  if (input.background !== undefined && !isHexColor(input.background)) {
    throw new DeckValidationError(`${context}.background must be a hex color`);
  }
  let backgroundGradient:
    | { from: string; to: string; angle?: number }
    | undefined;
  if (input.backgroundGradient !== undefined) {
    const g = input.backgroundGradient;
    if (!isPlainObject(g) || !isHexColor(g.from) || !isHexColor(g.to)) {
      throw new DeckValidationError(
        `${context}.backgroundGradient.from/to must be hex colors`,
      );
    }
    backgroundGradient = {
      from: g.from,
      to: g.to,
      ...(typeof g.angle === "number" && Number.isFinite(g.angle)
        ? { angle: g.angle }
        : {}),
    };
  }
  if (
    input.backgroundImage !== undefined &&
    (typeof input.backgroundImage !== "string" ||
      input.backgroundImage.length === 0)
  ) {
    throw new DeckValidationError(
      `${context}.backgroundImage must be a non-empty string`,
    );
  }
  if (
    input.backgroundAssetId !== undefined &&
    (typeof input.backgroundAssetId !== "string" ||
      input.backgroundAssetId.length === 0)
  ) {
    throw new DeckValidationError(
      `${context}.backgroundAssetId must be a non-empty string`,
    );
  }
  if (input.accent !== undefined && !isHexColor(input.accent)) {
    throw new DeckValidationError(`${context}.accent must be a hex color`);
  }
  // masterRef — optional non-empty string
  const masterRef =
    typeof input.masterRef === "string" && input.masterRef.length > 0
      ? input.masterRef
      : undefined;
  if (
    input.elementsDerived !== undefined &&
    typeof input.elementsDerived !== "boolean"
  ) {
    throw new DeckValidationError(
      `${context}.elementsDerived must be a boolean`,
    );
  }

  // Preserve a persisted sourceSectionId verbatim — only buildDeckFromBlocks
  // assigns it; validateSlide never backfills or re-derives it.
  const sourceSectionId =
    typeof input.sourceSectionId === "string" &&
    input.sourceSectionId.length > 0
      ? input.sourceSectionId
      : undefined;

  return {
    id,
    index: input.index,
    title: input.title,
    ...(titleRuns !== undefined ? { titleRuns } : {}),
    bullets,
    ...(bulletRuns !== undefined ? { bulletRuns } : {}),
    visualIds,
    layout: input.layout as SlideLayoutHint,
    notes: input.notes,
    theme: input.theme,
    elements,
    ...(input.elementsDerived !== undefined
      ? { elementsDerived: input.elementsDerived as boolean }
      : {}),
    ...(sourceSectionId !== undefined ? { sourceSectionId } : {}),
    ...(input.background !== undefined
      ? { background: input.background as string }
      : {}),
    ...(backgroundGradient !== undefined ? { backgroundGradient } : {}),
    ...(input.backgroundImage !== undefined
      ? { backgroundImage: input.backgroundImage as string }
      : {}),
    ...(input.backgroundAssetId !== undefined
      ? { backgroundAssetId: input.backgroundAssetId as string }
      : {}),
    ...(input.accent !== undefined ? { accent: input.accent as string } : {}),
    ...(masterRef !== undefined ? { masterRef } : {}),
  };
}

/**
 * Validates an unknown value against the deck schema, returning a fully
 * populated `Deck` or throwing a `DeckValidationError` describing the first
 * problem found. A missing top-level `theme` defaults to `"default"`.
 */
function validateDeck(input: unknown): Deck {
  if (!isPlainObject(input)) {
    throw new DeckValidationError("Deck must be an object");
  }

  const theme =
    input.theme === undefined
      ? "default"
      : isDeckTheme(input.theme)
        ? input.theme
        : (() => {
            throw new DeckValidationError(
              `Deck.theme must be one of: ${DECK_THEMES.join(", ")}`,
            );
          })();

  const slideFormat =
    input.slideFormat === undefined
      ? DEFAULT_SLIDE_FORMAT
      : isSlideFormat(input.slideFormat)
        ? input.slideFormat
        : (() => {
            throw new DeckValidationError(
              `Deck.slideFormat must be one of: ${SLIDE_FORMATS.join(", ")}`,
            );
          })();

  if (!Array.isArray(input.slides)) {
    throw new DeckValidationError("Deck.slides must be an array");
  }

  const slides = input.slides.map(validateSlide);
  let layouts: DeckLayout[] | undefined;
  if (input.layouts !== undefined) {
    if (!Array.isArray(input.layouts)) {
      throw new DeckValidationError("Deck.layouts must be an array");
    }
    layouts = input.layouts.map((layout, index) =>
      validateLayout(layout, `Deck.layouts[${index}]`),
    );
  }

  const deck: Deck = {
    slides,
    theme,
    slideFormat,
    ...(layouts !== undefined ? { layouts } : {}),
  };

  if (input.themeId !== undefined) {
    if (typeof input.themeId !== "string") {
      throw new DeckValidationError("Deck.themeId must be a string");
    }
    const trimmedThemeId = input.themeId.trim();
    if (trimmedThemeId.length > 0) {
      deck.themeId = trimmedThemeId;
    }
  }

  if (input.deckContentHash !== undefined) {
    if (typeof input.deckContentHash !== "string") {
      throw new DeckValidationError("Deck.deckContentHash must be a string");
    }
    if (input.deckContentHash.length > 0) {
      deck.deckContentHash = input.deckContentHash;
    }
  }

  if (
    typeof input.schemaVersion !== "number" ||
    !Number.isInteger(input.schemaVersion)
  ) {
    throw new DeckValidationError("Deck.schemaVersion must be an integer");
  }
  if (input.schemaVersion !== CURRENT_DECK_SCHEMA_VERSION) {
    throw new DeckValidationError(
      `Deck.schemaVersion ${input.schemaVersion} is not supported (current: ${CURRENT_DECK_SCHEMA_VERSION})`,
    );
  }
  deck.schemaVersion = input.schemaVersion;

  if (input.masters !== undefined) {
    if (!Array.isArray(input.masters)) {
      throw new DeckValidationError("Deck.masters must be an array");
    }
    const masters: MasterSlide[] = input.masters.map((master, index) =>
      validateMaster(master, `Deck.masters[${index}]`),
    );
    deck.masters = masters;
    // Strip masterRefs pointing to non-existent masters (warn but don't fail)
    const masterIds = new Set(masters.map((m) => m.id));
    deck.slides = deck.slides.map((slide) => {
      if (slide.masterRef !== undefined && !masterIds.has(slide.masterRef)) {
        const { masterRef: _stripped, ...rest } = slide;
        return rest as typeof slide;
      }
      return slide;
    });
  }

  if (input.customTokenSet !== undefined) {
    deck.customTokenSet = validateCustomTokenSet(
      input.customTokenSet,
      "Deck.customTokenSet",
    );
  }

  return deck;
}

export type DeckParseResult =
  | { success: true; data: Deck }
  | { success: false; error: string };

/**
 * Non-throwing wrapper around {@link validateDeck}.
 *
 * Only the current schema version is accepted.
 */
export function safeParseDeck(input: unknown): DeckParseResult {
  try {
    return { success: true, data: validateDeck(input) };
  } catch (error) {
    const message =
      error instanceof DeckValidationError ? error.message : "Invalid deck";
    return { success: false, error: message };
  }
}
