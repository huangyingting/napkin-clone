import type { Deck } from "./deck";
import type {
  BackgroundTreatment,
  BulletDefaultsToken,
  ColorToken,
  ConnectorDefaultsToken,
  DeckTextRole,
  DeckThemeTokenSet,
  ImageDefaultsToken,
  TextRoleToken,
  TextRoleTokenMap,
  VisualDefaultsToken,
} from "./deck-theme-tokens";
import {
  resolveDeckThemeId,
  resolveDeckThemeTokens,
  resolveRoleToken,
} from "./deck-theme-tokens";

/**
 * Structured patch for editing the global deck template (#614). Every field is
 * optional and shallow-merges over the current (or theme-materialised) token
 * set. Role-token patches merge over the *resolved* role token so a partial
 * edit still yields complete typography.
 */
export interface DeckTemplatePatch {
  colors?: Partial<ColorToken>;
  typography?: {
    fontFamily?: string;
    headingFontFamily?: string;
    roles?: Partial<Record<DeckTextRole, Partial<TextRoleToken>>>;
  };
  defaultBackground?: BackgroundTreatment;
  bullet?: Partial<BulletDefaultsToken>;
  connector?: Partial<ConnectorDefaultsToken>;
  image?: Partial<ImageDefaultsToken>;
  visual?: Partial<VisualDefaultsToken>;
}

function mergeRoleTokens(
  base: DeckThemeTokenSet,
  existing: TextRoleTokenMap | undefined,
  patchRoles: Partial<Record<DeckTextRole, Partial<TextRoleToken>>>,
): TextRoleTokenMap {
  const out: TextRoleTokenMap = { ...(existing ?? {}) };
  for (const key of Object.keys(patchRoles) as DeckTextRole[]) {
    const partial = patchRoles[key];
    if (!partial) continue;
    const baseToken = out[key] ?? resolveRoleToken(base, key);
    out[key] = { ...baseToken, ...partial };
  }
  return out;
}

/**
 * Applies a {@link DeckTemplatePatch} to the deck's global template (#614).
 * When the deck has no `customTokenSet` yet, one is materialised from the
 * current theme's built-in token set first, so editing a template always
 * produces a complete, persistable set. Returns a new deck (immutable).
 */
export function updateDeckTemplate(deck: Deck, patch: DeckTemplatePatch): Deck {
  const themeId = resolveDeckThemeId(deck);
  const base: DeckThemeTokenSet = deck.customTokenSet ?? {
    ...resolveDeckThemeTokens(deck),
    id: `custom:${themeId}`,
    name: `Custom (${themeId})`,
  };
  const next: DeckThemeTokenSet = {
    ...base,
    ...(patch.colors ? { colors: { ...base.colors, ...patch.colors } } : {}),
    ...(patch.typography
      ? {
          typography: {
            ...base.typography,
            ...(patch.typography.fontFamily !== undefined
              ? { fontFamily: patch.typography.fontFamily }
              : {}),
            ...(patch.typography.headingFontFamily !== undefined
              ? { headingFontFamily: patch.typography.headingFontFamily }
              : {}),
            ...(patch.typography.roles
              ? {
                  roles: mergeRoleTokens(
                    base,
                    base.typography.roles,
                    patch.typography.roles,
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(patch.defaultBackground
      ? { defaultBackground: patch.defaultBackground }
      : {}),
    ...(patch.bullet ? { bullet: { ...base.bullet, ...patch.bullet } } : {}),
    ...(patch.connector
      ? { connector: { ...base.connector, ...patch.connector } }
      : {}),
    ...(patch.image ? { image: { ...base.image, ...patch.image } } : {}),
    ...(patch.visual ? { visual: { ...base.visual, ...patch.visual } } : {}),
  };
  return { ...deck, customTokenSet: next };
}

/**
 * Removes the deck's `customTokenSet`, resetting the global template back to the
 * built-in theme (#612 "reset to theme"). Returns a new deck (immutable).
 */
export function resetDeckTemplate(deck: Deck): Deck {
  if (deck.customTokenSet === undefined) return deck;
  const copy = { ...deck };
  delete (copy as { customTokenSet?: unknown }).customTokenSet;
  return copy;
}
