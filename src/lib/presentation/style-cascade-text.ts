/**
 * Text-bearing element style cascade resolvers.
 *
 * This module owns the deck-token → element-override merge for semantic text
 * roles. The layout and slide layers are represented by materialized element
 * style/override fields before this resolver runs, so origin tracking remains
 * stable for existing public APIs.
 *
 * Unit boundaries: resolved role tokens use point sizes; concrete element
 * TextElementStyle overrides use slide-height percentages in renderer/export
 * adapters. Colors are CSS hex strings and font families are CSS stacks.
 */

import type { Deck, TextElementStyle } from "./deck";
import type { DeckTextRole, DeckThemeTokenSet } from "./deck-theme-tokens";
import { resolveRoleToken } from "./deck-theme-tokens";
import { slideFontCssStack } from "./slide-fonts";
import { resolveDeckTokenSet } from "./style-cascade-layers";

/** Which cascade layer supplied a resolved value (for inspector UI). */
export type StyleOrigin = "deck" | "layout" | "slide" | "element";

/** Fields a {@link ResolvedTextStyle} tracks origin for. */
export type TextStyleField =
  | "fontFamily"
  | "fontSize"
  | "color"
  | "weight"
  | "italic"
  | "underline"
  | "align"
  | "lineHeight"
  | "paragraphSpacing";

/**
 * Final, render/export-ready text style resolved from the deck template role
 * token plus local element overrides.  `fontSize` is in points (the role-token
 * unit), so this is the authoritative typography for export specs; the editor
 * canvas continues to use the element's existing percent-based `style` until
 * fully migrated.
 */
export interface ResolvedTextStyle {
  fontFamily: string;
  /** Point size (role-token unit). */
  fontSize: number;
  color: string;
  /** Numeric weight (100–900). */
  weight: number;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  lineHeight?: number;
  paragraphSpacing?: number;
  /**
   * The role this style resolved from, after applying per-kind defaults for
   * elements that opt into template inheritance without naming a role.
   */
  role: DeckTextRole;
  /** Per-field origin: which cascade layer supplied each value. */
  origin: Record<TextStyleField, StyleOrigin>;
}

/** Default semantic role per text-bearing element kind (#605). */
const ELEMENT_DEFAULT_ROLE = {
  bullet: "bullet",
  shapeLabel: "shapeLabel",
} as const;

/**
 * Core resolver: merges a deck-template role token with an optional local
 * `Partial<TextElementStyle>` override, tracking per-field origin.
 *
 * Override semantics (#605): a present override field wins (`origin: element`);
 * an absent field inherits the role token value (`origin: deck`). Because
 * {@link TextElementStyle} carries `bold` rather than a numeric weight, a
 * present `bold` maps to weight 700 (true) / 400 (false).
 */
export function resolveRoleTextStyle(
  tokenSet: DeckThemeTokenSet,
  role: DeckTextRole,
  override?: Partial<TextElementStyle>,
): ResolvedTextStyle {
  const token = resolveRoleToken(tokenSet, role);
  const o = override ?? {};
  const origin = {} as Record<TextStyleField, StyleOrigin>;

  let fontFamily: string;
  if (o.fontId !== undefined) {
    fontFamily =
      slideFontCssStack(o.fontId) ??
      token.fontFamily ??
      tokenSet.typography.fontFamily;
    origin.fontFamily = "element";
  } else {
    fontFamily = token.fontFamily ?? tokenSet.typography.fontFamily;
    origin.fontFamily = "deck";
  }

  let fontSize: number;
  if (o.fontSize !== undefined) {
    fontSize = o.fontSize;
    origin.fontSize = "element";
  } else {
    fontSize = token.fontSize;
    origin.fontSize = "deck";
  }

  let color: string;
  if (o.color !== undefined) {
    color = o.color;
    origin.color = "element";
  } else {
    color = token.color;
    origin.color = "deck";
  }

  let weight: number;
  if (o.bold !== undefined) {
    weight = o.bold ? 700 : 400;
    origin.weight = "element";
  } else {
    weight = token.weight;
    origin.weight = "deck";
  }

  let italic: boolean;
  if (o.italic !== undefined) {
    italic = o.italic;
    origin.italic = "element";
  } else {
    italic = token.italic ?? false;
    origin.italic = "deck";
  }

  let underline: boolean;
  if (o.underline !== undefined) {
    underline = o.underline;
    origin.underline = "element";
  } else {
    underline = token.underline ?? false;
    origin.underline = "deck";
  }

  let align: "left" | "center" | "right";
  if (o.align !== undefined) {
    align = o.align;
    origin.align = "element";
  } else {
    align = token.align ?? "left";
    origin.align = "deck";
  }

  let lineHeight: number | undefined;
  if (o.lineHeight !== undefined) {
    lineHeight = o.lineHeight;
    origin.lineHeight = "element";
  } else {
    lineHeight = token.lineHeight;
    origin.lineHeight = "deck";
  }

  let paragraphSpacing: number | undefined;
  if (o.paragraphSpacing !== undefined) {
    paragraphSpacing = o.paragraphSpacing;
    origin.paragraphSpacing = "element";
  } else {
    paragraphSpacing = token.paragraphSpacing;
    origin.paragraphSpacing = "deck";
  }

  return {
    fontFamily,
    fontSize,
    color,
    weight,
    italic,
    underline,
    align,
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(paragraphSpacing !== undefined ? { paragraphSpacing } : {}),
    role,
    origin,
  };
}

/** Element shape accepted by the text-bearing resolvers (kind-agnostic). */
interface TextBearingElementLike {
  textRole?: DeckTextRole;
  styleOverride?: Partial<TextElementStyle>;
}

/**
 * Resolves the final style for a `text` element. The role comes from
 * `element.textRole`, defaulting to `"body"` when unset.
 */
export function resolveTextElementStyle(
  deck: Deck,
  element: TextBearingElementLike,
): ResolvedTextStyle {
  const tokenSet = resolveDeckTokenSet(deck);
  const role: DeckTextRole = element.textRole ?? "body";
  return resolveRoleTextStyle(tokenSet, role, element.styleOverride);
}

/**
 * Resolves the final style for a shape label, defaulting to the
 * `"shapeLabel"` role. Shape labels carry their override on
 * `textStyleOverride` rather than `styleOverride`.
 */
export function resolveShapeLabelStyle(
  deck: Deck,
  element: {
    textRole?: DeckTextRole;
    textStyleOverride?: Partial<TextElementStyle>;
  },
): ResolvedTextStyle {
  const tokenSet = resolveDeckTokenSet(deck);
  const role: DeckTextRole =
    element.textRole ?? ELEMENT_DEFAULT_ROLE.shapeLabel;
  return resolveRoleTextStyle(tokenSet, role, element.textStyleOverride);
}
