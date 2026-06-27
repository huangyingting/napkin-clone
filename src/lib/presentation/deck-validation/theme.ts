import type {
  BackgroundTreatment,
  BulletDefaultsToken,
  BulletNumberStyle,
  ColorToken,
  ConnectorDashStyle,
  ConnectorDefaultsToken,
  PresentationRole,
  PresentationTheme,
  FontScale,
  ImageDefaultsToken,
  MasterSlide,
  ShapeToken,
  SpacingToken,
  PresentationRoleToken,
  TypographyToken,
  VisualDefaultsToken,
} from "../presentation-theme-types";
import { isPresentationRole } from "../presentation-theme-resolvers";
import { PRESENTATION_ROLES } from "../presentation-theme-types";
import type { ConnectorArrow, ElementAlign } from "../deck-elements";
import { validateImageFitMode, validateImageMaskShape } from "./media";
import {
  CONNECTOR_ARROWS,
  DeckValidationError,
  ELEMENT_ALIGNS,
  isHexColor,
  isPlainObject,
  validateFiniteNumber,
  validateOpacity,
} from "./shared";

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

export function validateMaster(input: unknown, context: string): MasterSlide {
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
function validatePresentationRoleToken(
  input: unknown,
  context: string,
): PresentationRoleToken {
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
  const token: PresentationRoleToken = {
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
): Partial<Record<PresentationRole, PresentationRoleToken>> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  const roles: Partial<Record<PresentationRole, PresentationRoleToken>> = {};
  for (const key of Object.keys(input)) {
    if (!isPresentationRole(key)) {
      throw new DeckValidationError(
        `${context}.${key} is not a known text role (expected one of: ${PRESENTATION_ROLES.join(
          ", ",
        )})`,
      );
    }
    roles[key] = validatePresentationRoleToken(input[key], `${context}.${key}`);
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
  if (input.fill !== undefined && !isHexColor(input.fill)) {
    throw new DeckValidationError(`${context}.fill must be a hex color`);
  }
  if (input.stroke !== undefined && !isHexColor(input.stroke)) {
    throw new DeckValidationError(`${context}.stroke must be a hex color`);
  }
  const token: ShapeToken = {
    cornerRadiusPt: validateFiniteNumber(
      input.cornerRadiusPt,
      `${context}.cornerRadiusPt`,
    ),
    shadowCss: input.shadowCss,
  };
  if (input.fill !== undefined) token.fill = input.fill as string;
  if (input.stroke !== undefined) token.stroke = input.stroke as string;
  if (input.strokeWidth !== undefined) {
    token.strokeWidth = validateFiniteNumber(
      input.strokeWidth,
      `${context}.strokeWidth`,
    );
  }
  if (input.opacity !== undefined) {
    token.opacity = validateOpacity(input.opacity, `${context}.opacity`);
  }
  return token;
}

const BULLET_NUMBER_STYLES = [
  "decimal",
  "lower-alpha",
  "upper-alpha",
  "lower-roman",
] as const;

function validateBulletDefaults(
  input: unknown,
  context: string,
): BulletDefaultsToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (input.markerColor !== undefined && !isHexColor(input.markerColor)) {
    throw new DeckValidationError(`${context}.markerColor must be a hex color`);
  }
  if (
    input.numberStyle !== undefined &&
    !BULLET_NUMBER_STYLES.includes(input.numberStyle as BulletNumberStyle)
  ) {
    throw new DeckValidationError(
      `${context}.numberStyle must be one of: ${BULLET_NUMBER_STYLES.join(", ")}`,
    );
  }
  const token: BulletDefaultsToken = {};
  if (input.markerColor !== undefined) {
    token.markerColor = input.markerColor as string;
  }
  if (input.gapPct !== undefined) {
    token.gapPct = validateFiniteNumber(input.gapPct, `${context}.gapPct`);
  }
  if (input.indentPct !== undefined) {
    token.indentPct = validateFiniteNumber(
      input.indentPct,
      `${context}.indentPct`,
    );
  }
  if (input.numberStyle !== undefined) {
    token.numberStyle = input.numberStyle as BulletNumberStyle;
  }
  return token;
}

const CONNECTOR_DASH_STYLES = ["solid", "dashed", "dotted"] as const;

function validateConnectorDefaults(
  input: unknown,
  context: string,
): ConnectorDefaultsToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (input.color !== undefined && !isHexColor(input.color)) {
    throw new DeckValidationError(`${context}.color must be a hex color`);
  }
  if (
    input.dash !== undefined &&
    !CONNECTOR_DASH_STYLES.includes(input.dash as ConnectorDashStyle)
  ) {
    throw new DeckValidationError(
      `${context}.dash must be one of: ${CONNECTOR_DASH_STYLES.join(", ")}`,
    );
  }
  const validateArrow = (value: unknown, ctx: string): ConnectorArrow => {
    if (!CONNECTOR_ARROWS.includes(value as ConnectorArrow)) {
      throw new DeckValidationError(
        `${ctx} must be one of: ${CONNECTOR_ARROWS.join(", ")}`,
      );
    }
    return value as ConnectorArrow;
  };
  const token: ConnectorDefaultsToken = {};
  if (input.color !== undefined) token.color = input.color as string;
  if (input.width !== undefined) {
    token.width = validateFiniteNumber(input.width, `${context}.width`);
  }
  if (input.dash !== undefined) token.dash = input.dash as ConnectorDashStyle;
  if (input.startArrow !== undefined) {
    token.startArrow = validateArrow(input.startArrow, `${context}.startArrow`);
  }
  if (input.endArrow !== undefined) {
    token.endArrow = validateArrow(input.endArrow, `${context}.endArrow`);
  }
  return token;
}

