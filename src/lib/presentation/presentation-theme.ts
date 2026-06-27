/**
 * Stable presentation theme token facade.
 *
 * R39 splits token schema/data from resolver logic while preserving existing
 * public imports from `presentation-theme`.
 */

export { PRESENTATION_ROLES } from "./presentation-theme-types";
export type {
  PresentationRole,
  PresentationRoleToken,
  PresentationRoleTokenMap,
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
  PresentationTheme,
  OverrideLayer,
} from "./presentation-theme-types";

export {
  ROLE_TO_SCALE_KEY,
  ROLE_DEFAULT_WEIGHT,
  HEADING_ROLES,
  ROLE_DEFAULT_ALIGN,
  BUILT_IN_TOKEN_SETS,
  TOKEN_SET_BY_ID,
  DEFAULT_TOKEN_SET,
} from "./presentation-theme-data";

export {
  isPresentationRole,
  resolveThemeTokens,
  resolvePresentationThemeId,
  resolvePresentationThemeTokens,
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
} from "./presentation-theme-resolvers";
export type {
  PresentationThemeSource,
  ResolvedBulletDefaults,
  ResolvedConnectorDefaults,
  ResolvedImageDefaults,
  ResolvedVisualDefaults,
} from "./presentation-theme-resolvers";
