/**
 * Built-in theme package identity catalog shared by v6 presentation flows,
 * v7 package resolution, and the prototype package generator.
 *
 * Full package manifest types stay in their owning runtime modules because v6
 * packages carry Deck/SlideMaster/SlideTemplate data while v7 packages carry
 * ThemePackageV1 manifests and may also resolve custom package ids.
 */

export const BUILT_IN_THEME_PACKAGE_IDS = [
  "clarity",
  "ocean",
  "aurora",
  "monolith",
  "editorial",
  "noir",
  "terra",
  "pulse",
] as const;

export type BuiltInThemePackageId = (typeof BUILT_IN_THEME_PACKAGE_IDS)[number];

export const DEFAULT_BUILT_IN_THEME_PACKAGE_ID: BuiltInThemePackageId =
  "clarity";

export const BUILT_IN_THEME_PACKAGE_ALIASES: Readonly<
  Record<string, BuiltInThemePackageId>
> = {
  default: DEFAULT_BUILT_IN_THEME_PACKAGE_ID,
};

const BUILT_IN_THEME_PACKAGE_ID_SET = new Set<string>(
  BUILT_IN_THEME_PACKAGE_IDS,
);

export function isBuiltInThemePackageId(
  value: unknown,
): value is BuiltInThemePackageId {
  return typeof value === "string" && BUILT_IN_THEME_PACKAGE_ID_SET.has(value);
}

export function resolveBuiltInThemePackageId(
  packageId: string,
): BuiltInThemePackageId | undefined {
  if (isBuiltInThemePackageId(packageId)) return packageId;
  return BUILT_IN_THEME_PACKAGE_ALIASES[packageId];
}