function validateVisualDefaults(
  input: unknown,
  context: string,
): VisualDefaultsToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (
    input.styleThemeId !== undefined &&
    typeof input.styleThemeId !== "string"
  ) {
    throw new DeckValidationError(`${context}.styleThemeId must be a string`);
  }
  const token: VisualDefaultsToken = {};
  if (typeof input.styleThemeId === "string" && input.styleThemeId.length > 0) {
    token.styleThemeId = input.styleThemeId;
  }
  if (input.transparentBackground !== undefined) {
    token.transparentBackground = Boolean(input.transparentBackground);
  }
  return token;
}

function validateImageDefaults(
  input: unknown,
  context: string,
): ImageDefaultsToken {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  const token: ImageDefaultsToken = {};
  const fitMode = validateImageFitMode(input.fitMode, `${context}.fitMode`);
  if (fitMode !== undefined) token.fitMode = fitMode;
  const maskShape = validateImageMaskShape(
    input.maskShape,
    `${context}.maskShape`,
  );
  if (maskShape !== undefined) token.maskShape = maskShape;
  if (input.radiusPct !== undefined) {
    token.radiusPct = Math.max(
      0,
      Math.min(
        50,
        validateFiniteNumber(input.radiusPct, `${context}.radiusPct`),
      ),
    );
  }
  if (input.shadow !== undefined) token.shadow = Boolean(input.shadow);
  return token;
}

export function validatePresentationTheme(
  input: unknown,
  context: string,
): PresentationTheme {
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
    ...(input.bullet !== undefined
      ? { bullet: validateBulletDefaults(input.bullet, `${context}.bullet`) }
      : {}),
    ...(input.connector !== undefined
      ? {
          connector: validateConnectorDefaults(
            input.connector,
            `${context}.connector`,
          ),
        }
      : {}),
    ...(input.visual !== undefined
      ? { visual: validateVisualDefaults(input.visual, `${context}.visual`) }
      : {}),
    ...(input.image !== undefined
      ? { image: validateImageDefaults(input.image, `${context}.image`) }
      : {}),
    defaultBackground: validateBackgroundTreatment(
      input.defaultBackground,
      `${context}.defaultBackground`,
    ),
  };
}
