/**
 * Deck theme token resolvers.
 *
 * All fallback and normalization behavior for token data lives here so the
 * schema/data modules stay declarative. This file is pure and has no React,
 * DOM, or browser dependencies.
 */

import type {
  ConnectorArrow,
  DeckTheme,
  ImageFitMode,
  ImageMaskShape,
} from "@/lib/presentation/deck";
import {
  BUILT_IN_TOKEN_SETS,
  DEFAULT_TOKEN_SET,
  HEADING_ROLES,
  ROLE_DEFAULT_ALIGN,
  ROLE_DEFAULT_WEIGHT,
  ROLE_TO_SCALE_KEY,
  TOKEN_SET_BY_ID,
} from "./deck-theme-token-data";
import {
  DECK_TEXT_ROLES,
  type BackgroundTreatment,
  type BulletNumberStyle,
  type ConnectorDashStyle,
  type DeckTextRole,
  type DeckThemeTokenSet,
  type TextRoleToken,
} from "./deck-theme-token-types";

/** Type guard: is `value` a known {@link DeckTextRole}? */
export function isDeckTextRole(value: unknown): value is DeckTextRole {
  return (
    typeof value === "string" &&
    (DECK_TEXT_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Returns the `DeckThemeTokenSet` for a given `themeId` / `DeckTheme` value.
 * Falls back to {@link DEFAULT_TOKEN_SET} for unknown or absent ids.
 *
 * This is the primary entry point for renderers and exporters to access the
 * token cascade without directly importing the constant array.
 */
export function resolveThemeTokens(themeId?: string | null): DeckThemeTokenSet {
  if (!themeId) return DEFAULT_TOKEN_SET;
  return TOKEN_SET_BY_ID.get(themeId) ?? DEFAULT_TOKEN_SET;
}

/** Minimal deck-shaped source used by theme-token resolvers. */
export interface DeckThemeSource {
  /** Authoritative token-set id for the deck theme cascade. */
  themeId: string;
  /** Custom/brand token set; when present it wins over built-in ids. */
  customTokenSet?: DeckThemeTokenSet;
}

/**
 * Returns the token id that names the deck's current theme source.
 *
 * `themeId` is the authoritative deck-theme key. There is intentionally no
 * fallback to a superseded `theme` field: current deck payloads must carry
 * `themeId`.
 */
export function resolveDeckThemeId(source: DeckThemeSource): string {
  return source.customTokenSet?.id ?? source.themeId;
}

/** Resolves the deck-level token set, preferring custom/brand tokens. */
export function resolveDeckThemeTokens(
  source: DeckThemeSource,
): DeckThemeTokenSet {
  return (
    source.customTokenSet ?? resolveThemeTokens(resolveDeckThemeId(source))
  );
}

/**
 * Returns the resolved `BackgroundTreatment` for a slide, applying the
 * cascade: slide background image → slide overrides → master background →
 * deck theme default background.
 *
 * Accepts the three existing per-slide fields as optional parameters so
 * callers do not need to construct a `BackgroundTreatment` union themselves.
 */
export function resolveSlideBackground(
  tokenSet: DeckThemeTokenSet,
  options: {
    masterBackground?: BackgroundTreatment;
    slideBackground?: string;
    slideBackgroundGradient?: { from: string; to: string; angle?: number };
    slideBackgroundImage?: string;
  } = {},
): BackgroundTreatment {
  const {
    masterBackground,
    slideBackground,
    slideBackgroundGradient,
    slideBackgroundImage,
  } = options;

  if (slideBackgroundImage) {
    return { type: "image", url: slideBackgroundImage };
  }
  if (slideBackgroundGradient) {
    return {
      type: "gradient",
      from: slideBackgroundGradient.from,
      to: slideBackgroundGradient.to,
      angle: slideBackgroundGradient.angle,
    };
  }
  if (slideBackground) {
    return { type: "solid", color: slideBackground };
  }
  return masterBackground ?? tokenSet.defaultBackground;
}

/**
 * Returns a CSS `background` shorthand string from a `BackgroundTreatment`.
 * Suitable for use as an inline `style.background` value in the renderer.
 */
export function backgroundTreatmentToCss(bg: BackgroundTreatment): string {
  switch (bg.type) {
    case "solid":
      return bg.color;
    case "gradient": {
      const angle = bg.angle ?? 135;
      return `linear-gradient(${angle}deg, ${bg.from}, ${bg.to})`;
    }
    case "image":
      return `url(${JSON.stringify(bg.url)}) center / cover no-repeat`;
  }
}

/**
 * Looks up the built-in token set for each registered `DeckTheme` and returns
 * the result.
 */
export function allThemeTokenSets(): DeckThemeTokenSet[] {
  return [...BUILT_IN_TOKEN_SETS];
}

/**
 * Returns `true` when `id` matches one of the built-in token sets.
 * Helps validators distinguish known ids from custom/brand-kit ids.
 */
export function isBuiltInTheme(id: string): id is DeckTheme {
  return TOKEN_SET_BY_ID.has(id);
}

// ---------------------------------------------------------------------------
// Semantic role token resolution (#603 / #602)
// ---------------------------------------------------------------------------

/**
 * Derives a complete {@link TextRoleToken} for `role` from a token set's base
 * {@link FontScale}, font stacks, and color tokens. This guarantees every
 * theme exposes usable role typography even when it omits an explicit
 * `typography.roles` map.
 */
export function deriveRoleToken(
  tokenSet: DeckThemeTokenSet,
  role: DeckTextRole,
): TextRoleToken {
  const { typography, colors } = tokenSet;
  const sizeKey = ROLE_TO_SCALE_KEY[role];
  const fontFamily = HEADING_ROLES.has(role)
    ? (typography.headingFontFamily ?? typography.fontFamily)
    : typography.fontFamily;
  const color =
    role === "footer" || role === "caption" ? colors.muted : colors.onBg;
  return {
    fontFamily,
    fontSize: typography.scale[sizeKey],
    color,
    weight: ROLE_DEFAULT_WEIGHT[role],
    align: ROLE_DEFAULT_ALIGN[role],
  };
}

/**
 * Resolves the effective {@link TextRoleToken} for a role: an explicitly
 * authored `typography.roles[role]` token (merged over derived defaults so a
 * partial authored token still yields complete typography) or, when absent,
 * the fully derived token.
 *
 * Unknown roles are not representable at the type level; callers passing an
 * arbitrary string should guard with {@link isDeckTextRole} and fall back to
 * `"body"`.
 */
export function resolveRoleToken(
  tokenSet: DeckThemeTokenSet,
  role: DeckTextRole,
): TextRoleToken {
  const derived = deriveRoleToken(tokenSet, role);
  const authored = tokenSet.typography.roles?.[role];
  if (!authored) return derived;
  return { ...derived, ...authored };
}

// ---------------------------------------------------------------------------
// Non-text default resolvers (#601)
// ---------------------------------------------------------------------------

/** Fully-resolved bullet defaults (every field present). */
export interface ResolvedBulletDefaults {
  markerColor: string;
  gapPct: number;
  indentPct: number;
  numberStyle: BulletNumberStyle;
}

/**
 * Resolves bullet defaults, filling absent fields with deterministic fallbacks
 * (marker color → accent). Existing rendering is unaffected when `bullet` is
 * absent because these are defaults a consumer opts into.
 */
export function resolveBulletDefaults(
  tokenSet: DeckThemeTokenSet,
): ResolvedBulletDefaults {
  const b = tokenSet.bullet ?? {};
  return {
    markerColor: b.markerColor ?? tokenSet.colors.accent,
    gapPct: b.gapPct ?? 0,
    indentPct: b.indentPct ?? 0,
    numberStyle: b.numberStyle ?? "decimal",
  };
}

/** Fully-resolved connector defaults (every field present). */
export interface ResolvedConnectorDefaults {
  color: string;
  width: number;
  dash: ConnectorDashStyle;
  startArrow: ConnectorArrow;
  endArrow: ConnectorArrow;
}

/** Resolves connector defaults with deterministic fallbacks. */
export function resolveConnectorDefaults(
  tokenSet: DeckThemeTokenSet,
): ResolvedConnectorDefaults {
  const c = tokenSet.connector ?? {};
  return {
    color: c.color ?? tokenSet.colors.onBg,
    width: c.width ?? 0.4,
    dash: c.dash ?? "solid",
    startArrow: c.startArrow ?? "none",
    endArrow: c.endArrow ?? "arrow",
  };
}

/** Fully-resolved image defaults (every field present). */
export interface ResolvedImageDefaults {
  fitMode: ImageFitMode;
  radiusPct: number;
  maskShape: ImageMaskShape;
  shadow: boolean;
}

/** Resolves image defaults with deterministic fallbacks. */
export function resolveImageDefaults(
  tokenSet: DeckThemeTokenSet,
): ResolvedImageDefaults {
  const i = tokenSet.image ?? {};
  return {
    fitMode: i.fitMode ?? "contain",
    radiusPct: i.radiusPct ?? 0,
    maskShape: i.maskShape ?? "none",
    shadow: i.shadow ?? false,
  };
}

/** Fully-resolved visual defaults. `styleThemeId` stays optional. */
export interface ResolvedVisualDefaults {
  styleThemeId?: string;
  transparentBackground: boolean;
}

/** Resolves visual defaults with deterministic fallbacks. */
export function resolveVisualDefaults(
  tokenSet: DeckThemeTokenSet,
): ResolvedVisualDefaults {
  const v = tokenSet.visual ?? {};
  return {
    ...(v.styleThemeId !== undefined ? { styleThemeId: v.styleThemeId } : {}),
    transparentBackground: v.transparentBackground ?? false,
  };
}
