export const THEME_PACKAGE_SOURCE_IDS = [
  "clarity",
  "ocean",
  "aurora",
  "monolith",
  "editorial",
  "noir",
  "terra",
  "pulse",
] as const;

export type ThemePackageSourceId = (typeof THEME_PACKAGE_SOURCE_IDS)[number];
