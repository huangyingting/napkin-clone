import type { ThemePackageV1 } from "./theme-package-schema";
import { NEUTRAL_THEME_PACKAGE } from "./neutral-theme-package";

export type ThemeResolutionResult = {
  pkg: ThemePackageV1;
  diagnostic?: string;
};

export type ThemePackageSummary = {
  id: string;
  name: string;
  version: string;
};

const REGISTRY = new Map<string, ThemePackageV1>([
  [NEUTRAL_THEME_PACKAGE.id, NEUTRAL_THEME_PACKAGE],
]);

export function resolveThemePackage(packageId: string): ThemeResolutionResult {
  const pkg = REGISTRY.get(packageId);
  return pkg ? { pkg } : unknownThemePackageResolution(packageId);
}

function unknownThemePackageResolution(
  packageId: string,
): ThemeResolutionResult {
  return {
    pkg: NEUTRAL_THEME_PACKAGE,
    diagnostic: `Theme package "${packageId}" is not registered; using neutral fallback.`,
  };
}

export function registeredThemePackageIds(): string[] {
  return Array.from(REGISTRY.keys());
}

export function hasRegisteredThemePackage(packageId: string): boolean {
  return REGISTRY.has(packageId);
}

export function registeredThemePackageSummaries(): Array<{
  id: string;
  name: string;
  version: string;
}> {
  return Array.from(REGISTRY.values(), ({ id, name, version }) => ({
    id,
    name,
    version,
  }));
}

export function registeredThemePackageCount(): number {
  return REGISTRY.size;
}

export function getRegisteredThemePackage(
  packageId: string,
): ThemePackageV1 | null {
  return REGISTRY.get(packageId) ?? null;
}

export function themePackageResolutionStatus(
  packageId: string,
): "registered" | "fallback" {
  return hasRegisteredThemePackage(packageId) ? "registered" : "fallback";
}

export function describeThemePackageResolution(packageId: string): {
  packageId: string;
  status: "registered" | "fallback";
  resolvedPackageId: string;
  diagnostic?: string;
} {
  const resolution = resolveThemePackage(packageId);
  return {
    packageId,
    status: themePackageResolutionStatus(packageId),
    resolvedPackageId: resolution.pkg.id,
    diagnostic: resolution.diagnostic,
  };
}
