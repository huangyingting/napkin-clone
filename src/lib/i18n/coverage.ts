import {
  catalogBySurface,
  DEFAULT_LOCALE,
  I18N_CATALOG_SURFACES,
  SUPPORTED_LOCALES,
  type I18nCatalogSurface,
  type Locale,
} from "./messages";

export const I18N_USER_ACTIVATION_THRESHOLD =
  "100% translated coverage for app shell, dashboard, template picker, document editor core, import/export, and auth/billing settings in every non-default locale.";

export const I18N_REQUIRED_UNCATALOGUED_SURFACES = [
  "documentEditor",
  "importExport",
  "authBilling",
] as const;

export type I18nRequiredUncataloguedSurface =
  (typeof I18N_REQUIRED_UNCATALOGUED_SURFACES)[number];

export type I18nActivationSurface =
  | I18nCatalogSurface
  | I18nRequiredUncataloguedSurface;

export const I18N_ACTIVATION_REQUIRED_SURFACES = [
  "appShell",
  "dashboard",
  "templatePicker",
  ...I18N_REQUIRED_UNCATALOGUED_SURFACES,
] as const satisfies readonly I18nActivationSurface[];

const I18N_ACTIVATION_REQUIRED_SURFACE_SET = new Set<I18nActivationSurface>(
  I18N_ACTIVATION_REQUIRED_SURFACES,
);

const SURFACE_LABELS: Record<I18nActivationSurface, string> = {
  appShell: "App shell and header",
  dashboard: "Dashboard",
  templatePicker: "Template picker",
  languageSwitcher: "Language switcher control",
  documentEditor: "Document editor core",
  importExport: "Import/export flows",
  authBilling: "Authentication and billing settings",
};

export interface I18nSurfaceCoverage {
  surface: I18nActivationSurface;
  label: string;
  locale: Locale;
  catalogued: boolean;
  requiredForUserActivation: boolean;
  translatedMessages: number;
  totalMessages: number;
  coverage: number;
  complete: boolean;
}

export interface I18nActivationStatus {
  threshold: string;
  userActivationReady: boolean;
  requiredSurfaces: readonly I18nActivationSurface[];
  blockingSurfaces: I18nSurfaceCoverage[];
  coverageBySurface: I18nSurfaceCoverage[];
}

function hasMessageValue(value: unknown): boolean {
  if (typeof value === "function") return true;
  return typeof value === "string" && value.trim().length > 0;
}

function cataloguedCoverage(
  surface: I18nCatalogSurface,
  locale: Locale,
): I18nSurfaceCoverage {
  const defaultMessages = catalogBySurface[surface][DEFAULT_LOCALE] as Record<
    string,
    unknown
  >;
  const localeMessages = catalogBySurface[surface][locale] as Record<
    string,
    unknown
  >;
  const keys = Object.keys(defaultMessages);
  const translatedMessages =
    locale === DEFAULT_LOCALE
      ? keys.length
      : keys.filter((key) => hasMessageValue(localeMessages[key])).length;

  return {
    surface,
    label: SURFACE_LABELS[surface],
    locale,
    catalogued: true,
    requiredForUserActivation:
      I18N_ACTIVATION_REQUIRED_SURFACE_SET.has(surface),
    translatedMessages,
    totalMessages: keys.length,
    coverage: keys.length === 0 ? 0 : translatedMessages / keys.length,
    complete: keys.length > 0 && translatedMessages === keys.length,
  };
}

function uncataloguedCoverage(
  surface: I18nRequiredUncataloguedSurface,
  locale: Locale,
): I18nSurfaceCoverage {
  return {
    surface,
    label: SURFACE_LABELS[surface],
    locale,
    catalogued: false,
    requiredForUserActivation: true,
    translatedMessages: 0,
    totalMessages: 0,
    coverage: 0,
    complete: false,
  };
}

export function getI18nCoverageBySurface(
  locale: Locale,
): I18nSurfaceCoverage[] {
  return [
    ...I18N_CATALOG_SURFACES.map((surface) =>
      cataloguedCoverage(surface, locale),
    ),
    ...I18N_REQUIRED_UNCATALOGUED_SURFACES.map((surface) =>
      uncataloguedCoverage(surface, locale),
    ),
  ];
}

export function getI18nActivationStatus(
  locales: readonly Locale[] = SUPPORTED_LOCALES.filter(
    (locale) => locale !== DEFAULT_LOCALE,
  ),
): I18nActivationStatus {
  const coverageBySurface = locales.flatMap((locale) =>
    getI18nCoverageBySurface(locale),
  );
  const blockingSurfaces = coverageBySurface.filter(
    (surface) => surface.requiredForUserActivation && !surface.complete,
  );

  return {
    threshold: I18N_USER_ACTIVATION_THRESHOLD,
    userActivationReady: blockingSurfaces.length === 0,
    requiredSurfaces: I18N_ACTIVATION_REQUIRED_SURFACES,
    blockingSurfaces,
    coverageBySurface,
  };
}
