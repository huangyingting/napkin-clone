import auroraPackageJson from "../../../prototypes/slide-themes/packages/aurora.package.json";
import clarityPackageJson from "../../../prototypes/slide-themes/packages/clarity.package.json";
import editorialPackageJson from "../../../prototypes/slide-themes/packages/editorial.package.json";
import monolithPackageJson from "../../../prototypes/slide-themes/packages/monolith.package.json";
import noirPackageJson from "../../../prototypes/slide-themes/packages/noir.package.json";
import oceanPackageJson from "../../../prototypes/slide-themes/packages/ocean.package.json";
import pulsePackageJson from "../../../prototypes/slide-themes/packages/pulse.package.json";
import terraPackageJson from "../../../prototypes/slide-themes/packages/terra.package.json";

import type { DeckV7 } from "./schema";
import type { PresentationDiagnostic } from "./diagnostics";
import { makeDiagnostic } from "./diagnostics";
import type { ThemePackageV1 } from "./theme-package-schema";
import { validateThemePackage } from "./theme-package-schema";
import { NEUTRAL_THEME_PACKAGE } from "./neutral-theme-package";

const RAW_THEME_PACKAGES: readonly unknown[] = [
  clarityPackageJson,
  oceanPackageJson,
  auroraPackageJson,
  monolithPackageJson,
  editorialPackageJson,
  noirPackageJson,
  terraPackageJson,
  pulsePackageJson,
];

const PACKAGE_ALIASES: Record<string, string> = {
  default: "clarity",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validatedPackages(): ThemePackageV1[] {
  const packages: ThemePackageV1[] = [NEUTRAL_THEME_PACKAGE];
  for (const rawPackage of RAW_THEME_PACKAGES) {
    const result = validateThemePackage(rawPackage);
    if (result.valid) {
      packages.push(result.package);
    }
  }
  return packages;
}

export const THEME_PACKAGE_REGISTRY: readonly ThemePackageV1[] =
  validatedPackages();

const PACKAGE_BY_ID = new Map(
  THEME_PACKAGE_REGISTRY.map((themePackage) => [themePackage.id, themePackage]),
);

export type ThemePackageResolution = {
  package: ThemePackageV1;
  requestedPackageId: string;
  fallback: boolean;
  diagnostics: PresentationDiagnostic[];
};

export function resolveThemePackageIdV7(
  packageId: string | null | undefined,
): string {
  if (!packageId) return NEUTRAL_THEME_PACKAGE.id;
  return PACKAGE_ALIASES[packageId] ?? packageId;
}

export function getThemePackageV7(
  packageId: string | null | undefined,
): ThemePackageV1 | undefined {
  return PACKAGE_BY_ID.get(resolveThemePackageIdV7(packageId));
}

export function listThemePackagesV7(): ThemePackageV1[] {
  return THEME_PACKAGE_REGISTRY.map((themePackage) => clone(themePackage));
}

export function resolveThemePackageForDeck(
  deck: Pick<DeckV7, "theme">,
): ThemePackageResolution {
  const requestedPackageId = resolveThemePackageIdV7(deck.theme.packageId);
  const themePackage = PACKAGE_BY_ID.get(requestedPackageId);
  if (themePackage) {
    return {
      package: themePackage,
      requestedPackageId,
      fallback: false,
      diagnostics: [],
    };
  }

  return {
    package: NEUTRAL_THEME_PACKAGE,
    requestedPackageId,
    fallback: true,
    diagnostics: [
      makeDiagnostic(
        "unknown-theme-package",
        "warning",
        `Unknown v7 theme package "${requestedPackageId}". Rendering with Neutral fallback.`,
        {
          path: "theme.packageId",
          details: { themePackageId: requestedPackageId },
        },
      ),
    ],
  };
}
