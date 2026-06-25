/**
 * Stable deck theme token facade.
 *
 * R39 splits token schema/data from resolver logic while preserving existing
 * public imports from `deck-theme-tokens`.
 */

export { DECK_TEXT_ROLES } from "./deck-theme-token-types";
export type {
  DeckTextRole,
  TextRoleToken,
  TextRoleTokenMap,
  ColorToken,
  FontScale,
  TypographyToken,
  SpacingToken,
  ShapeToken,
  BulletNumberStyle,
  BulletDefaultsToken,
  ConnectorDashStyle,
  ConnectorDefaultsToken,
  VisualDefaultsToken,
  ImageDefaultsToken,
  BackgroundTreatment,
  DeckThemeTokenSet,
  LogoPlacement,
  MasterSlide,
  OverrideLayer,
} from "./deck-theme-token-types";

export {
  ROLE_TO_SCALE_KEY,
  ROLE_DEFAULT_WEIGHT,
  HEADING_ROLES,
  ROLE_DEFAULT_ALIGN,
  BUILT_IN_TOKEN_SETS,
  TOKEN_SET_BY_ID,
  DEFAULT_TOKEN_SET,
} from "./deck-theme-token-data";

export {
  isDeckTextRole,
  resolveThemeTokens,
  resolveDeckThemeId,
  resolveDeckThemeTokens,
  resolveSlideBackground,
  backgroundTreatmentToCss,
  allThemeTokenSets,
  isBuiltInTheme,
  deriveRoleToken,
  resolveRoleToken,
  resolveBulletDefaults,
  resolveConnectorDefaults,
  resolveImageDefaults,
  resolveVisualDefaults,
} from "./deck-theme-token-resolvers";
export type {
  DeckThemeSource,
  ResolvedBulletDefaults,
  ResolvedConnectorDefaults,
  ResolvedImageDefaults,
  ResolvedVisualDefaults,
} from "./deck-theme-token-resolvers";
